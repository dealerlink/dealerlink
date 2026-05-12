/**
 * pg-boss handler — sends one tenant-welcome email.
 *
 * Day 4 invariant: the dispatch logic lives in
 * `apps/web/lib/email/dispatch.ts` (so the operator-app can also pulse it
 * synchronously during onboarding). pg-boss isn't bootstrapped in this
 * milestone; once it lands in Day 5+, register this handler against the
 * `send-tenant-welcome-email` channel. Payload is the row id of the
 * `email_delivery_log` entry the action queued.
 */
export interface SendTenantWelcomeJob {
  emailDeliveryLogId: string;
}

export async function handleSendTenantWelcomeEmail(_job: {
  data: SendTenantWelcomeJob;
}): Promise<void> {
  // Dynamic import keeps the workers process bootable without bundling
  // the web app. Once pg-boss is wired, replace this with a direct
  // import to the shared dispatch helper extracted into `@dealerlink/email`.
  throw new Error(
    'pg-boss bootstrap pending — Day 4 dispatches inline via web. ' +
      'See apps/web/lib/email/dispatch.ts and docs/BUILD_TIMELINE.md (Day 5+).',
  );
}
