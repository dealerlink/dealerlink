/**
 * Day 14 — daily maintenance crons: validity-expiry + pdf-cleanup.
 *
 * Seeds quotations / PIs with a past `valid_until` and generated_documents
 * with an old `generated_at`, runs each job, and asserts the expiry / purge.
 * Idempotency is checked by running each job twice.
 *
 * Uses `adminDb` → needs DATABASE_DIRECT_URL (loaded below).
 */
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  adminDb,
  closeDbConnection,
  dealers,
  generatedDocuments,
  performaInvoices,
  quotations,
  tenants,
  users,
} from '@dealerlink/db';
import { config as loadEnv } from 'dotenv';
import { eq, like } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runPdfCleanup } from '../src/jobs/pdf-cleanup';
import { runValidityExpiry } from '../src/jobs/validity-expiry';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
loadEnv({ path: path.join(repoRoot, '.env.local') });
loadEnv({ path: path.join(repoRoot, '.env') });

const QT_PREFIX = 'QT-DAY14TEST-';
const PI_PREFIX = 'PI-DAY14TEST-';
const DOC_PREFIX = 'day14-cleanup-test-';

let tenantId: string;
let dealerId: string;
let userId: string;

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

async function insertQuotation(status: string, validUntil: string): Promise<string> {
  const [row] = await adminDb
    .insert(quotations)
    .values({
      tenantId,
      quoteNumber: `${QT_PREFIX}${randomUUID().slice(0, 8)}`,
      dealerId,
      preparedBy: userId,
      tenantStateAtIssue: 'MH',
      placeOfSupply: 'MH',
      quoteDate: isoDay(-30), // well before validUntil — satisfies validity_chk
      validUntil,
      subtotal: '1000.00',
      taxableAmount: '1000.00',
      totalAmount: '1180.00',
      status,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: quotations.id });
  if (!row) throw new Error('quotation insert failed');
  return row.id;
}

async function insertPi(quotationId: string, status: string, validUntil: string): Promise<string> {
  const [row] = await adminDb
    .insert(performaInvoices)
    .values({
      tenantId,
      piNumber: `${PI_PREFIX}${randomUUID().slice(0, 8)}`,
      quotationId,
      billToDealerId: dealerId,
      shipToDealerId: dealerId,
      tenantStateAtIssue: 'MH',
      placeOfSupply: 'MH',
      preparedBy: userId,
      piDate: isoDay(-30), // well before validUntil — satisfies validity_chk
      validUntil,
      subtotal: '1000.00',
      taxableAmount: '1000.00',
      totalAmount: '1180.00',
      status,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning({ id: performaInvoices.id });
  if (!row) throw new Error('PI insert failed');
  return row.id;
}

async function insertDoc(tag: string, generatedAt: Date): Promise<string> {
  const [row] = await adminDb
    .insert(generatedDocuments)
    .values({
      tenantId,
      documentType: 'quotation',
      documentId: randomUUID(),
      filename: `${DOC_PREFIX}${tag}.pdf`,
      sizeBytes: 1024,
      storage: 'inline',
      storageRef: 'JVBERi0xLjQK', // dummy base64
      generatedAt,
    })
    .returning({ id: generatedDocuments.id });
  if (!row) throw new Error('generated_documents insert failed');
  return row.id;
}

async function quotationStatus(id: string): Promise<string | null> {
  const [r] = await adminDb
    .select({ status: quotations.status })
    .from(quotations)
    .where(eq(quotations.id, id))
    .limit(1);
  return r?.status ?? null;
}
async function piStatus(id: string): Promise<string | null> {
  const [r] = await adminDb
    .select({ status: performaInvoices.status })
    .from(performaInvoices)
    .where(eq(performaInvoices.id, id))
    .limit(1);
  return r?.status ?? null;
}

beforeAll(async () => {
  const [t] = await adminDb.select({ id: tenants.id }).from(tenants).limit(1);
  if (!t) throw new Error('Need a seeded tenant — run pnpm db:seed');
  tenantId = t.id;
  const [d] = await adminDb
    .select({ id: dealers.id })
    .from(dealers)
    .where(eq(dealers.tenantId, tenantId))
    .limit(1);
  const [u] = await adminDb
    .select({ id: users.id })
    .from(users)
    .where(eq(users.tenantId, tenantId))
    .limit(1);
  if (!d || !u) throw new Error('Need a seeded dealer + user — run pnpm db:seed');
  dealerId = d.id;
  userId = u.id;
});

afterAll(async () => {
  await adminDb.delete(performaInvoices).where(like(performaInvoices.piNumber, `${PI_PREFIX}%`));
  await adminDb.delete(quotations).where(like(quotations.quoteNumber, `${QT_PREFIX}%`));
  await adminDb
    .delete(generatedDocuments)
    .where(like(generatedDocuments.filename, `${DOC_PREFIX}%`));
  await closeDbConnection();
});

describe('runValidityExpiry', () => {
  it('expires sent quotations/PIs past valid_until, leaves others untouched', async () => {
    const staleQuote = await insertQuotation('sent', isoDay(-3));
    const freshQuote = await insertQuotation('sent', isoDay(7));
    const draftQuote = await insertQuotation('draft', isoDay(-3));
    const staleQuoteForPi = await insertQuotation('accepted', isoDay(-3));
    const stalePi = await insertPi(staleQuoteForPi, 'sent', isoDay(-3));
    const freshPi = await insertPi(staleQuoteForPi, 'sent', isoDay(7));

    await runValidityExpiry();

    expect(await quotationStatus(staleQuote)).toBe('expired'); // sent + past → expired
    expect(await quotationStatus(freshQuote)).toBe('sent'); // still valid
    expect(await quotationStatus(draftQuote)).toBe('draft'); // only 'sent' expires
    expect(await piStatus(stalePi)).toBe('expired');
    expect(await piStatus(freshPi)).toBe('sent');
  });

  it('is idempotent — a second run does not change already-expired rows', async () => {
    const staleQuote = await insertQuotation('sent', isoDay(-5));
    const first = await runValidityExpiry();
    expect(first.quotationsExpired).toBeGreaterThanOrEqual(1);
    expect(await quotationStatus(staleQuote)).toBe('expired');

    // Second run: nothing left in 'sent' + past among our test rows.
    const second = await runValidityExpiry();
    // The row stays expired regardless of what other rows the run touched.
    expect(await quotationStatus(staleQuote)).toBe('expired');
    expect(second.asOf).toBe(first.asOf);
  });
});

describe('runPdfCleanup', () => {
  it('purges inline payloads older than 30 days, keeps recent ones', async () => {
    const oldDoc = await insertDoc('old', new Date(Date.now() - 40 * 86_400_000));
    const recentDoc = await insertDoc('recent', new Date());

    const result = await runPdfCleanup();
    expect(result.purged).toBeGreaterThanOrEqual(1);

    const [oldRow] = await adminDb
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, oldDoc))
      .limit(1);
    const [recentRow] = await adminDb
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, recentDoc))
      .limit(1);

    expect(oldRow?.storageRef).toBeNull();
    expect(oldRow?.storageRefPurgedAt).not.toBeNull();
    expect(recentRow?.storageRef).not.toBeNull(); // recent payload retained
  });

  it('is idempotent — a second run does not re-touch purged rows', async () => {
    const oldDoc = await insertDoc('old2', new Date(Date.now() - 45 * 86_400_000));
    await runPdfCleanup();
    const [afterFirst] = await adminDb
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, oldDoc))
      .limit(1);
    const purgedAt = afterFirst?.storageRefPurgedAt;
    expect(purgedAt).not.toBeNull();

    await runPdfCleanup();
    const [afterSecond] = await adminDb
      .select()
      .from(generatedDocuments)
      .where(eq(generatedDocuments.id, oldDoc))
      .limit(1);
    // Already-purged row no longer matches → purged_at unchanged.
    expect(afterSecond?.storageRefPurgedAt?.getTime()).toBe(purgedAt?.getTime());
  });
});
