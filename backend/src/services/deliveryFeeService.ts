import { InternalServerError } from '../common/errors';
import { logger } from '../common/utils/logger';
import { SupabaseClient } from '@supabase/supabase-js';

export async function getDeliveryFeesByOrderIds(client: SupabaseClient, orderIds: string[]): Promise<Map<string, number>> {
  const fees = new Map<string, number>();
  if (orderIds.length === 0) return fees;

  const { data, error } = await client
    .from('delivery_assignments')
    .select('order_id, delivery_fee, status, assigned_at')
    .in('order_id', orderIds)
    .in('status', ['assigned', 'picked_up', 'out_for_delivery', 'delivered', 'failed'])
    .order('assigned_at', { ascending: false });

  if (error) {
    logger.error('Failed to retrieve delivery fees for orders', { error: error.message, orderCount: orderIds.length });
    throw new InternalServerError('Unable to retrieve delivery fees.');
  }

  for (const assignment of data || []) {
    if (!fees.has(assignment.order_id)) {
      fees.set(assignment.order_id, Math.max(0, Number(assignment.delivery_fee) || 0));
    }
  }
  return fees;
}

export async function getDeliveryFeeByOrderId(client: SupabaseClient, orderId: string): Promise<number> {
  return (await getDeliveryFeesByOrderIds(client, [orderId])).get(orderId) || 0;
}
