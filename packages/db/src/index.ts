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
  ALLOWED_TRANSITIONS as INVENTORY_ALLOWED_TRANSITIONS,
  InvalidTransitionError as InventoryInvalidTransitionError,
  InventoryItemNotFoundError,
  isAllowed as isInventoryTransitionAllowed,
  transitionInventoryItem,
  reserveSerials,
  getInventoryItemStatus,
  type InventoryStatus,
  type TransitionPatch,
} from './inventory/transitions';
export {
  ALLOWED_TRANSITIONS as DEAL_ALLOWED_TRANSITIONS,
  ALL_STAGES as DEAL_ALL_STAGES,
  AUTO_TRIGGERED as DEAL_AUTO_TRIGGERED,
  STAGE_NUMBER as DEAL_STAGE_NUMBER,
  InvalidTransitionError as DealInvalidTransitionError,
  HighRiskGuardError,
  DealNotFoundError,
  MissingLostReasonError,
  allowedTargets as dealAllowedTargets,
  breachesHighRiskGuard,
  isAllowed as isDealTransitionAllowed,
  isForward as isDealForward,
  isReverse as isDealReverse,
  transitionStage as transitionDealStageDb,
  type ActorRole as DealActorRole,
  type DealLostReason,
  type DealStage,
  type DealStatus,
  type TransitionOptions as DealTransitionOptions,
} from './deals/transitions';
export {
  ALLOWED_TRANSITIONS as PI_ALLOWED_TRANSITIONS,
  ALL_PI_STATUSES,
  isPiTransitionAllowed,
  transitionPi,
  PiInvalidTransitionError,
  PerformaInvoiceNotFoundError,
  type PiTransitionOptions,
} from './pi/transitions';
export {
  ALLOWED_TRANSITIONS as ORDER_ALLOWED_TRANSITIONS,
  ALL_ORDER_STATUSES,
  CANCELLABLE_FROM as ORDER_CANCELLABLE_FROM,
  isOrderTransitionAllowed,
  transitionOrder,
  OrderInvalidTransitionError,
  OrderNotFoundError,
  type OrderTransitionOptions,
} from './orders/transitions';
