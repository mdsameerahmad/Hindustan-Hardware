import { randomUUID } from 'crypto';
import { BadRequestError, InternalServerError } from '../common/errors';
import { validateImageMagicBytes } from '../common/middleware/imageUpload';
import { logger } from '../common/utils/logger';
import { getSupabaseAdminClient } from '../config/supabase';

const SETTINGS_KEY = 'delivery_payment_qr';
const STORAGE_BUCKET = 'product-images';
const STORAGE_DIRECTORY = 'settings/delivery-payment-qr';

interface PaymentQrSetting {
  imageUrl: string;
  storagePath: string;
  uploadedBy: string;
}

export class PaymentQrService {
  static async get(): Promise<{ imageUrl: string | null; updatedAt: string | null }> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database service is unavailable.');

    const { data, error } = await client
      .from('store_settings')
      .select('setting_value, updated_at')
      .eq('setting_key', SETTINGS_KEY)
      .maybeSingle();

    if (error) {
      logger.error('Failed to retrieve delivery payment QR setting', { error: error.message });
      throw new InternalServerError('Unable to retrieve the delivery payment QR code.');
    }

    const setting = data?.setting_value as Partial<PaymentQrSetting> | null;
    return {
      imageUrl: typeof setting?.imageUrl === 'string' ? setting.imageUrl : null,
      updatedAt: data?.updated_at || null,
    };
  }

  static async upload(
    buffer: Buffer,
    mimeType: string,
    adminId: string
  ): Promise<{ imageUrl: string; updatedAt: string }> {
    const client = getSupabaseAdminClient();
    if (!client) throw new InternalServerError('Administrative database service is unavailable.');

    const image = validateImageMagicBytes(buffer);
    if (!image.isValid || image.mimeType !== mimeType) {
      throw new BadRequestError('The uploaded QR code must be a valid JPEG, PNG, or WebP image.');
    }

    const { data: current, error: currentErr } = await client
      .from('store_settings')
      .select('setting_value')
      .eq('setting_key', SETTINGS_KEY)
      .maybeSingle();

    if (currentErr) {
      logger.error('Failed to read existing delivery payment QR setting', { error: currentErr.message });
      throw new InternalServerError('Unable to prepare the delivery payment QR update.');
    }

    const storagePath = `${STORAGE_DIRECTORY}/${randomUUID()}.${image.extension}`;
    const { error: uploadErr } = await client.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, buffer, { contentType: image.mimeType, upsert: false });

    if (uploadErr) {
      logger.error('Failed to upload delivery payment QR image', {
        error: uploadErr.message,
        storagePath,
      });
      throw new InternalServerError('Unable to upload the delivery payment QR image.');
    }

    const { data: publicUrlData } = client.storage.from(STORAGE_BUCKET).getPublicUrl(storagePath);
    const imageUrl = publicUrlData.publicUrl;
    const updatedAt = new Date().toISOString();
    const settingValue: PaymentQrSetting = {
      imageUrl,
      storagePath,
      uploadedBy: adminId,
    };

    const { error: saveErr } = await client
      .from('store_settings')
      .upsert(
        { setting_key: SETTINGS_KEY, setting_value: settingValue, updated_at: updatedAt },
        { onConflict: 'setting_key' }
      );

    if (saveErr) {
      logger.error('Failed to save delivery payment QR setting', {
        error: saveErr.message,
        storagePath,
      });
      const { error: cleanupErr } = await client.storage.from(STORAGE_BUCKET).remove([storagePath]);
      if (cleanupErr) {
        logger.error('Failed to clean up unsaved delivery payment QR image', {
          error: cleanupErr.message,
          storagePath,
        });
      }
      throw new InternalServerError('Unable to save the delivery payment QR setting.');
    }

    const previousSetting = current?.setting_value as Partial<PaymentQrSetting> | null;
    const previousPath = previousSetting?.storagePath;
    if (typeof previousPath === 'string' && previousPath !== storagePath) {
      const { error: cleanupErr } = await client.storage.from(STORAGE_BUCKET).remove([previousPath]);
      if (cleanupErr) {
        logger.warn('Failed to remove replaced delivery payment QR image', {
          error: cleanupErr.message,
          storagePath: previousPath,
        });
      }
    }

    return { imageUrl, updatedAt };
  }
}
