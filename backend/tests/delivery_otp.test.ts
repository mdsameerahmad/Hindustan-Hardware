import { describe, expect, it } from 'vitest';
import { createDeliveryOtp, decryptDeliveryOtp } from '../src/services/deliveryOtpService';

describe('Delivery OTP generation and protected storage', () => {
  it('generates a six-digit OTP and stores only encrypted and keyed representations', () => {
    const result = createDeliveryOtp();

    expect(result.otp).toMatch(/^\d{6}$/);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.ciphertext).not.toContain(result.otp);
    expect(decryptDeliveryOtp(result.ciphertext)).toBe(result.otp);
  });

  it('uses a fresh encryption nonce for every generated OTP', () => {
    const first = createDeliveryOtp();
    const second = createDeliveryOtp();

    expect(second.ciphertext).not.toBe(first.ciphertext);
  });

  it('rejects ciphertext that has been modified', () => {
    const result = createDeliveryOtp();
    const [iv, tag, ciphertext] = result.ciphertext.split('.');
    const changedTag = `${tag.startsWith('A') ? 'B' : 'A'}${tag.slice(1)}`;
    const changedCiphertext = `${iv}.${changedTag}.${ciphertext}`;

    expect(() => decryptDeliveryOtp(changedCiphertext)).toThrow('Delivery OTP could not be retrieved.');
  });
});
