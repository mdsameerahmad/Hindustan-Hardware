import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPhoneOrderSchema, createTrackingShareSchema } from '../src/common/validation/adminSchemas';
import { trackingTokenParamSchema } from '../src/common/validation/trackingSchemas';
import { redactTrackingShareToken } from '../src/common/utils/requestPath';
import * as supabaseConfig from '../src/config/supabase';
import { AdminPhoneOrderService } from '../src/services/adminPhoneOrderService';
import { TrackingShareService } from '../src/services/trackingShareService';

const validPhoneOrder = {
  shippingAddress: {
    recipientName: 'A customer',
    phone: '+91 98765 43210',
    addressLine1: '12 Market Road',
    city: 'Jehanabad',
    state: 'Bihar',
    postalCode: '804408',
  },
  items: [{
    productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    quantity: 2,
  }],
};

describe('Phone order and shared tracking validation', () => {
  it('accepts a phone order with a recipient and product items', () => {
    expect(createPhoneOrderSchema.safeParse(validPhoneOrder).success).toBe(true);
  });

  it('rejects duplicate product variants in a phone order', () => {
    const result = createPhoneOrderSchema.safeParse({
      ...validPhoneOrder,
      items: [
        ...validPhoneOrder.items,
        { ...validPhoneOrder.items[0] },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('applies a one-week expiry by default and caps requested duration at 30 days', () => {
    expect(createTrackingShareSchema.parse({}).expiresInHours).toBe(168);
    expect(createTrackingShareSchema.safeParse({ expiresInHours: 721 }).success).toBe(false);
    expect(createTrackingShareSchema.safeParse({ expiresInHours: 0 }).success).toBe(false);
  });

  it('accepts only 32-byte base64url tracking tokens', () => {
    expect(trackingTokenParamSchema.safeParse({ token: 'A'.repeat(43) }).success).toBe(true);
    expect(trackingTokenParamSchema.safeParse({ token: 'short' }).success).toBe(false);
    expect(trackingTokenParamSchema.safeParse({ token: 'A'.repeat(42) + '=' }).success).toBe(false);
  });

  it('redacts share tokens from request paths before they are logged', () => {
    const token = 'A'.repeat(43);
    expect(redactTrackingShareToken(`/api/v1/public/tracking/${token}`))
      .toBe('/api/v1/public/tracking/[redacted]');
    expect(redactTrackingShareToken('/api/v1/admin/orders/123'))
      .toBe('/api/v1/admin/orders/123');
  });
});

describe('TrackingShareService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('stores only a SHA-256 token digest and returns the raw token once for link creation', async () => {
    const shareId = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const expiresAt = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString();
    const insertSingle = vi.fn().mockResolvedValue({
      data: { id: shareId, expires_at: expiresAt },
      error: null,
    });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    const orderMaybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', status: 'pending' },
      error: null,
    });
    const orderEq = vi.fn(() => ({ maybeSingle: orderMaybeSingle }));
    const ordersSelect = vi.fn(() => ({ eq: orderEq }));
    const client = {
      from: vi.fn((table: string) => {
        if (table === 'orders') return { select: ordersSelect };
        if (table === 'tracking_share_links') return { insert };
        throw new Error(`Unexpected table ${table}`);
      }),
    };
    vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue(client as any);

    const result = await TrackingShareService.createShareLink({
      orderId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      actorId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      expiresInHours: 7,
    });

    expect(result.id).toBe(shareId);
    expect(result.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.trackingPath).toBe(`/shared-tracking/${result.token}`);
    expect(result.expiresAt).toBe(expiresAt);

    const inserted = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(inserted.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(inserted.token_hash).not.toBe(result.token);
    expect(inserted.order_id).toBe('cccccccc-cccc-cccc-cccc-cccccccccccc');
  });

  it('rejects malformed or expired-style tokens without querying the database', async () => {
    const adminClient = vi.spyOn(supabaseConfig, 'getSupabaseAdminClient');

    await expect(TrackingShareService.getSharedTracking('not-a-token'))
      .rejects.toMatchObject({ statusCode: 404 });
    expect(adminClient).not.toHaveBeenCalled();
  });
});

describe('AdminPhoneOrderService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends product identifiers and quantities to the atomic database order function without client prices', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { success: true, order_id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', is_duplicate: false },
      error: null,
    });
    vi.spyOn(supabaseConfig, 'getSupabaseAdminClient').mockReturnValue({ rpc } as any);

    const result = await AdminPhoneOrderService.createOrder({
      actorId: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
      shippingAddress: validPhoneOrder.shippingAddress,
      items: validPhoneOrder.items,
      idempotencyKey: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
    });

    expect(result.orderId).toBe('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee');
    expect(result.deliveryOtp).toMatch(/^\d{6}$/);
    expect(rpc).toHaveBeenCalledWith(
      'create_admin_phone_order',
      expect.objectContaining({
        p_actor_id: 'dddddddd-dddd-dddd-dddd-dddddddddddd',
        p_items: [{
          productId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          variantId: null,
          quantity: 2,
        }],
        p_shipping_address: expect.objectContaining({
          recipient_name: 'A customer',
          phone: '+91 98765 43210',
          postal_code: '804408',
        }),
      })
    );
    const rpcPayload = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(JSON.stringify(rpcPayload)).not.toContain('unitPrice');
  });
});
