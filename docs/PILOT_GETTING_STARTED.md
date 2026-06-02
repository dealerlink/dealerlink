# Getting Started with Dealerlink — UMA Trading Company

_A step-by-step guide for your first session. No technical background needed —
just follow the steps in order._

Welcome to Dealerlink. This guide walks you through everything you need for your
first day: signing in, setting up your business details, adding your first
customer and product, and running a complete sale from quotation to dispatch.

You can do it all yourself, at your own pace. Set aside about an hour for a
relaxed first run-through. You don't have to finish in one sitting — Dealerlink
saves everything as you go.

**Your workspace address:** **https://umatrading.dealerlink.in**

> Bookmark that link. It is your private workspace — only your company's data
> appears there, never anyone else's.

---

## Contents

1. [First login & setting your password](#1-first-login--setting-your-password)
2. [A quick tour of the dashboard](#2-a-quick-tour-of-the-dashboard)
3. [Finish your company setup (important: bank details)](#3-finish-your-company-setup-important-bank-details)
4. [Add your first dealer (customer)](#4-add-your-first-dealer-customer)
5. [Add your first product](#5-add-your-first-product)
6. [Put stock into the system (inventory)](#6-put-stock-into-the-system-inventory)
7. [Create your first quotation and send it](#7-create-your-first-quotation-and-send-it)
8. [Turn the quotation into a Proforma Invoice, then an Order](#8-turn-the-quotation-into-a-proforma-invoice-then-an-order)
9. [Record a payment](#9-record-a-payment)
10. [Dispatch the goods](#10-dispatch-the-goods)
11. [Where to find reports](#11-where-to-find-reports)
12. [Adding your logo and terms (optional, when ready)](#12-adding-your-logo-and-terms-optional-when-ready)
13. [Getting help](#13-getting-help)

---

## 1. First login & setting your password

You will have received a **welcome email** from Dealerlink
(`noreply@dealerlink.in`). It contains your login link and a **temporary
password**.

> **Can't find the email?** Check your spam/junk folder — Dealerlink is a new
> sender, so the first email can occasionally land there. If it still isn't
> there after a few minutes, contact us (see [section 13](#13-getting-help)) and
> we'll resend it.

To sign in:

1. Open **https://umatrading.dealerlink.in** in your web browser (Chrome, Edge,
   or Safari on a desktop or laptop works best).
2. Enter your email — **info.umatrading@gmail.com** — and the **temporary
   password** from the email.
3. Click **Continue**.

**You'll be asked to set a new password straight away.** This is normal and
required — the temporary one only works once. Choose a password that has:

- at least **8 characters**,
- one **capital letter**,
- one **number**, and
- one **symbol** (like `!`, `@`, `#`).

A strength meter shows you when it's good enough. Type it twice and save it.

> Write your new password down somewhere safe, or store it in your phone's
> password manager. Dealerlink staff can never see your password — if you forget
> it, we can issue a new temporary one, but we can't tell you your current one.

Once saved, you land on your **dashboard**. You're in.

---

## 2. A quick tour of the dashboard

The **dashboard** (also called **Overview**) is your home screen. It gives you a
quick read on the business at a glance:

- **Pipeline** — deals in progress and their total value.
- **Inventory** — stock on hand, reserved, and dispatched.
- **Payments** — money received recently and anything overdue.
- **Reports** — quick highlights, like your top dealer.

On your very first login everything will read **zero** — that's expected,
because you haven't entered any data yet. The numbers fill in as you start
working.

> You may see a generic greeting like "Good afternoon" at the top — that's just
> a placeholder and doesn't affect anything.

**The dark sidebar on the left is how you move around.** You'll use these the
most:

| Menu item             | What it's for                                       |
| --------------------- | --------------------------------------------------- |
| **Overview**          | This dashboard / home screen                        |
| **Pipeline**          | Track sales deals through stages                    |
| **Dealers**           | Your customers                                      |
| **Catalog**           | The products you sell                               |
| **Inventory**         | Stock you've bought in and have on hand             |
| **Quotations**        | Price quotes you send to customers                  |
| **Performa Invoices** | A formal quote/invoice before the sale is confirmed |
| **Orders**            | Confirmed sales                                     |
| **Payments**          | Money received                                      |
| **Dispatch**          | Shipping goods out, with serial numbers             |
| **Reports**           | Sales, GST, stock and outstanding-money reports     |
| **Settings**          | Your company details, bank, logo, defaults          |

Click any item to open it. Don't worry about breaking anything — you can always
click back.

---

## 3. Finish your company setup (important: bank details)

Before you send any real document to a customer, spend two minutes confirming
your company details. Open **Settings** in the sidebar.

Check that these are correct (we set them up for you, but please verify):

- **Legal name** — UMA TRADING COMPANY
- **GSTIN** — 27ADOPA1874B1ZT
- **State** — Maharashtra _(this decides how GST is calculated — see the note
  below — so it must be right)_
- **Registered address**

> ### ⚠️ Please update your bank details before issuing any invoice
>
> We set up your account with **placeholder bank details** because we didn't
> have your real ones yet (the branch currently just reads `NA`).
>
> Your **real** bank details (account name, account number, IFSC code, branch)
> print on the footer of every tax invoice. In **Settings**, find the **Bank**
> section, click to edit, enter your real details, and save. Do this **before**
> you create your first invoice so customers get correct payment information.

While you're in Settings, you can also set sensible defaults (all optional, with
reasonable values already in place):

- **Default quotation validity** — how many days a quote stays valid (e.g. 30).
- **Default credit period** — your usual payment terms in days.
- **Low-stock threshold** — when to warn you that a product is running low.
- **Default terms & conditions** — standard text that appears on quotations.

> ### How GST works in Dealerlink (worth understanding once)
>
> Your company is in **Maharashtra**. Dealerlink decides the tax type
> automatically based on **where the goods go**:
>
> - Selling to a customer **in Maharashtra** → **CGST + SGST** (split tax).
> - Selling to a customer **in another state** (e.g. Gujarat) → **IGST**
>   (single tax).
>
> You never calculate this by hand — Dealerlink does it for every quotation and
> invoice. Just make sure each customer's **state** is entered correctly (next
> section), because that's what drives the tax.

---

## 4. Add your first dealer (customer)

A **dealer** is a customer you sell to — a retailer, sub-dealer, or a project
buyer.

1. Click **Dealers** in the sidebar, then **Create a dealer**.
2. Fill in:
   - **Legal name** and **Display name** — the registered name, and a short name
     to show on screen.
   - **State** — **important.** This decides whether the sale is taxed as CGST +
     SGST (same state as you, Maharashtra) or IGST (a different state). Choose it
     carefully from the dropdown.
   - **GSTIN** — the dealer's 15-character GST number. Dealerlink checks it's
     valid; if it's rejected, re-read it from their GST certificate. The **PAN**
     fills in automatically.
   - **Contact details, address, credit limit and credit period** — as much as
     you have. You can always edit later.
3. Click **Create dealer**.

That's your first customer in the system. Repeat for as many as you like.

> **Tip:** If you're moving from an older system and have many dealers in a
> spreadsheet, we can bulk-import them for you — just ask (see
> [section 13](#13-getting-help)).

---

## 5. Add your first product

A **product** is something you sell — a solar panel, an inverter, a battery, a
mounting structure.

1. Click **Catalog** in the sidebar, then **Create a product**.
2. Fill in:
   - **SKU** — your own short code for the product (must be unique). For example
     `PANEL-540W`.
   - **Name**, manufacturer and model — e.g. "Premier 540W Bifacial Panel".
   - **HSN code** — the GST classification code for the product (4–8 digits).
     Solar panels and modules commonly use **8541**; check your supplier invoice
     if unsure.
   - **GST rate** — pick from 0%, 5%, 12%, 18% or 28%. This is applied on every
     quotation and invoice for this product, so get it right. _(Many solar
     modules are 12%; confirm the current rate for your products.)_
   - **Prices** — MRP, your usual purchase price, and your usual selling price.
     The selling price is offered as a starting point when you build a
     quotation; you can change it per quote.
   - **Requires serial number** — **tick this for items tracked individually**
     (panels, inverters). Each unit will then need a serial number recorded when
     stock arrives. Leave it unticked for bulk items like cables or bolts.
3. Click **Create product**.

> Don't worry about getting the catalog perfect on day one. Add a few products
> you sell most, and grow it as you go.

---

## 6. Put stock into the system (inventory)

Before you can sell, Dealerlink needs to know what stock you have. You record
this as a **procurement** — a batch of stock arriving from a supplier.

This is a few steps in sequence — follow them in order:

1. Click **Inventory → Procurements**, then **New procurement**.
2. Enter the **supplier**, the procurement date, and optionally the supplier's
   invoice number and date.
3. Add a **line** for each product: choose the product, the quantity, and the
   unit price you paid.
4. Click **Save as draft**.
5. On the procurement's page, click **Confirm procurement**.
6. For **serial-tracked** products (the ones you ticked "requires serial
   number"), click **Enter serials** and paste one serial number per line — one
   per unit. Dealerlink rejects duplicates and any serial already in your system.
7. Once every serial is entered, click **Finalize as received**.

Your stock is now **in stock** and ready to sell.

> **Why serials matter:** recording a serial for each unit means you can later
> see exactly which physical panels were reserved for an order, which were
> shipped, and which were delivered — right down to the customer. It's the
> backbone of warranty and traceability.

---

## 7. Create your first quotation and send it

A **quotation** is a price quote you send to a customer.

1. Click **Quotations** in the sidebar, then **New quotation** (you can also
   start one from a deal in the Pipeline).
2. Choose the **dealer** (customer). Their state is picked up automatically — so
   the correct GST (CGST+SGST or IGST) is applied for you.
3. Add **line items**: pick a product, set the quantity, adjust the price if
   needed. The selling price you set in the catalog is offered as a starting
   point.
4. Watch the totals on the right update live — **subtotal, discount, taxable
   value, GST, and grand total** all calculate automatically as you type.
5. Optionally add a document-level **discount** and **terms & conditions**.
6. **Save** the quotation. It gets a number like `QT-2026-0001`.

**To send it to the customer:**

- Open the saved quotation and click **Download** (or **Generate PDF**) to get a
  professional PDF you can email or print.
- You can also email it directly from Dealerlink if you've set that up.

> **First PDF is a little slow — that's normal.** The very first PDF you create
> can take a few seconds (you may briefly see a "preparing…" message). After
> that, they're quick. If it ever seems stuck, just wait a moment and try again.

> **A note you may notice:** in the read-only view of a saved quotation, the GST
> _percentages_ (e.g. "9%") may not show even though the GST _amounts_ are
> correct and present. The maths is right and the PDF is correct — this is a
> small display detail we're polishing.

---

## 8. Turn the quotation into a Proforma Invoice, then an Order

When the customer agrees, you move the quotation forward — you don't re-type
anything.

1. **Quotation → Proforma Invoice (PI).** Open the quotation and choose
   **Convert to PI**. A PI is a formal document sent before the sale is
   confirmed.
   - At this step you can set a **Ship-To** address if the goods go somewhere
     different from the customer's billing address. **If the Ship-To is in a
     different state, the GST type can change** (e.g. from CGST+SGST to IGST) —
     Dealerlink warns you when this happens and recalculates for you. This is
     correct and expected.
2. **PI → Order.** When the customer confirms, convert the PI to an **Order**
   (`ORD-2026-0001`). Confirming an order **reserves stock** for it.
   - If you don't have enough stock, Dealerlink blocks the confirmation and tells
     you exactly which product is short and by how much. Add stock (section 6),
     then try again.

---

## 9. Record a payment

When money comes in, record it against the order. This is a short three-step
flow:

1. Click **Payments** in the sidebar, then **Record payment**.
2. Enter the amount, date, and method (bank transfer, cheque, etc.), and link it
   to the dealer/order.
3. **Verify** the payment, then **Allocate** it to the order.

Once allocated, the order's status updates (for example to **Paid**), and the
money shows up in your dashboard and reports. You can generate a **payment
receipt PDF** to send to the customer.

> The three steps (Record → Verify → Allocate) exist so your books stay accurate
> — a payment is only counted against an order once you've confirmed and
> allocated it.

---

## 10. Dispatch the goods

When you're ready to ship a confirmed order:

1. Click **Dispatch** in the sidebar, then create a dispatch for the order.
2. **Pick the serial numbers** of the actual units going out (from the stock you
   reserved). Dealerlink tracks exactly which physical items ship.
3. Record transporter / LR (lorry receipt) details as needed.
4. Generate the **Dispatch Note PDF** to travel with the goods.
5. Mark the dispatch **delivered** when it arrives.

That completes the full cycle: **quotation → PI → order → payment → dispatch →
delivered**, with every panel traceable by serial number.

---

## 11. Where to find reports

Click **Reports** in the sidebar. You'll find:

- **Sales Summary** — what you've sold.
- **GST Summary** — your tax, correctly split into intra-state (CGST+SGST) and
  inter-state (IGST) — useful at filing time.
- **Inventory / Stock** — what you have on hand.
- **Outstanding Receivables** — who owes you money and how much is overdue.

These update automatically as you work — no manual report-building needed.

---

## 12. Adding your logo and terms (optional, when ready)

You can run the whole system without these, but they make your documents look
more professional. Do them whenever you have a moment, in **Settings**:

- **Logo** — upload a PNG, SVG, or JPG up to **1 MB** (about **400×120 pixels**
  works best). It appears in the sidebar, on your login screen, on PDF
  letterheads, and in emails. Until you add one, documents simply show your
  company name as text — which is perfectly fine.
- **Default terms & conditions** — standard text that pre-fills on new
  quotations.
- **Bank details** — _(see [section 3](#3-finish-your-company-setup-important-bank-details)
  — please do this one before issuing invoices, not later.)_

---

## 13. Getting help

You're not on your own. If anything is unclear or doesn't behave as you expect:

**Contact:** _[operator to fill in — e.g. "Rohit, Dealerlink — rohit@dealerlink.in /
WhatsApp +91-XXXXX-XXXXX"]_

**When you write, it helps us help you faster if you include:**

- What you were trying to do (e.g. "creating a quotation for dealer X").
- What you expected to happen, and what actually happened.
- The document number if there is one (e.g. `QT-2026-0001`).
- A screenshot if you can — it's often the quickest way to show us.

**Response time:** _[operator to set expectation — e.g. "We aim to reply within
a few hours on business days; urgent issues, call/WhatsApp."]_

During your first week we'll be keeping an extra-close eye on your account and
checking in, so don't hesitate to reach out for anything at all.

---

_Welcome aboard — we're glad to have UMA Trading Company as our first customer on
Dealerlink._
