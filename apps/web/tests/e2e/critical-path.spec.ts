/**
 * Critical-path E2E — the full distributor workflow, end to end.
 *
 * This is THE smoke test for the whole Dealerlink build. If anything in the
 * system is broken across module boundaries, this is the spec that surfaces
 * it. Day 18 (Stage B close-out) does not pass until this is green.
 *
 * ── Scenario ──────────────────────────────────────────────────────────────
 * A distributor receives an order, fulfils it, and gets paid. Every role in
 * the product touches the deal exactly where it would in real operations.
 *
 *  1. Login as admin@demo.test.
 *  2. Create a new dealer ("CP Dealer …") in Maharashtra (same state as the
 *     demo tenant → intra-state → CGST+SGST).
 *  3. Create a new product ("CP Panel 600W …", HSN 85414300, GST 18%,
 *     serial-tracked).
 *  4. Record a procurement of 10 units at ₹15,000/unit from a supplier.
 *  5. Confirm the procurement, enter 10 serial numbers (this creates 10
 *     inventory_items at status='in_stock'), then finalize it as received.
 *  6. Logout, login as sales@demo.test.
 *  7. Create a deal ("CP Order …") for the new dealer — opens in qualification.
 *  8. Advance the deal qualification → needs_analysis on the kanban.
 *  9. Build a quotation from the deal: 5 units @ ₹16,000 (markup over cost).
 * 10. Verify the live tax math — intra-state shows CGST+SGST, total ₹94,400.
 * 11. Save & send the quotation — the linked deal auto-advances to
 *     quotation_sent.
 * 12. Mark the quotation accepted, then advance the deal on the kanban
 *     quotation_sent → negotiation → verbal_commit → po_pending.
 * 13. Convert the quotation to a PI (Ship-To = Bill-To).
 * 14. Send the PI, confirm the PI — an Order is auto-created and the deal
 *     advances po_pending → payment_pending.
 * 15. Logout, login as accounts@demo.test.
 * 16. Record a payment covering the order total.
 * 17. Verify the payment, then mark it cleared.
 * 18. Allocate the payment to the order — the order auto-confirms (reserving
 *     5 inventory_items) and its payment status becomes 'paid'.
 * 19. Logout, login as dispatch@demo.test.
 * 20. Create a dispatch from the order, picking all 5 reserved serials.
 * 21. Verify the 5 serials appear on the dispatch note (reserved → dispatched).
 * 22. Mark the dispatch delivered, acknowledged by a named person.
 * 23. Verify the order reaches 'delivered' and the deal reaches 'closed'.
 * 24. Logout, login as admin@demo.test.
 * 25. Open Reports → Sales Summary, group by dealer — the new dealer appears.
 * 26. Open Reports → Outstanding Receivables — the new dealer has 0 outstanding.
 * 27. (No teardown — every entity is uniquely suffixed per run, so the spec is
 *     idempotent without a cleanup pass. See A1.2 / DEV.31.)
 *
 * ── Isolation (A1.2 / DEV.31) ─────────────────────────────────────────────
 * The spec creates its own dealer, product, procurement, deal, quotation, PI,
 * order, payment and dispatch — it never depends on seed-data ordering. Every
 * created entity carries a unique per-run id ("CP-<base36 timestamp>"), so a
 * re-run never collides with a previous run's rows (SKUs and serials are
 * tenant-unique). No DB reset is needed.
 */
import { expect, test, type Locator, type Page } from '@playwright/test';

import { loginAs } from './helpers';

// One id per spec run — keeps SKUs / serials / names unique and re-runnable.
const RUN = Date.now().toString(36).toUpperCase();
const DEALER_NAME = `CP Dealer ${RUN}`;
const PRODUCT_NAME = `CP Panel 600W ${RUN}`;
const SKU = `CP-600-${RUN}`;
const DEAL_TITLE = `CP Order ${RUN}`;
const UNIT_COST = 15000;
const UNIT_PRICE = 16000;
const PROCURE_QTY = 10;
const QUOTE_QTY = 5;
// 5 × 16,000 = 80,000 taxable; 18% GST → 9% CGST + 9% SGST → grand total.
const EXPECTED_TOTAL = QUOTE_QTY * UNIT_PRICE * 1.18; // 94,400

/** Select an <option> whose visible text contains `text` (value is opaque). */
async function pickOption(select: Locator, text: string): Promise<void> {
  const value = await select.locator('option', { hasText: text }).first().getAttribute('value');
  expect(value, `a <select> option matching "${text}"`).toBeTruthy();
  await select.selectOption(value!);
}

/** Clear the session and sign in fresh as a tenant role. */
async function switchTo(page: Page, role: 'admin' | 'sales' | 'accounts' | 'dispatch') {
  await page.context().clearCookies();
  await loginAs(page, 'demo', role);
  if (page.url().includes('change-password')) {
    test.skip(true, 'Seeded user unexpectedly needs password rotation');
  }
}

/**
 * Drag a deal card to a target kanban column. dnd-kit's PointerSensor has a
 * 4px activation distance, so the drag is performed with explicit, stepped
 * mouse moves: press → nudge past the threshold → travel to the column →
 * settle → release. The move is then re-read from a fresh /pipeline load to
 * prove the server action (not just the optimistic UI) committed it.
 */
async function moveDealTo(page: Page, title: string, toStage: string): Promise<void> {
  await page.goto('/pipeline');
  const card = page
    .locator('section[data-stage] a[href^="/pipeline/"]', { hasText: title })
    .first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  const target = page.locator(`section[data-stage="${toStage}"]`);
  await expect(target).toBeVisible();

  const cb = await card.boundingBox();
  const tb = await target.boundingBox();
  if (!cb || !tb) throw new Error('Could not resolve drag geometry');

  await page.mouse.move(cb.x + cb.width / 2, cb.y + 14);
  await page.mouse.down();
  await page.mouse.move(cb.x + cb.width / 2 + 10, cb.y + 26, { steps: 8 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 90, { steps: 24 });
  await page.mouse.move(tb.x + tb.width / 2, tb.y + 110, { steps: 8 });
  await page.mouse.up();

  // The optimistic move lands immediately; give the server transition a beat.
  await expect(
    page.locator(`section[data-stage="${toStage}"] a[href^="/pipeline/"]`, { hasText: title }),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(800);

  // Reload — the board re-reads from the DB, proving the move persisted.
  await page.goto('/pipeline');
  await expect(
    page.locator(`section[data-stage="${toStage}"] a[href^="/pipeline/"]`, { hasText: title }),
  ).toBeVisible({ timeout: 15_000 });
}

test.describe('Critical path — new distributor order, fulfilled and paid', () => {
  // The whole workflow is one long test; the default 60s is per-test.
  test.setTimeout(15 * 60_000);
  // A wide viewport keeps all 9 kanban columns on-screen at once, so column
  // geometry is stable for drag-and-drop (no horizontal auto-scroll mid-drag).
  test.use({ viewport: { width: 2600, height: 1400 } });

  test('full distributor workflow end to end', async ({ page }) => {
    // Action/navigation budget. `expect` assertions keep the config's 15s
    // (a genuinely missing element still fails fast); navigations are given
    // 60s because a `force-dynamic` route's first-hit compile under the dev
    // server can legitimately take tens of seconds.
    page.setDefaultTimeout(60_000);

    // ── 1. Login as admin ────────────────────────────────────────────────
    await test.step('1. login as admin', async () => {
      await switchTo(page, 'admin');
      await expect(page).toHaveURL(/dashboard/);
    });

    // ── 2. Create a dealer ───────────────────────────────────────────────
    await test.step('2. create a dealer', async () => {
      await page.goto('/dealers/new');
      await expect(page.getByRole('heading', { name: /dealer/i })).toBeVisible();
      await page.getByLabel('Legal name').fill(`${DEALER_NAME} Pvt Ltd`);
      await page.getByLabel('Display name').fill(DEALER_NAME);
      await page.getByLabel('State', { exact: false }).first().selectOption('Maharashtra');
      await page.getByRole('button', { name: 'Create dealer' }).click();
      await expect(page).toHaveURL(/\/dealers(\/[0-9a-f-]+)?(\?|$)/, { timeout: 15_000 });
    });

    // ── 3. Create a product ──────────────────────────────────────────────
    await test.step('3. create a serial-tracked product', async () => {
      await page.goto('/catalog/new');
      await expect(page.getByRole('heading', { name: /product/i })).toBeVisible();
      await page.getByLabel('SKU').fill(SKU);
      await page.getByLabel('Name', { exact: false }).first().fill(PRODUCT_NAME);
      await page.getByLabel('HSN code').fill('85414300');
      await page.getByLabel('GST rate').selectOption({ label: '18%' });
      await page.getByLabel('Default purchase price', { exact: false }).fill(String(UNIT_COST));
      await page.getByLabel('Default selling price', { exact: false }).fill(String(UNIT_PRICE));
      // Serial-tracked: required so procurement creates trackable inventory_items.
      await page.locator('input[type="checkbox"]').first().check();
      await page.getByRole('button', { name: 'Create product' }).click();
      await expect(page).toHaveURL(/\/catalog(\/[0-9a-f-]+)?(\?|$)/, { timeout: 15_000 });
    });

    // ── 4. Record a procurement ──────────────────────────────────────────
    let procurementUrl = '';
    await test.step('4. record a procurement of 10 units', async () => {
      await page.goto('/inventory/procurements/new');
      await expect(page.getByRole('heading', { name: 'New procurement' })).toBeVisible();
      await page.getByLabel('Supplier').fill(`CP Supplier ${RUN}`);
      const lineProduct = page.locator('select').first();
      await pickOption(lineProduct, `(${SKU})`);
      const numbers = page.locator('input[type="number"]');
      await numbers.nth(0).fill(String(PROCURE_QTY)); // quantity
      await numbers.nth(1).fill(String(UNIT_COST)); // unit price
      await page.getByRole('button', { name: 'Save as draft' }).click();
      await page.waitForURL(/\/inventory\/procurements\/[0-9a-f-]+$/, { timeout: 15_000 });
      procurementUrl = page.url();
    });

    // ── 5. Confirm → enter serials → finalize ────────────────────────────
    await test.step('5. confirm procurement, enter 10 serials, finalize', async () => {
      await page.getByRole('button', { name: 'Confirm procurement' }).click();
      await expect(page.getByText('confirmed', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole('link', { name: /Enter serials/ }).click();
      await page.waitForURL(/\/serials$/);
      const serials = Array.from(
        { length: PROCURE_QTY },
        (_, i) => `CP-SN-${RUN}-${String(i + 1).padStart(3, '0')}`,
      );
      await page.locator('textarea').first().fill(serials.join('\n'));
      await page.getByRole('button', { name: `Submit ${PROCURE_QTY}` }).click();
      // 10 inventory_items now exist at status='in_stock'.
      await expect(page.getByText('All serials received.')).toBeVisible({ timeout: 15_000 });

      await page.goto(procurementUrl);
      await page.getByRole('button', { name: 'Finalize as received' }).click();
      await expect(page.getByText('received', { exact: true }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // ── 6. Switch to sales ───────────────────────────────────────────────
    await test.step('6. login as sales', async () => {
      await switchTo(page, 'sales');
    });

    // ── 7. Create a deal ─────────────────────────────────────────────────
    let dealUrl = '';
    await test.step('7. create a deal in qualification', async () => {
      await page.goto('/pipeline/new');
      await expect(page.getByRole('heading', { name: 'New deal' })).toBeVisible();
      await page.getByPlaceholder('Q3 commercial rooftop — 120 panels').fill(DEAL_TITLE);
      await pickOption(page.locator('select').first(), DEALER_NAME);
      await page.getByRole('button', { name: 'Create deal' }).click();
      await expect(page).toHaveURL(/\/pipeline(\/[0-9a-f-]+)?(\?|$)/, { timeout: 15_000 });
      // The new deal opens in stage 1.
      await page.goto('/pipeline');
      const dealCard = page.locator('section[data-stage="qualification"] a[href^="/pipeline/"]', {
        hasText: DEAL_TITLE,
      });
      await expect(dealCard).toBeVisible({ timeout: 15_000 });
      dealUrl = (await dealCard.getAttribute('href'))!;
      expect(dealUrl).toMatch(/^\/pipeline\/[0-9a-f-]+$/);
    });

    // ── 8. Advance qualification → needs_analysis ────────────────────────
    await test.step('8. advance deal to needs_analysis', async () => {
      await moveDealTo(page, DEAL_TITLE, 'needs_analysis');
    });

    // ── 9 & 10 & 11. Build, verify tax, send the quotation ───────────────
    await test.step('9-11. build quotation, verify tax, save & send', async () => {
      await page.goto('/quotations/new');
      await expect(page.getByRole('heading', { name: 'New quotation' })).toBeVisible();
      await pickOption(page.getByLabel('Dealer'), DEALER_NAME);
      await pickOption(page.getByLabel('Linked deal'), DEAL_TITLE);
      // Add the product line, then set quantity to 5.
      await pickOption(page.getByLabel('Add a product line'), SKU);
      await page.getByLabel(`Quantity for ${PRODUCT_NAME}`).fill(String(QUOTE_QTY));
      await page.getByLabel(`Unit price for ${PRODUCT_NAME}`).fill(String(UNIT_PRICE));

      // 10. Live tax math — intra-state (same state) → CGST + SGST, ₹94,400.
      const summary = page.getByText('Totals').locator('..');
      await expect(summary.getByText(/CGST/i).first()).toBeVisible();
      await expect(summary.getByText(EXPECTED_TOTAL.toLocaleString('en-IN'))).toBeVisible();

      // 11. Save & send — renders the PDF, so allow extra time.
      await page.getByRole('button', { name: 'Save & send' }).click();
      await page.waitForURL(/\/quotations\/[0-9a-f-]+$/, { timeout: 90_000 });
      await expect(page.locator('h1').first()).toContainText(/QT-/);
      await expect(page.locator('h1').first().getByText('sent', { exact: true })).toBeVisible({
        timeout: 30_000,
      });
    });

    const quotationUrl = page.url();

    // ── 12. Accept quotation, advance deal to po_pending ─────────────────
    await test.step('12. accept quotation; advance deal to po_pending', async () => {
      // The send auto-advanced the linked deal to quotation_sent.
      await page.goto('/pipeline');
      await expect(
        page.locator('section[data-stage="quotation_sent"] a[href^="/pipeline/"]', {
          hasText: DEAL_TITLE,
        }),
      ).toBeVisible({ timeout: 15_000 });

      await page.goto(quotationUrl);
      await page.getByRole('button', { name: 'Mark accepted' }).click();
      await expect(page.locator('h1').first().getByText('accepted', { exact: true })).toBeVisible({
        timeout: 15_000,
      });

      await moveDealTo(page, DEAL_TITLE, 'negotiation');
      await moveDealTo(page, DEAL_TITLE, 'verbal_commit');
      await moveDealTo(page, DEAL_TITLE, 'po_pending');
    });

    // ── 13. Convert the quotation to a PI ────────────────────────────────
    await test.step('13. convert quotation to a PI', async () => {
      await page.goto(quotationUrl);
      await page.getByRole('link', { name: 'Convert to PI' }).click();
      await expect(page.getByRole('heading', { name: /New PI from/ })).toBeVisible();
      // Retry the click only while still on the convert form — the freshly-
      // navigated form may still be hydrating when the first click lands (a
      // no-op before React attaches handlers). Once the PI route is reached
      // the URL guard stops re-clicking even if its cold compile is slow.
      await expect(async () => {
        if (/\/convert-to-pi$/.test(page.url())) {
          await page.getByRole('button', { name: 'Create draft PI' }).click();
        }
        await page.waitForURL(/\/pi\/[0-9a-f-]+$/, { timeout: 8_000 });
      }).toPass({ timeout: 90_000 });
      await expect(page.locator('h1').first()).toContainText(/PI-/, { timeout: 60_000 });
    });

    // ── 14. Send + confirm the PI → Order is created ─────────────────────
    let orderUrl = '';
    await test.step('14. send + confirm PI; an order is created', async () => {
      page.on('dialog', (d) => void d.accept());
      await page.getByRole('button', { name: 'Send', exact: true }).click();
      await expect(page.locator('h1').first().getByText('sent', { exact: true })).toBeVisible({
        timeout: 60_000,
      });
      await page.getByRole('button', { name: 'Confirm PI' }).click();
      await expect(page.getByText(/Order ORD-.* created\./)).toBeVisible({ timeout: 30_000 });
      await page.getByRole('link', { name: /View order ORD-/ }).click();
      await page.waitForURL(/\/orders\/[0-9a-f-]+/, { timeout: 15_000 });
      orderUrl = page.url().split('?')[0]!;
      await expect(page.locator('h1').first()).toContainText(/ORD-/);

      // The PI confirmation advanced the linked deal to payment_pending.
      await page.goto('/pipeline');
      await expect(
        page.locator('section[data-stage="payment_pending"] a[href^="/pipeline/"]', {
          hasText: DEAL_TITLE,
        }),
      ).toBeVisible({ timeout: 15_000 });
    });

    // ── 15. Switch to accounts ───────────────────────────────────────────
    await test.step('15. login as accounts', async () => {
      await switchTo(page, 'accounts');
    });

    // ── 16. Record a payment ─────────────────────────────────────────────
    await test.step('16. record a payment for the order', async () => {
      await page.goto('/payments/new');
      await expect(page.getByRole('heading', { name: 'Record payment' })).toBeVisible();
      await pickOption(page.locator('select').first(), DEALER_NAME);
      // Record more than enough — the exact order balance is allocated below.
      await page.getByPlaceholder('0.00').first().fill('200000');
      await page.getByRole('button', { name: 'Record payment' }).click();
      await page.waitForURL(/\/payments\/[0-9a-f-]+/, { timeout: 20_000 });
      await expect(page.locator('h1').first()).toContainText(/PAY-/);
    });

    // ── 17 & 18. Verify, clear, allocate → order auto-confirms ───────────
    await test.step('17-18. verify, clear, allocate to the order', async () => {
      await page.getByRole('button', { name: 'Verify', exact: true }).click();
      await expect(page.locator('h1').first().getByText('verified')).toBeVisible({
        timeout: 15_000,
      });
      await page.getByRole('button', { name: 'Mark cleared' }).click();
      await expect(page.locator('h1').first().getByText('cleared')).toBeVisible({
        timeout: 15_000,
      });

      await page.getByRole('button', { name: 'Allocate', exact: true }).click();
      const allocPanel = page.getByText(/Allocate PAY-/).locator('..');
      const orderRow = allocPanel.locator('li', { hasText: /ORD-/ }).first();
      await expect(orderRow).toBeVisible();
      // Read the order's outstanding balance and allocate exactly that.
      const outstandingText = await orderRow.getByText(/outstanding/).innerText();
      const outstanding = outstandingText.replace(/[^0-9.]/g, '');
      expect(Number(outstanding)).toBeGreaterThan(0);
      await orderRow.locator('input[type="number"]').fill(outstanding);
      await allocPanel.getByRole('button', { name: 'Allocate', exact: true }).click();
      await expect(page.getByText(/Allocated to 1 order/)).toBeVisible({ timeout: 15_000 });

      // The allocation fully paid the pending order → auto-confirm + reserve.
      await page.goto(`${orderUrl}?tab=overview`);
      await expect(page.locator('h1').first().getByText('confirmed')).toBeVisible({
        timeout: 15_000,
      });
      await expect(page.locator('h1').first().getByText('paid')).toBeVisible();
    });

    // ── 19. Switch to dispatch ───────────────────────────────────────────
    await test.step('19. login as dispatch', async () => {
      await switchTo(page, 'dispatch');
    });

    // ── 20 & 21. Create the dispatch, pick all 5 serials ─────────────────
    await test.step('20-21. create a dispatch for all 5 reserved serials', async () => {
      await page.goto('/dispatch/new');
      await expect(page.getByRole('heading', { name: 'New dispatch' })).toBeVisible();
      const orderId = orderUrl.split('/').pop()!;
      await page
        .getByRole('link', { name: 'Dispatch' })
        .and(page.locator(`a[href="/dispatch/new?order=${orderId}"]`))
        .click();
      await page.waitForURL(/\/dispatch\/new\?order=/);

      await page.getByRole('button', { name: 'Select up to remaining' }).first().click();
      // Logistics fields are all optional; fill the vehicle (unique placeholder).
      await page.getByPlaceholder('MH-12-AB-1234').fill('MH-12-CP-2026');
      const createBtn = page.getByRole('button', { name: 'Create dispatch' });
      await expect(createBtn).toBeEnabled();
      await createBtn.click();
      await page.waitForURL(/\/dispatch\/[0-9a-f-]+$/, { timeout: 20_000 });
      await expect(page.locator('h1').first()).toContainText(/DSP-/);
      await expect(page.locator('h1').first().getByText('in transit')).toBeVisible();
      // The 5 picked serials are listed on the dispatch note.
      await expect(page.getByText(`CP-SN-${RUN}-001`)).toBeVisible();
    });

    // ── 22 & 23. Mark delivered; order delivered + deal closed ───────────
    await test.step('22-23. mark delivered; verify order + deal close out', async () => {
      await page.getByRole('button', { name: 'Mark delivered' }).click();
      await page.getByPlaceholder('Name of the person who signed').fill(`CP Receiver ${RUN}`);
      await page.getByRole('button', { name: 'Confirm delivery' }).click();
      await expect(page.locator('h1').first().getByText('delivered')).toBeVisible({
        timeout: 15_000,
      });

      // The order reached 'delivered'.
      await page.goto(`${orderUrl}?tab=overview`);
      await expect(page.locator('h1').first().getByText('delivered')).toBeVisible({
        timeout: 15_000,
      });

      // The fully-dispatched + delivered order closed the linked deal as won.
      // A won deal leaves the active kanban (the board shows only open deals),
      // so the close-out is verified on the deal's own detail page.
      await page.goto(dealUrl, { timeout: 60_000 }); // first hit — cold route compile
      await expect(page.getByRole('heading', { name: DEAL_TITLE })).toBeVisible();
      await expect(page.getByText('WON', { exact: true })).toBeVisible({ timeout: 15_000 });
    });

    // ── 24. Switch back to admin ─────────────────────────────────────────
    await test.step('24. login as admin', async () => {
      await switchTo(page, 'admin');
    });

    // ── 25. Sales Summary shows the new order ────────────────────────────
    await test.step('25. sales summary lists the new dealer', async () => {
      await page.goto('/reports/sales-summary?groupBy=dealer', { timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Sales Summary' })).toBeVisible();
      await expect(page.locator('table')).toBeVisible();
      await expect(page.locator('td', { hasText: DEALER_NAME }).first()).toBeVisible({
        timeout: 15_000,
      });
    });

    // ── 26. Outstanding shows the new dealer at zero ─────────────────────
    await test.step('26. outstanding receivables shows 0 for the new dealer', async () => {
      await page.goto('/reports/outstanding', { timeout: 60_000 });
      await expect(page.getByRole('heading', { name: 'Outstanding Receivables' })).toBeVisible();
      // The order was paid in full — the dealer is not an outstanding row.
      await expect(page.locator('td', { hasText: DEALER_NAME })).toHaveCount(0);
    });
  });
});
