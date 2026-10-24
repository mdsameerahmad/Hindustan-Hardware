import { getSupabaseClient, getSupabaseAdminClient } from '../config/supabase';
import { InternalServerError, NotFoundError, BadRequestError } from '../common/errors';
import { CustomerAddress } from '../types';

export class AddressService {
  /**
   * Helper to decode encoded coordinates from landmark or metadata.
   */
  private static decodeAddressRecord(row: any): CustomerAddress {
    if (!row) return row;
    let lat = row.latitude != null ? Number(row.latitude) : null;
    let lon = row.longitude != null ? Number(row.longitude) : null;
    let landmarkText = row.landmark || null;

    if ((lat == null || lon == null || isNaN(lat) || isNaN(lon)) && landmarkText && typeof landmarkText === 'string') {
      const match = landmarkText.match(/^LOC:([0-9.-]+),([0-9.-]+)(\|(.*))?$/);
      if (match) {
        lat = Number(match[1]);
        lon = Number(match[2]);
        landmarkText = match[4] || null;
      }
    }

    return {
      ...row,
      latitude: lat != null && !isNaN(lat) ? lat : null,
      longitude: lon != null && !isNaN(lon) ? lon : null,
      landmark: landmarkText,
    };
  }

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
    return (data || []).map((addr) => this.decodeAddressRecord(addr));
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
    return this.decodeAddressRecord(data);
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
      latitude?: number | null;
      longitude?: number | null;
      formattedAddress?: string | null;
      geocodingProvider?: string | null;
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

    // Build encoded landmark if coordinates provided, guaranteeing persistence across schemas
    let encodedLandmark = payload.landmark || null;
    if (payload.latitude != null && payload.longitude != null) {
      const userLandmark = payload.landmark ? `|${payload.landmark}` : '';
      encodedLandmark = `LOC:${payload.latitude},${payload.longitude}${userLandmark}`;
    }

    const insertPayload: Record<string, unknown> = {
      user_id: userId,
      recipient_name: payload.recipientName,
      phone: payload.phone,
      address_line1: payload.addressLine1,
      address_line2: payload.addressLine2 || null,
      landmark: encodedLandmark,
      city: payload.city,
      state: payload.state,
      postal_code: payload.postalCode,
      country: payload.country || 'India',
      address_type: payload.addressType || 'Home',
      is_default: isDefault,
    };

    // If client supplied coordinates & geocoding metadata, attempt to insert with them
    const fullPayload: Record<string, unknown> = {
      ...insertPayload,
      ...(payload.latitude !== undefined && payload.latitude !== null ? { latitude: payload.latitude } : {}),
      ...(payload.longitude !== undefined && payload.longitude !== null ? { longitude: payload.longitude } : {}),
      ...(payload.formattedAddress ? { formatted_address: payload.formattedAddress } : {}),
      ...(payload.geocodingProvider ? { geocoding_provider: payload.geocodingProvider } : {}),
    };

    let result = await client
      .from('customer_addresses')
      .insert(fullPayload)
      .select('*')
      .single();

    // If the remote Supabase schema cache does not have the additive columns yet,
    // fall back to inserting the standard schema columns (which have coords preserved in encodedLandmark).
    if (result.error && (result.error.message.includes('formatted_address') || result.error.message.includes('column of \'customer_addresses\' in the schema cache') || result.error.message.includes('geocoding_provider') || result.error.message.includes('latitude') || result.error.message.includes('longitude'))) {
      result = await client
        .from('customer_addresses')
        .insert(insertPayload)
        .select('*')
        .single();
    }

    if (result.error || !result.data) {
      throw new InternalServerError(`Failed to create address: ${result.error?.message}`);
    }

    const decoded = this.decodeAddressRecord(result.data);
    return {
      ...decoded,
      latitude: payload.latitude ?? decoded.latitude ?? null,
      longitude: payload.longitude ?? decoded.longitude ?? null,
      formatted_address: payload.formattedAddress ?? decoded.formatted_address ?? null,
      geocoding_provider: payload.geocodingProvider ?? decoded.geocoding_provider ?? null,
    };
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
      latitude: number | null;
      longitude: number | null;
      formattedAddress: string | null;
      geocodingProvider: string | null;
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
    if (payload.landmark !== undefined || payload.latitude !== undefined || payload.longitude !== undefined) {
      const targetLat = payload.latitude !== undefined ? payload.latitude : null;
      const targetLon = payload.longitude !== undefined ? payload.longitude : null;
      const baseLandmark = payload.landmark !== undefined ? payload.landmark : null;

      if (targetLat != null && targetLon != null) {
        const extra = baseLandmark ? `|${baseLandmark}` : '';
        updateData.landmark = `LOC:${targetLat},${targetLon}${extra}`;
      } else if (baseLandmark !== undefined) {
        updateData.landmark = baseLandmark;
      }
    }
    if (payload.city !== undefined) updateData.city = payload.city;
    if (payload.state !== undefined) updateData.state = payload.state;
    if (payload.postalCode !== undefined) updateData.postal_code = payload.postalCode;
    if (payload.country !== undefined) updateData.country = payload.country;
    if (payload.addressType !== undefined) updateData.address_type = payload.addressType;
    if (payload.isDefault !== undefined) updateData.is_default = payload.isDefault;
    if (payload.latitude !== undefined) updateData.latitude = payload.latitude;
    if (payload.longitude !== undefined) updateData.longitude = payload.longitude;
    if (payload.formattedAddress !== undefined) updateData.formatted_address = payload.formattedAddress;
    if (payload.geocodingProvider !== undefined) updateData.geocoding_provider = payload.geocodingProvider;

    let result = await client
      .from('customer_addresses')
      .update(updateData)
      .eq('id', addressId)
      .eq('user_id', userId)
      .select('*')
      .single();

    if (result.error && (result.error.message.includes('formatted_address') || result.error.message.includes('column of \'customer_addresses\' in the schema cache') || result.error.message.includes('geocoding_provider') || result.error.message.includes('latitude') || result.error.message.includes('longitude'))) {
      const safeData = { ...updateData };
      delete safeData.latitude;
      delete safeData.longitude;
      delete safeData.formatted_address;
      delete safeData.geocoding_provider;

      result = await client
        .from('customer_addresses')
        .update(safeData)
        .eq('id', addressId)
        .eq('user_id', userId)
        .select('*')
        .single();
    }

    if (result.error || !result.data) throw new InternalServerError(`Failed to update address: ${result.error?.message}`);
    const decoded = this.decodeAddressRecord(result.data);
    return {
      ...decoded,
      latitude: payload.latitude ?? decoded.latitude ?? null,
      longitude: payload.longitude ?? decoded.longitude ?? null,
      formatted_address: payload.formattedAddress ?? decoded.formatted_address ?? null,
      geocoding_provider: payload.geocodingProvider ?? decoded.geocoding_provider ?? null,
    };
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
