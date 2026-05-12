// Single entry point for drizzle-kit + drizzle client.
// This is the one allowed barrel file per CLAUDE.md §19.1 — drizzle-kit
// requires a single schema entrypoint and the db client takes the schema
// as a single namespace.
export * from './tenant';
export * from './tenant-settings';
export * from './user';
export * from './session';
export * from './document-counter';
export * from './audit-log';
export * from './auth-events';
export * from './access-log';
export * from './rate-limit';
export * from './email-delivery-log';
export * from './inbound-token-history';
export * from './dealer';
export * from './product';
export * from './inventory';
export * from './deal';
