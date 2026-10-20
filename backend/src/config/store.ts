/**
 * Authoritative Store Location Configuration for Hindustan Hardware
 * 
 * Geographic convention:
 * - Coordinates: [longitude, latitude] = [84.982696, 25.213196]
 * - Leaflet order: [latitude, longitude] = [25.213196, 84.982696]
 */

export interface StoreLocationConfig {
  name: string;
  address: string;
  city: string;
  district: string;
  state: string;
  country: string;
  postalCode: string;
  phone: string;
  latitude: number;
  longitude: number;
  location: {
    type: 'Point';
    coordinates: [number, number]; // [longitude, latitude] GeoJSON
  };
  coordinateStatus: 'approximate_locality';
}

export const HINDUSTAN_HARDWARE_STORE: StoreLocationConfig = {
  name: 'Hindustan Hardware',
  address: 'PG Road, Opposite Eidgah',
  city: 'Jehanabad',
  district: 'Jehanabad',
  state: 'Bihar',
  country: 'India',
  postalCode: '804408',
  phone: '+91 94310 00000',
  latitude: 25.213196,
  longitude: 84.982696,
  location: {
    type: 'Point',
    coordinates: [84.982696, 25.213196],
  },
  coordinateStatus: 'approximate_locality',
};
