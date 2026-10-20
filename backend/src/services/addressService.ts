import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, BadRequestError } from '../common/errors';
import { CustomerAddress } from '../types';

export class AddressService {
  /**
   * List all addresses for an authenticated customer, default address first.
   */
  static async getCustomerAddresses(userId: string): Promise<CustomerAddress[]> {
    const supabase = getSupabaseAdminClient() || getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');


    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) throw new InternalServerError(`Failed to fetch customer addresses: ${error.message}`);
    return data || [];
  }

  /**
   * Get single address by ID strictly scoped to user.
   */
  static async getAddressById(userId: string, addressId: string): Promise<CustomerAddress> {
    const supabase = getSupabaseAdminClient() || getSupabaseClient();
    if (!supabase) throw new InternalServerError('Database service is unavailable.');


    const { data, error } = await supabase
      .from('customer_addresses')
      .select('*')
      .eq('id', addressId)
      .eq('user_id', userId)
      .single();

    if (error || !data) throw new NotFoundError('Address not found.');
    return data;
  }

  /**
   * Create new address for customer.
   * If isDefault is true or this is the first address, it sets is_default = true atomically.
   */
  static async createAddress(
    userId: string,
    payload: {
      recipientName: string;
      phone: string;
      addressLine1: string;
      addressLine2?: string | null;
      landmark?: string | null;
      city: string;
      state: string;
      postalCode: string;
      country?: string;
      addressType?: string;
      isDefault?: boolean;
    }
  ): Promise<CustomerAddress> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // Check count of existing addresses
    const existing = await client
      .from('customer_addresses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId);

    let isDefault = payload.isDefault ?? false;
    if ((existing.count || 0) === 0) {
      isDefault = true;
    }

    // If new address is default, clear existing default atomically
    if (isDefault) {
      await client.from('customer_addresses').update({ is_default: false }).eq('user_id', userId);
    }

    const { data, error } = await client
      .from('customer_addresses')
      .insert({
        user_id: userId,
        recipient_name: payload.recipientName,
        phone: payload.phone,
        address_line1: payload.addressLine1,
        address_line2: payload.addressLine2 || null,
        landmark: payload.landmark || null,
        city: payload.city,
        state: payload.state,
        postal_code: payload.postalCode,
        country: payload.country || 'India',
        address_type: payload.addressType || 'Home',
        is_default: isDefault,
      })
      .select('*')
      .single();

    if (error || !data) throw new InternalServerError(`Failed to create address: ${error?.message}`);
    return data;
  }

  /**
   * Update existing address scoped to customer.
   */
  static async updateAddress(
    userId: string,
    addressId: string,
    payload: Partial<{
      recipientName: string;
      phone: string;
      addressLine1: string;
      addressLine2: string | null;
      landmark: string | null;
      city: string;
      state: string;
      postalCode: string;
      country: string;
      addressType: string;
      isDefault: boolean;
    }>
  ): Promise<CustomerAddress> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    // Confirm ownership
    await this.getAddressById(userId, addressId);

    if (payload.isDefault) {
      await client.from('customer_addresses').update({ is_default: false }).eq('user_id', userId);
    }

    const updateData: Record<string, unknown> = {};
    if (payload.recipientName !== undefined) updateData.recipient_name = payload.recipientName;
    if (payload.phone !== undefined) updateData.phone = payload.phone;
    if (payload.addressLine1 !== undefined) updateData.address_line1 = payload.addressLine1;
    if (payload.addressLine2 !== undefined) updateData.address_line2 = payload.addressLine2;
    if (payload.landmark !== undefined) updateData.landmark = payload.landmark;
    if (payload.city !== undefined) updateData.city = payload.city;
    if (payload.state !== undefined) updateData.state = payload.state;
    if (payload.postalCode !== undefined) updateData.postal_code = payload.postalCode;
    if (payload.country !== undefined) updateData.country = payload.country;
    if (payload.addressType !== undefined) updateData.address_type = payload.addressType;
    if (payload.isDefault !== undefined) updateData.is_default = payload.isDefault;

    const { data, error } = await client
      .from('customer_addresses')
      .update(updateData)
      .eq('id', addressId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) throw new InternalServerError(`Failed to update address: ${error?.message}`);
    return data;
  }

  /**
   * Set address as default.
   */
  static async setDefaultAddress(userId: string, addressId: string): Promise<CustomerAddress> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    await this.getAddressById(userId, addressId);

    // 1. Clear current default
    await client.from('customer_addresses').update({ is_default: false }).eq('user_id', userId);

    // 2. Set this address as default
    const { data, error } = await client
      .from('customer_addresses')
      .update({ is_default: true })
      .eq('id', addressId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (error || !data) throw new InternalServerError(`Failed to set default address: ${error?.message}`);
    return data;
  }

  /**
   * Delete address scoped to customer.
   * If the deleted address was default, promote another address if one exists.
   */
  static async deleteAddress(userId: string, addressId: string): Promise<void> {
    const client = getSupabaseAdminClient() || getSupabaseClient();
    if (!client) throw new InternalServerError('Database service is unavailable.');

    const address = await this.getAddressById(userId, addressId);
    const wasDefault = address.is_default;

    const { error } = await client
      .from('customer_addresses')
      .delete()
      .eq('id', addressId)
      .eq('user_id', userId);

    if (error) throw new InternalServerError(`Failed to delete address: ${error.message}`);

    if (wasDefault) {
      const nextAddress = await client
        .from('customer_addresses')
        .select('id')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (nextAddress.data) {
        await client.from('customer_addresses').update({ is_default: true }).eq('id', nextAddress.data.id);
      }
    }
  }
}
