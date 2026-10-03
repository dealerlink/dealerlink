export * from './schema';
export { db, adminDb, closeDbConnection, type DrizzleDb } from './client';
export {
  withTenant,
  withTenantUser,
  withOperator,
  setReadOnlyResolver,
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
  dispatchItem,
  deliverItem,
  returnItem,
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
  DISPATCHABLE_FROM as ORDER_DISPATCHABLE_FROM,
  isOrderTransitionAllowed,
  transitionOrder,
  deriveOrderFulfillmentStatus,
  OrderInvalidTransitionError,
  OrderNotFoundError,
  type OrderTransitionOptions,
} from './orders/transitions';
export {
  reserveInventoryForOrder,
  releaseInventoryForOrder,
  InsufficientInventoryError,
  type InventoryShortage,
  type ReserveResult,
  type ReserveLineResult,
} from './orders/reserve';
export {
  ALLOWED_TRANSITIONS as PAYMENT_ALLOWED_TRANSITIONS,
  ALL_PAYMENT_STATUSES,
  ALLOCATABLE_STATUSES as PAYMENT_ALLOCATABLE_STATUSES,
  isPaymentTransitionAllowed,
  transitionPayment,
  PaymentInvalidTransitionError,
  PaymentNotFoundError,
  type PaymentTransitionOptions,
} from './payments/transitions';
export { deriveOrderPaymentStatus } from './payments/propagation';
export { recomputeOrderPaymentStatus, type RecomputeResult } from './payments/recompute';
export {
  createDispatchDb,
  DispatchError,
  type DispatchErrorCode,
  type CreateDispatchDbInput,
  type CreateDispatchDbLine,
  type CreateDispatchDbResult,
} from './dispatch/create';
export {
  markDispatchDeliveredDb,
  returnDispatchDb,
  type MarkDeliveredDbResult,
  type ReturnDispatchDbResult,
} from './dispatch/lifecycle';
// ─────────────────────────────────────────────────────────────────────────────
// './agent-token' IS DELIBERATELY NOT EXPORTED HERE. DO NOT ADD IT BACK.
//
// It imports `node:crypto`, and **this barrel is on the Edge path**:
// `apps/web/lib/tenant/resolve.ts` imports `@dealerlink/db`, and that file is
// documented as "suitable for Next.js Edge middleware" and is inlined into the
// middleware bundle. Webpack cannot resolve a `node:` scheme there, so one
// export line here turned `pnpm build` into:
//
//     Module build failed: UnhandledSchemeError: Reading from "node:crypto"
//     is not handled by plugins (Unhandled scheme).
//     Import trace: node:crypto -> packages/db/src/agent-token.ts
//                   -> packages/db/src/index.ts -> ./lib/tenant/resolve.ts
//
// Re-exporting ANY symbol from that module is enough — the module is loaded to
// satisfy the re-export, so removing only `hashAgentToken` would not have
// helped. Import it by path instead; inside this package that is
// `../src/agent-token` (see `tests/agent-token.test.ts`).
//
// **RESOLVED 2026-10-03 (operator ruling): a SUBPATH EXPORT.**
// `package.json` now has `"./agent-token": "./src/agent-token.ts"`, so
// `apps/web` imports `@dealerlink/db/agent-token` directly.
//
// **WHY THE SUBPATH IS NARROWER THAN THE BARREL IN THE WAY THAT MATTERS:**
// it is reachable only by something that ASKS FOR IT EXPLICITLY. A module that
// imports `"."` — `lib/tenant/resolve.ts`, and whatever else ends up on the
// Edge path — cannot drag `node:crypto` in by accident, because the subpath is
// not part of what `"."` resolves to. **That accidental reachability WAS the
// failure, and this does not reintroduce it.** The import is now a statement of
// intent by a file that has declared `runtime = 'nodejs'`.
//
// Still do not re-add it to the barrel: that would restore exactly the
// accidental path the subpath avoids.
//
// The general problem — nothing inside this package says the barrel is
// Edge-bundled, and only `next build` catches a violation — is FILED, not fixed.
// ─────────────────────────────────────────────────────────────────────────────
