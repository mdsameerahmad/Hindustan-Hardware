/**
 * Automated GPS Route Simulator for Live Delivery Tracking
 * 
 * Flow:
 *   Simulator Script -> Existing GPS REST Endpoint (/api/v1/deliveries/:deliveryId/location)
 *     -> DeliveryTrackingService -> Supabase -> Socket.IO -> LiveTrackingCard / LiveTrackingDetailPage
 * 
 * Safety & Architecture:
 *   - Only runs in development/test environments.
 *   - Authenticates through the real partner credentials via Supabase / backend login endpoint.
 *   - Never hardcodes passwords or tokens in code.
 *   - Queries the road route through the existing routing endpoint or interpolates waypoints.
 *   - Respects server-side rate limits, delivery status validation, and device timestamp order.
 *   - Clean shutdown with Ctrl+C (SIGINT).
 * 
 * Usage:
 *   npx tsx scripts/simulate-delivery.ts --deliveryId=<UUID> [options]
 * 
 * Options / Environment Variables:
 *   --deliveryId=<UUID>       Delivery assignment ID (or env SIMULATOR_DELIVERY_ID)
 *   --token=<JWT>             Delivery partner access token (or env SIMULATOR_PARTNER_TOKEN)
 *   --email=<email>           Partner email to auto-login (or env SIMULATOR_PARTNER_EMAIL)
 *   --password=<password>     Partner password to auto-login (or env SIMULATOR_PARTNER_PASSWORD)
 *   --interval=<seconds>      Update interval in seconds (default: 5)
 *   --speed=<multiplier>      Simulation speed multiplier (default: 1)
 *   --apiUrl=<url>            API Base URL (default: http://localhost:5000/api/v1)
 *   --loop                    Loop route when finished (default: false)
 *   --markDeliveredOnFinish   Mark delivery as delivered when reaching destination (default: false)
 */

import dotenv from 'dotenv';
dotenv.config();

interface SimulationConfig {
  deliveryId: string;
  token?: string;
  email?: string;
  password?: string;
  intervalMs: number;
  speedMultiplier: number;
  apiUrl: string;
  loop: boolean;
  markDeliveredOnFinish: boolean;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

// Ensure development or test mode only
const nodeEnv = process.env.NODE_ENV || 'development';
if (nodeEnv === 'production') {
  console.error('[Simulator ERROR] Production Safety Guard: The delivery route simulator cannot be executed in production environment.');
  process.exit(1);
}

// Parse Command-Line Arguments
function parseArgs(): SimulationConfig {
  const args = process.argv.slice(2);
  const argMap = new Map<string, string>();

  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [key, ...rest] = arg.slice(2).split('=');
      argMap.set(key, rest.join('=') || 'true');
    }
  }

  const deliveryId = argMap.get('deliveryId') || process.env.SIMULATOR_DELIVERY_ID || '';
  const token = argMap.get('token') || process.env.SIMULATOR_PARTNER_TOKEN || undefined;
  const email = argMap.get('email') || process.env.SIMULATOR_PARTNER_EMAIL || undefined;
  const password = argMap.get('password') || process.env.SIMULATOR_PARTNER_PASSWORD || undefined;
  const intervalSec = parseFloat(argMap.get('interval') || process.env.SIMULATOR_INTERVAL || '5');
  const speed = parseFloat(argMap.get('speed') || process.env.SIMULATOR_SPEED || '1');
  const apiUrl = (argMap.get('apiUrl') || process.env.SIMULATOR_API_URL || 'http://localhost:5000/api/v1').replace(/\/$/, '');
  const loop = argMap.get('loop') === 'true';
  const markDeliveredOnFinish = argMap.get('markDeliveredOnFinish') === 'true';

  if (!deliveryId) {
    console.error('================================================================');
    console.error(' Automated GPS Route Simulator for Live Delivery Tracking');
    console.error('================================================================');
    console.error('ERROR: Missing required argument: --deliveryId=<UUID>');
    console.error('\nUsage Examples:');
    console.error('  npx tsx scripts/simulate-delivery.ts --deliveryId=631a7ff7-0bc8-43d6-a226-061033230f89 --email=driver@hindustanhardware.com --password="PartnerPass123!"');
    console.error('  npx tsx scripts/simulate-delivery.ts --deliveryId=631a7ff7-0bc8-43d6-a226-061033230f89 --token=eyJhbGciOiJIUzI1NiIs...');
    console.error('\nParameters:');
    console.error('  --deliveryId=<UUID>     Delivery assignment ID (required)');
    console.error('  --email=<email>         Delivery partner login email');
    console.error('  --password=<pass>       Delivery partner login password');
    console.error('  --token=<JWT>           Pre-authenticated delivery partner JWT token');
    console.error('  --interval=<seconds>    Update frequency in seconds (default: 5, server rate limit is 10s window)');
    console.error('  --speed=<multiplier>    Waypoint jump speed multiplier (default: 1)');
    console.error('  --loop                  Restart route after reaching destination (default: false)');
    console.error('================================================================');
    process.exit(1);
  }

  // Ensure interval is at least 3 seconds so we do not breach trackingRateLimiter (10 per 10s)
  const safeIntervalSec = Math.max(intervalSec, 3);

  return {
    deliveryId,
    token,
    email,
    password,
    intervalMs: Math.round(safeIntervalSec * 1000),
    speedMultiplier: Math.max(speed, 0.25),
    apiUrl,
    loop,
    markDeliveredOnFinish,
  };
}

// Haversine distance in meters
function haversineDistanceMeters(c1: Coordinate, c2: Coordinate): number {
  const R = 6371000;
  const dLat = ((c2.latitude - c1.latitude) * Math.PI) / 180;
  const dLon = ((c2.longitude - c1.longitude) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((c1.latitude * Math.PI) / 180) *
      Math.cos((c2.latitude * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Bearing angle in degrees (0 - 360)
function calculateBearing(c1: Coordinate, c2: Coordinate): number {
  const lat1 = (c1.latitude * Math.PI) / 180;
  const lat2 = (c2.latitude * Math.PI) / 180;
  const dLon = ((c2.longitude - c1.longitude) * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

// Subdivide and interpolate route coordinates so simulation progresses smoothly
function subdivideWaypoints(rawCoords: [number, number][], stepMeters: number = 25): Coordinate[] {
  if (rawCoords.length === 0) return [];
  const coords: Coordinate[] = rawCoords.map(([lon, lat]) => ({ latitude: lat, longitude: lon }));
  if (coords.length === 1) return coords;

  const result: Coordinate[] = [coords[0]];

  for (let i = 0; i < coords.length - 1; i++) {
    const start = coords[i];
    const end = coords[i + 1];
    const dist = haversineDistanceMeters(start, end);

    if (dist <= stepMeters) {
      result.push(end);
      continue;
    }

    const steps = Math.floor(dist / stepMeters);
    for (let s = 1; s <= steps; s++) {
      const frac = s / (steps + 1);
      result.push({
        latitude: start.latitude + (end.latitude - start.latitude) * frac,
        longitude: start.longitude + (end.longitude - start.longitude) * frac,
      });
    }
    result.push(end);
  }

  return result;
}

// Generate clearly labeled fallback synthetic path if OSRM is offline
function generateFallbackPath(origin: Coordinate, destination: Coordinate, numPoints: number = 30): Coordinate[] {
  console.log('[Simulator] Note: Generating development-only synthetic straight-line path between origin and destination.');
  const points: Coordinate[] = [];
  for (let i = 0; i <= numPoints; i++) {
    const t = i / numPoints;
    points.push({
      latitude: origin.latitude + (destination.latitude - origin.latitude) * t,
      longitude: origin.longitude + (destination.longitude - origin.longitude) * t,
    });
  }
  return points;
}

async function authenticatePartner(config: SimulationConfig): Promise<string> {
  if (config.token) {
    return config.token;
  }

  if (config.email && config.password) {
    console.log(`[Simulator] Authenticating as delivery partner (${config.email})...`);
    const res = await fetch(`${config.apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: config.email, password: config.password }),
    });

    const json = await res.json() as any;
    if (!res.ok || !json.data?.session?.accessToken) {
      throw new Error(`Authentication failed (${res.status}): ${json.message || json.error || 'Unknown error'}`);
    }

    console.log(`[Simulator] Authentication successful! User ID: ${json.data.user.id}, Role: ${json.data.user.role}`);
    return json.data.session.accessToken;
  }

  throw new Error('No authentication credentials provided. Provide either --token=<JWT> or both --email=<email> and --password=<pass>.');
}

async function verifyAndTransitionAssignment(config: SimulationConfig, token: string): Promise<any> {
  console.log(`[Simulator] Checking assignment status for delivery ID: ${config.deliveryId}...`);

  // Verify delivery route access and fetch road route
  const routeRes = await fetch(`${config.apiUrl}/deliveries/${config.deliveryId}/route`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!routeRes.ok) {
    const errJson = await routeRes.json().catch(() => ({})) as any;
    throw new Error(`Failed to access route for delivery assignment (${routeRes.status}): ${errJson.message || 'Check deliveryId and partner ownership'}`);
  }

  const routeJson = await routeRes.json() as any;
  const routeData = routeJson.data;

  // Check if status needs to be updated to out_for_delivery
  try {
    const assignedRes = await fetch(`${config.apiUrl}/deliveries/assigned?limit=50`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (assignedRes.ok) {
      const assignedJson = await assignedRes.json() as any;
      const target = (assignedJson.data?.items || []).find((i: any) => i.id === config.deliveryId);
      if (target) {
        console.log(`[Simulator] Current Assignment Lifecycle Status: [${target.status.toUpperCase()}]`);
        if (target.status === 'assigned') {
          console.log('[Simulator] Auto-transitioning status: assigned -> picked_up...');
          await fetch(`${config.apiUrl}/deliveries/${config.deliveryId}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: 'picked_up' }),
          });

          console.log('[Simulator] Auto-transitioning status: picked_up -> out_for_delivery...');
          await fetch(`${config.apiUrl}/deliveries/${config.deliveryId}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: 'out_for_delivery' }),
          });
        } else if (target.status === 'picked_up') {
          console.log('[Simulator] Auto-transitioning status: picked_up -> out_for_delivery...');
          await fetch(`${config.apiUrl}/deliveries/${config.deliveryId}/status`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ status: 'out_for_delivery' }),
          });
        }
      }
    }
  } catch (err: any) {
    console.warn('[Simulator] Notice: Status auto-transition check warning:', err.message);
  }

  return routeData;
}

async function sendGpsUpdate(
  apiUrl: string,
  deliveryId: string,
  token: string,
  payload: {
    latitude: number;
    longitude: number;
    accuracy: number;
    speed: number;
    heading: number;
    deviceTimestamp: string;
  }
): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${apiUrl}/deliveries/${deliveryId}/location`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

// Main execution flow
async function runSimulator() {
  const config = parseArgs();

  console.log('\n================================================================');
  console.log(' Starting Automated GPS Route Simulator');
  console.log(' Target Delivery ID   :', config.deliveryId);
  console.log(' Update Interval      :', `${config.intervalMs / 1000}s`);
  console.log(' Speed Multiplier     :', `${config.speedMultiplier}x`);
  console.log(' API Endpoint         :', config.apiUrl);
  console.log(' Loop Mode            :', config.loop ? 'YES' : 'NO');
  console.log('================================================================\n');

  let isRunning = true;
  let intervalTimer: NodeJS.Timeout | null = null;

  // Clean Ctrl+C handling
  const handleExit = () => {
    console.log('\n\n[Simulator] Caught interrupt signal (SIGINT). Terminating simulation cleanly...');
    isRunning = false;
    if (intervalTimer) clearInterval(intervalTimer);
    process.exit(0);
  };
  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  try {
    // 1. Authenticate partner
    const token = await authenticatePartner(config);

    // 2. Verify assignment and fetch road route
    const routeData = await verifyAndTransitionAssignment(config, token);

    let waypoints: Coordinate[] = [];

    if (routeData?.geometry?.coordinates && Array.isArray(routeData.geometry.coordinates) && routeData.geometry.coordinates.length > 0) {
      console.log(`[Simulator] Loaded real road route geometry from OSRM (${routeData.geometry.coordinates.length} route coordinates).`);
      console.log(`[Simulator] Distance: ${(routeData.distanceMeters / 1000).toFixed(2)} km | Est. Duration: ${Math.ceil(routeData.durationSeconds / 60)} mins.`);
      waypoints = subdivideWaypoints(routeData.geometry.coordinates, Math.max(15, 25 * config.speedMultiplier));
    } else {
      console.warn('[Simulator WARNING] Route geometry is unavailable from router. Falling back to development-only synthetic path.');
      const store = routeData?.store || { latitude: 25.215474989473233, longitude: 84.9867635966286 };
      const dest = routeData?.destination || { latitude: 25.2200, longitude: 84.9900 };
      waypoints = generateFallbackPath(store, dest, 25);
    }

    console.log(`[Simulator] Prepared ${waypoints.length} sequential GPS positions along path.`);
    console.log(`[Simulator] You can open the customer live tracking page now to watch real-time movement!`);
    console.log('------------------------------------------------------------------------------------------------------------------------');
    console.log(' Seq | Time (ISO)                | Latitude  | Longitude | Heading | Speed km/h | Status | Server Response');
    console.log('------------------------------------------------------------------------------------------------------------------------');

    let currentIndex = 0;
    let sequenceNumber = 1;
    let lastTimestamp = Date.now();

    const executeStep = async () => {
      if (!isRunning) return;

      if (currentIndex >= waypoints.length) {
        if (config.loop) {
          console.log('\n[Simulator] Loop mode enabled: Resetting to route start point...\n');
          currentIndex = 0;
        } else {
          console.log('\n================================================================');
          console.log('[Simulator] Reached Destination! All route waypoints broadcast.');
          if (config.markDeliveredOnFinish) {
            console.log('[Simulator] Marking delivery as delivered...');
            await fetch(`${config.apiUrl}/deliveries/${config.deliveryId}/status`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ status: 'delivered' }),
            }).catch(() => {});
          }
          console.log('================================================================\n');
          isRunning = false;
          if (intervalTimer) clearInterval(intervalTimer);
          process.exit(0);
        }
      }

      const currentCoord = waypoints[currentIndex];
      const nextCoord = currentIndex < waypoints.length - 1 ? waypoints[currentIndex + 1] : waypoints[currentIndex];
      const heading = calculateBearing(currentCoord, nextCoord);

      // Advance simulated device timestamp forward to guarantee strictly increasing order
      const now = Math.max(Date.now(), lastTimestamp + 1000);
      lastTimestamp = now;
      const deviceTimestamp = new Date(now).toISOString();

      // Plausible speed calculation in m/s (approx 25-45 km/h)
      const speedKmh = 32 * config.speedMultiplier;
      const speedMs = (speedKmh * 1000) / 3600;

      const payload = {
        latitude: Number(currentCoord.latitude.toFixed(6)),
        longitude: Number(currentCoord.longitude.toFixed(6)),
        accuracy: 10,
        speed: Number(speedMs.toFixed(2)),
        heading: Math.round(heading),
        deviceTimestamp,
      };

      try {
        const result = await sendGpsUpdate(config.apiUrl, config.deliveryId, token, payload);
        const statusBadge = result.ok ? '✓ 200' : `✗ ${result.status}`;
        const serverMsg = result.ok
          ? `Synced to Supabase & broadcast to room`
          : (result.body?.message || JSON.stringify(result.body));

        const seqStr = String(sequenceNumber).padStart(4, ' ');
        const latStr = payload.latitude.toFixed(5).padStart(9, ' ');
        const lonStr = payload.longitude.toFixed(5).padStart(9, ' ');
        const headStr = `${payload.heading}°`.padStart(7, ' ');
        const spdStr = `${Math.round(speedKmh)}`.padStart(10, ' ');

        console.log(` ${seqStr} | ${deviceTimestamp} | ${latStr} | ${lonStr} | ${headStr} | ${spdStr} | ${statusBadge.padStart(6, ' ')} | ${serverMsg}`);

        if (!result.ok && result.status === 429) {
          console.warn('[Simulator WARNING] Server rate limit encountered (429). The simulator will automatically wait for the next cycle.');
        } else if (!result.ok && (result.status === 401 || result.status === 403)) {
          console.error('[Simulator FATAL] Authorization error:', result.body);
          isRunning = false;
          if (intervalTimer) clearInterval(intervalTimer);
          process.exit(1);
        }
      } catch (err: any) {
        console.error(`[Simulator ERROR] Network request failed:`, err.message);
      }

      currentIndex++;
      sequenceNumber++;
    };

    // First fix immediately
    await executeStep();

    // Schedule subsequent updates
    intervalTimer = setInterval(executeStep, config.intervalMs);
  } catch (err: any) {
    console.error('\n[Simulator FAILED]:', err.message);
    process.exit(1);
  }
}

runSimulator();
