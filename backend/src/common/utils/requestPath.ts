const TRACKING_SHARE_PATH = /(\/api\/v1\/public\/tracking\/)[A-Za-z0-9_-]{43}(?=[/?#]|$)/g;

export function redactTrackingShareToken(path: string): string {
  return path.replace(TRACKING_SHARE_PATH, '$1[redacted]');
}
