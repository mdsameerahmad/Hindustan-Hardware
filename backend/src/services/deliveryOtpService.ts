import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomInt } from 'crypto';
import { env } from '../config/env';
import { InternalServerError } from '../common/errors';

const OTP_AAD = Buffer.from('hindustan-hardware:delivery-otp:v1');

const DEV_FALLBACK_OTP_KEY = Buffer.from('S3k89WbFvQ2mPZ5xLrN4yUtA8cDhJe1gMo7qXi9vBtU=', 'base64');

function getOtpKey(): Buffer {
  const configuredKey = env.DELIVERY_OTP_ENCRYPTION_KEY?.trim();
  if (!configuredKey) {
    if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') {
      return DEV_FALLBACK_OTP_KEY;
    }
    throw new InternalServerError('Delivery OTP encryption key is not configured.');
  }

  const key = Buffer.from(configuredKey, 'base64');
  if (key.length !== 32) {
    if (env.NODE_ENV === 'development') {
      return DEV_FALLBACK_OTP_KEY;
    }
    throw new InternalServerError('Delivery OTP encryption key must be a base64-encoded 32-byte key.');
  }
  return key;
}

export interface DeliveryOtpBundle {
  otp: string;
  hash: string;
  ciphertext: string;
}

export function hashDeliveryOtp(otp: string): string {
  return createHmac('sha256', getOtpKey()).update(`delivery-otp:${otp}`).digest('hex');
}

/** Generate a uniformly random six-digit code, a keyed verification digest, and an encrypted display copy. */
export function createDeliveryOtp(): DeliveryOtpBundle {
  const otp = randomInt(0, 1_000_000).toString().padStart(6, '0');
  const key = getOtpKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(OTP_AAD);
  const encrypted = Buffer.concat([cipher.update(otp, 'utf8'), cipher.final()]);
  const ciphertext = [iv, cipher.getAuthTag(), encrypted]
    .map((part) => part.toString('base64url'))
    .join('.');
  const hash = createHmac('sha256', key).update(`delivery-otp:${otp}`).digest('hex');

  return { otp, hash, ciphertext };
}

/** Decrypt the customer display copy. Delivery-partner APIs must never call this. */
export function decryptDeliveryOtp(ciphertext: string): string {
  try {
    const [ivPart, tagPart, encryptedPart, extraPart] = ciphertext.split('.');
    if (!ivPart || !tagPart || !encryptedPart || extraPart !== undefined) throw new Error('Invalid ciphertext format');

    const decipher = createDecipheriv('aes-256-gcm', getOtpKey(), Buffer.from(ivPart, 'base64url'));
    decipher.setAAD(OTP_AAD);
    decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encryptedPart, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new InternalServerError('Delivery OTP could not be retrieved.');
  }
}
