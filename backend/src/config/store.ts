/**
 * Authoritative Store Location Configuration for Hindustan Hardware
 * 
 * Geographic convention:
 * - Coordinates: [longitude, latitude] = [84.9867635966286, 25.215474989473233]
 * - Leaflet order: [latitude, longitude] = [25.215474989473233, 84.9867635966286]
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
  address: 'PG Road, Jehanabad, Bihar 804408',
  city: 'Jehanabad',
  district: 'Jehanabad',
  state: 'Bihar',
  country: 'India',
  postalCode: '804408',
  phone: '+91 94310 00000',
  latitude: 25.215474989473233,
  longitude: 84.9867635966286,
  location: {
    type: 'Point',
    coordinates: [84.9867635966286, 25.215474989473233],
  },
  coordinateStatus: 'approximate_locality',
};
