import { afterEach, describe, expect, it, vi } from 'vitest';
import { GeocodingService } from '../src/services/geocodingService';

describe('Geocoding address search', () => {
  afterEach(() => {
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

  it('correctly uses Photon OSM search for localized address queries', async () => {
    const features = [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [84.987, 25.216] },
      properties: {
        osm_type: 'N',
        osm_id: 3,
        name: 'Local Area Road',
        street: 'Local Area Road',
        city: 'Jehanabad',
        state: 'Bihar',
        country: 'India',
      },
    }];

    vi.spyOn(global, 'fetch').mockImplementation(async () => {
      return new Response(JSON.stringify({ features }), { status: 200 });
    });

    const results = await GeocodingService.searchAddress(
      'Local Area Road',
      { cityBias: 'Jehanabad', limit: 5 },
    );

    expect(results[0].name).toBe('Local Area Road');
    expect(results[0].provider).toBe('Photon-OSM');
  });
});
