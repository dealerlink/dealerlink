export * from './schema';
export { db, adminDb, closeDbConnection, type DrizzleDb } from './client';
export {
  withTenant,
  withTenantUser,
  withOperator,
  type DrizzleTx,
  type TenantContextOptions,
} from './with-tenant';
export { nextCounter, nextDealerCode, formatDealerCode } from './helpers/document-counter';
export {
  ALLOWED_TRANSITIONS,
  InvalidTransitionError,
  InventoryItemNotFoundError,
  isAllowed,
  transitionInventoryItem,
  reserveSerials,
  getInventoryItemStatus,
  type InventoryStatus,
  type TransitionPatch,
} from './inventory/transitions';
