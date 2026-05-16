/**
 * Business-event analytics (Day 17, chunk 17c).
 *
 * `trackEvent` records a typed business event (login, quotation created,
 * payment recorded…). It is **fire-and-forget**: the caller never awaits, and
 * a failed Axiom send can never affect the user-facing request.
 *
 * Destinations:
 *   - prod + AXIOM_TOKEN/AXIOM_DATASET set → Axiom (`dealerlink-events`).
 *   - otherwise (dev, or unconfigured prod) → the structured logger, so the
 *     event is still visible in the dev terminal.
 *
 * Standard properties (`tenantId` / `userId` / `role` / `service` /
 * `timestamp`) are auto-attached from the ALS log context — call sites only
 * pass the event-specific properties.
 *
 * This is analytics, NOT the audit trail. `audit_log` remains the source of
 * truth for who-did-what (see event-types.ts).
 */
import { Axiom } from '@axiomhq/js';

import { getLogContext } from './als';
import type { EventName, EventPropertyMap } from './event-types';
import { logger } from './logger';

export interface TrackedEvent {
  event: EventName;
  /** From the ALS context — `undefined` outside a request scope. */
  tenantId: string | undefined;
  userId: string | undefined;
  role: string | undefined;
  service: 'web';
  timestamp: string;
  [key: string]: unknown;
}

/**
 * Build the full event payload — pure and deterministic given the ALS
 * context. Standard properties win over caller properties on key collision.
 */
export function buildEvent<E extends EventName>(
  name: E,
  properties: EventPropertyMap[E],
): TrackedEvent {
  const ctx = getLogContext();
  return {
    ...properties,
    event: name,
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    role: ctx.role,
    service: 'web',
    timestamp: new Date().toISOString(),
  };
}

// --- Axiom client (lazy, cached) -------------------------------------------
let axiomClient: Axiom | null | undefined;
function getAxiomClient(): Axiom | null {
  if (axiomClient === undefined) {
    const token = process.env.AXIOM_TOKEN;
    axiomClient = token ? new Axiom({ token }) : null;
  }
  return axiomClient;
}

// --- Test hook -------------------------------------------------------------
type EventSink = (event: TrackedEvent) => void;
let testSink: EventSink | null = null;
/** Route events to a capture function instead of Axiom/logger (tests only). */
export function __setEventSinkForTests(sink: EventSink | null): void {
  testSink = sink;
}

/**
 * Record a business event. Typed against the closed taxonomy — an unknown
 * event name or a wrong property shape is a compile error.
 */
export function trackEvent<E extends EventName>(name: E, properties: EventPropertyMap[E]): void {
  let event: TrackedEvent;
  try {
    event = buildEvent(name, properties);
  } catch {
    return; // building must never throw — but never let it escape if it does
  }

  if (testSink) {
    testSink(event);
    return;
  }

  const dataset = process.env.AXIOM_DATASET;
  const axiom = getAxiomClient();
  if (process.env.NODE_ENV === 'production' && axiom && dataset) {
    try {
      // Fire-and-forget: the client buffers internally; never awaited.
      void Promise.resolve(axiom.ingest(dataset, [event])).catch((err: unknown) => {
        logger.warn({ err, event: name }, 'axiom: event ingest failed');
      });
    } catch (err) {
      // A throw must never reach the request.
      logger.warn({ err, event: name }, 'axiom: event dispatch failed');
    }
    return;
  }

  // Dev / unconfigured — surface the event through the logger.
  logger.info(event, `event: ${name}`);
}
