import { auditLog, users, withTenant } from '@dealerlink/db';
import { and, desc, eq } from 'drizzle-orm';

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  changedAt: Date;
  changedByName: string | null;
  changedByEmail: string | null;
}

export async function getAuditTrail(
  tenantId: string,
  entityType: string,
  entityId: string,
  limit = 50,
): Promise<AuditEntry[]> {
  return withTenant(tenantId, async (tx) => {
    const rows = await tx
      .select({
        id: auditLog.id,
        entityType: auditLog.entityType,
        entityId: auditLog.entityId,
        action: auditLog.action,
        before: auditLog.before,
        after: auditLog.after,
        changedAt: auditLog.changedAt,
        changedByName: users.fullName,
        changedByEmail: users.email,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.changedBy, users.id))
      .where(
        and(
          eq(auditLog.tenantId, tenantId),
          eq(auditLog.entityType, entityType),
          eq(auditLog.entityId, entityId),
        ),
      )
      .orderBy(desc(auditLog.changedAt))
      .limit(limit);
    return rows as AuditEntry[];
  });
}
