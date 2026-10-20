import { getSupabaseAdminClient, getSupabaseClient } from '../config/supabase';
import { logger } from '../common/utils/logger';

export class AuditLogService {
  /**
   * Records an administrative action in the audit_logs table.
   * Fails gracefully without breaking the primary business transaction.
   */
  static async logAction(params: {
    actorId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, unknown>;
    ipAddress?: string | null;
  }): Promise<void> {
    try {
      const client = getSupabaseAdminClient() || getSupabaseClient();
      if (!client) return;

      await client.from('audit_logs').insert({
        actor_id: params.actorId,
        action: params.action,
        resource_type: params.resourceType,
        resource_id: params.resourceId,
        details: params.details || {},
        ip_address: params.ipAddress || null,
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      logger.error('Failed to write audit log', {
        error: (err as any)?.message,
        action: params.action,
        resourceType: params.resourceType,
      });
    }
  }
}
