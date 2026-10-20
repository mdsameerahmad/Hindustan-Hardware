import { env } from '../../config/env';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'cookie',
  'secret',
  'apikey',
  'api_key',
  'anon_key',
  'service_role_key',
  'key',
];

function sanitize(data: unknown): unknown {
  if (data === null || data === undefined) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitize(item));
  }

  const sanitizedObj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const isSensitive = SENSITIVE_KEYS.some((sensitive) =>
      key.toLowerCase().includes(sensitive)
    );

    if (isSensitive) {
      sanitizedObj[key] = '[REDACTED]';
    } else if (typeof value === 'object') {
      sanitizedObj[key] = sanitize(value);
    } else {
      sanitizedObj[key] = value;
    }
  }

  return sanitizedObj;
}

function formatLog(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  // If structured JSON logging is explicitly requested or in production container logging
  if (env.NODE_ENV === 'production') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(meta ? { meta: sanitize(meta) } : {}),
    };
    return JSON.stringify(logEntry);
  }

  // Clean, readable human-friendly terminal format for development:
  // e.g. [12:35:40] GET /api/v1/products?limit=6 200 (642ms)
  const time = new Date().toLocaleTimeString();
  const colors = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    bold: '\x1b[1m',
  };

  if (meta && (meta.method || meta.statusCode || meta.url)) {
    const method = String(meta.method || 'REQ').padEnd(6);
    const url = String(meta.url || meta.path || '');
    const status = Number(meta.statusCode) || 200;
    const duration = meta.durationMs !== undefined ? `${meta.durationMs}ms` : '';

    let statusColor = colors.green;
    if (status >= 500) statusColor = colors.red;
    else if (status >= 400) statusColor = colors.yellow;
    else if (status >= 300) statusColor = colors.cyan;

    return `${colors.dim}[${time}]${colors.reset} ${colors.cyan}${colors.bold}${method}${colors.reset} ${url} ${statusColor}${colors.bold}${status}${colors.reset} ${colors.dim}(${duration})${colors.reset}`;
  }

  if (level === 'error') {
    const errName = meta?.name ? ` ${meta.name}:` : '';
    const errMsg = meta?.message ? ` ${meta.message}` : '';
    const path = meta?.path ? ` at ${meta.method || ''} ${meta.path}` : '';
    const stack = meta?.stack ? `\n${meta.stack}` : '';
    return `${colors.dim}[${time}]${colors.reset} ${colors.red}${colors.bold}ERROR${colors.reset} ${message}${errName}${errMsg}${path}${stack}`;
  }

  if (level === 'warn') {
    return `${colors.dim}[${time}]${colors.reset} ${colors.yellow}${colors.bold}WARN${colors.reset} ${message} ${meta ? JSON.stringify(sanitize(meta)) : ''}`;
  }

  if (message.includes('Connected') || message.includes('started')) {
    return `${colors.dim}[${time}]${colors.reset} ${colors.green}${colors.bold}INFO${colors.reset}  ${message}`;
  }

  return `${colors.dim}[${time}]${colors.reset} ${colors.cyan}INFO${colors.reset}  ${message}`;
}

export const logger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.log(formatLog('info', message, meta));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(formatLog('warn', message, meta));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(formatLog('error', message, meta));
  },
  debug: (message: string, meta?: Record<string, unknown>) => {
    if (env.NODE_ENV !== 'production') {
      console.debug(formatLog('debug', message, meta));
    }
  },
  sanitize,
};
