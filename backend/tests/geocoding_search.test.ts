import { afterEach, describe, expect, it, vi } from 'vitest';

const { mockEnv } = vi.hoisted(() => ({
  mockEnv: { GOOGLE_MAPS_API_KEY: '' },
}));

vi.mock('../src/config/env', () => ({
  env: mockEnv,
}));

import { GeocodingService } from '../src/services/geocodingService';

describe('Geocoding address search', () => {
  afterEach(() => {
    mockEnv.GOOGLE_MAPS_API_KEY = '';
    vi.restoreAllMocks();
  });

  it('ranks a matching street above a closer unrelated result', async () => {
    const features = [
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [84.987, 25.216] },
        properties: {
          osm_type: 'N',
          osm_id: 1,
          name: 'Nearby Park',
          city: 'Jehanabad',
          state: 'Bihar',
          country: 'India',
        },
      },
      {
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [85.01, 25.7] },
        properties: {
          osm_type: 'W',
          osm_id: 2,
          name: 'Market Road',
          street: 'Market Road',
          city: 'Jehanabad',
          state: 'Bihar',
          country: 'India',
        },
      },
    ];

    vi.spyOn(global, 'fetch').mockImplementation(async () =>
      new Response(JSON.stringify({ features }), { status: 200 }),
    );

    const results = await GeocodingService.searchAddress('Market Road', { cityBias: 'Jehanabad', limit: 5 });

    expect(results[0].name).toBe('Market Road');
    expect(results[0].provider).toBe('Photon-OSM');
  });

  it('falls back to Photon when Google Places returns no matches', async () => {
    mockEnv.GOOGLE_MAPS_API_KEY = 'test-key';
    const features = [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [84.987, 25.216] },
      properties: {
        osm_type: 'N',
        osm_id: 3,
        name: 'Local Area Fallback Road',
        street: 'Local Area Fallback Road',
        city: 'Jehanabad',
        state: 'Bihar',
        country: 'India',
      },
    }];

    vi.spyOn(global, 'fetch').mockImplementation(async (input) => {
      if (String(input).includes('places.googleapis.com')) {
        return new Response(JSON.stringify({ suggestions: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ features }), { status: 200 });
    });

    const results = await GeocodingService.searchAddress(
      'Local Area Fallback Road',
      { cityBias: 'Jehanabad', limit: 5 },
    );

    expect(results[0].name).toBe('Local Area Fallback Road');
    expect(results[0].provider).toBe('Photon-OSM');
  });
});
