import { getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError } from '../common/errors';

export interface CreateBulkInquiryInput {
  fullName: string;
  phone: string;
  email: string | null;
  productDetails: string;
  quantity: string;
  deliveryLocation: string;
  requirements: string | null;
}

export class BulkInquiryService {
  static async create(input: CreateBulkInquiryInput): Promise<{ id: string; createdAt: string }> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database client is unavailable.');

    const { data, error } = await client
      .from('bulk_inquiries')
      .insert({
        full_name: input.fullName,
        phone: input.phone,
        email: input.email,
        product_details: input.productDetails,
        quantity: input.quantity,
        delivery_location: input.deliveryLocation,
        requirements: input.requirements,
      })
      .select('id, created_at')
      .single();

    if (error || !data) {
      throw new InternalServerError(`Failed to save bulk inquiry: ${error?.message || 'No record returned.'}`);
    }

    return { id: data.id, createdAt: data.created_at };
  }

  static async list() {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database client is unavailable.');

    const { data, error } = await client
      .from('bulk_inquiries')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerError(`Failed to load bulk inquiries: ${error.message}`);
    return data || [];
  }

  static async markRead(id: string) {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database client is unavailable.');

    const { data, error } = await client
      .from('bulk_inquiries')
      .update({ status: 'read' })
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) throw new InternalServerError(`Failed to update bulk inquiry: ${error.message}`);
    if (!data) throw new NotFoundError('Bulk inquiry not found.');
    return data;
  }

  static async delete(id: string): Promise<void> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database client is unavailable.');

    const { data, error } = await client
      .from('bulk_inquiries')
      .delete()
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw new InternalServerError(`Failed to delete bulk inquiry: ${error.message}`);
    if (!data) throw new NotFoundError('Bulk inquiry not found.');
  }
}
