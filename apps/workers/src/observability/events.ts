/**
 * Business-event analytics — workers process (Day 17, chunk 17c).
 *
 * The workers counterpart of `apps/web/lib/observability/events.ts`. Workers
 * have no per-request ALS context, so standard properties (`tenantId` /
 * `userId`) are passed explicitly by the caller.
 *
 * Fire-and-forget: a failed Axiom send never affects job processing.
 */
import { Axiom } from '@axiomhq/js';

import type { EventName, EventPropertyMap } from './event-types';
import { logger } from './logger';

interface EventContext {
  tenantId?: string;
  userId?: string;
}

// The ingest endpoint is REGION-SPECIFIC. The SDK defaults to the US cloud
// (https://api.axiom.co); set AXIOM_URL (e.g. https://api.eu.axiom.co) for a
// dataset in another region. A region mismatch makes every ingest fail with
// HTTP 400, which the SDK would otherwise swallow into console.error; the
// onError hook routes failures through the logger instead. (DEV.75)
let axiomClient: Axiom | null | undefined;
function getAxiomClient(): Axiom | null {
  if (axiomClient === undefined) {
    const token = process.env.AXIOM_TOKEN;
    if (!token) {
      axiomClient = null;
    } else {
      const url = process.env.AXIOM_URL;
      axiomClient = new Axiom({
        token,
        ...(url ? { url } : {}),
        onError: (err) => {
          logger.warn({ err }, 'axiom: ingest failed');
        },
      });
    }
  }
  return axiomClient;
}

/** Record a business event from the workers process. Typed against the taxonomy. */
export function trackEvent<E extends EventName>(
  name: E,
  properties: EventPropertyMap[E],
  context: EventContext = {},
): void {
  const event: Record<string, unknown> = {
    ...properties,
    event: name,
    tenantId: context.tenantId,
    userId: context.userId,
    service: 'workers',
    timestamp: new Date().toISOString(),
  };

  const dataset = process.env.AXIOM_DATASET;
  const axiom = getAxiomClient();
  if (process.env.NODE_ENV === 'production' && axiom && dataset) {
    try {
      void Promise.resolve(axiom.ingest(dataset, [event])).catch((err: unknown) => {
        logger.warn({ err, event: name }, 'axiom: event ingest failed');
      });
    } catch (err) {
      logger.warn({ err, event: name }, 'axiom: event dispatch failed');
    }
    return;
  }
  logger.info(event, `event: ${name}`);
}
