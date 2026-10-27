import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import * as supabaseConfig from '../src/config/supabase';
import { hashDeliveryOtp } from '../src/services/deliveryOtpService';

describe('Delivery OTP verification API', () => {
  const app = createApp();
  const deliveryId = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  const partnerId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    rpc = vi.fn();
    vi.spyOn(supabaseConfig, 'isSupabaseConfigured').mockReturnValue(true);
    vi.spyOn(supabaseConfig, 'verifyUserAccessToken').mockResolvedValue({
      data: { user: { id: partnerId, email: 'partner@example.com' } as any },
      error: null,
    });
    vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({
      rpc,
      from: (table: string) => table === 'profiles' ? ({
        select: () => ({
          eq: () => ({
            single: async () => ({
              data: { id: partnerId, role: 'delivery_partner' },
              error: null,
            }),
          }),
        }),
      }) : ({} as any),
    } as any);
  });

  it('sends only an OTP digest to the atomic verification function and returns delivered after success', async () => {
    rpc.mockResolvedValue({
      data: {
        success: true,
        assignmentId: deliveryId,
        orderId: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
        deliveryPartnerId: partnerId,
        customerId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        status: 'delivered',
        assignedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      error: null,
    });

    const response = await request(app)
      .post(`/api/v1/deliveries/${deliveryId}/verify-otp`)
      .set('Authorization', 'Bearer partner-token')
      .send({ otp: '012345' });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('delivered');
    expect(rpc).toHaveBeenCalledWith('verify_delivery_otp', {
      p_assignment_id: deliveryId,
      p_actor_id: partnerId,
      p_otp_hash: hashDeliveryOtp('012345'),
    });
  });

  it('rejects an incorrect OTP and leaves delivery incomplete', async () => {
    rpc.mockResolvedValue({
      data: { success: false, code: 'OTP_INVALID', attemptsRemaining: 2 },
      error: null,
    });

    const response = await request(app)
      .post(`/api/v1/deliveries/${deliveryId}/verify-otp`)
      .set('Authorization', 'Bearer partner-token')
      .send({ otp: '999999' });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toContain('2 attempt(s) remaining');
  });

  it('rejects expired OTPs and blocks direct delivered status updates', async () => {
    rpc.mockResolvedValue({ data: { success: false, code: 'OTP_EXPIRED' }, error: null });

    const expired = await request(app)
      .post(`/api/v1/deliveries/${deliveryId}/verify-otp`)
      .set('Authorization', 'Bearer partner-token')
      .send({ otp: '123456' });

    const bypass = await request(app)
      .patch(`/api/v1/deliveries/${deliveryId}/status`)
      .set('Authorization', 'Bearer partner-token')
      .send({ status: 'delivered' });

    expect(expired.status).toBe(400);
    expect(expired.body.error.message).toContain('expired');
    expect(bypass.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it('requires a six-digit OTP and rejects already-locked attempts', async () => {
    rpc.mockResolvedValue({ data: { success: false, code: 'OTP_LOCKED' }, error: null });

    const malformed = await request(app)
      .post(`/api/v1/deliveries/${deliveryId}/verify-otp`)
      .set('Authorization', 'Bearer partner-token')
      .send({ otp: '12' });
    const locked = await request(app)
      .post(`/api/v1/deliveries/${deliveryId}/verify-otp`)
      .set('Authorization', 'Bearer partner-token')
      .send({ otp: '123456' });

    expect(malformed.status).toBe(400);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(locked.status).toBe(400);
    expect(locked.body.error.message).toContain('locked');
  });
});
