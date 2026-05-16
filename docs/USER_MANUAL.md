# Dealerlink — User Manual

_For the people who run a distributorship on Dealerlink: office managers,
sales staff, accountants and dispatch coordinators. No technical background
needed._

> **Phase 1 status.** This manual is being written alongside the product.
> Sections 1 and 2 are complete. Sections 3–10 are outlined and will be
> filled in during Stage C, once the validation walkthrough confirms every
> screen. Screenshots are marked _[screenshot pending]_ and will be added in
> the same pass.

---

## Table of Contents

1. [Getting Started](#1-getting-started)
2. [Setting Up Your Catalog](#2-setting-up-your-catalog)
3. Sales Pipeline _(Stage C)_
4. Quotations _(Stage C)_
5. Performa Invoices _(Stage C)_
6. Orders _(Stage C)_
7. Payments _(Stage C)_
8. Dispatch _(Stage C)_
9. Reports _(Stage C)_
10. Troubleshooting _(Stage C)_

---

## 1. Getting Started

### Your company on Dealerlink

Dealerlink keeps each company's data completely separate. When you sign in,
you only ever see your own company's dealers, products, quotations and
invoices — never anyone else's. Throughout this manual, "your company" means
your distributorship's workspace.

### First login

Your Dealerlink contact creates your company's workspace and your first
**Admin** account. You receive a welcome email with:

- the web address where you sign in (for example `https://yourname.dealerlink.in`),
- your email address, and
- a **temporary password**.

To sign in:

1. Open the web address from the email.
2. Enter your email and the temporary password.
3. Click **Continue**.

_[screenshot pending: the sign-in screen]_

> **About the temporary password.** It is meant to be changed. After your
> first sign-in, ask your Admin (or your Dealerlink contact) to help you set
> a personal password if you have not been prompted to. A good password has
> at least 8 characters, one capital letter, one number and one symbol.

If you forget your password, your Admin can issue a new temporary one from
the operator console — you do not lose any data.

### The dashboard

After signing in you land on the **Overview** dashboard. It is the home
screen and gives you a quick read on the business:

- **Pipeline** — how many deals are in progress and their total value.
- **Inventory** — how much stock is on hand, reserved, or dispatched.
- **Payments** — money received recently and any overdue amounts.
- **Reports** — quick highlights such as your top dealer.

_[screenshot pending: the dashboard]_

The dark **sidebar** on the left is how you move around: Overview, Pipeline,
Dealers, Catalog, Inventory, Quotations, Performa Invoices, Orders, Payments,
Dispatch, Reports and Settings. Click any item to open that area.

### Who can do what — roles

Every user has one **role**. The role decides which buttons and screens they
see, so people only handle the work that is theirs:

| Role         | What they do                                                                     |
| ------------ | -------------------------------------------------------------------------------- |
| **Admin**    | Everything. Manages users and settings, and can step into any other role's work. |
| **Sales**    | Dealers, the sales pipeline, quotations, Performa Invoices and orders.           |
| **Accounts** | Payments, receipts and the financial reports.                                    |
| **Dispatch** | Confirmed orders, inventory, recording serial numbers and shipping documents.    |

If a teammate needs access, your Admin asks your Dealerlink contact to add
them — they receive their own welcome email exactly like you did.

---

## 2. Setting Up Your Catalog

Before you can raise a quotation you need two things in the system: the
**dealers** you sell to, and the **products** you sell. Then you record the
stock you have **procured** so it is ready to reserve against orders.

### Adding dealers

A **dealer** is a customer you sell to — a retailer, sub-distributor or
project buyer.

1. Open **Dealers** in the sidebar and click **Create a dealer**.
2. Fill in the dealer's details:
   - **Legal name** and **Display name** — the registered name and the short
     name you want shown on screen.
   - **State** — important: the dealer's state decides whether a sale is
     taxed as CGST + SGST (same state as your company) or IGST (a different
     state). Choose it carefully.
   - **GSTIN** — the dealer's 15-character GST number. Dealerlink checks the
     format and the check digit, so if it is rejected, re-read the number
     from the dealer's certificate. The **PAN** fills in automatically from
     the GSTIN.
   - **Contact details, address, credit limit and credit period** as you
     have them.
3. Click **Create dealer**.

_[screenshot pending: the create-dealer form]_

> **Tip.** If you are moving from an older system, an Admin can import many
> dealers at once from a spreadsheet — see the bulk-import runbook.

### Adding products

A **product** is something you sell — a solar panel, an inverter, a battery.

1. Open **Catalog** and click **Create a product**.
2. Fill in:
   - **SKU** — your own short code for the product. It must be unique.
   - **Name**, manufacturer and model.
   - **HSN code** — the tax classification code for the product (4–8 digits).
   - **GST rate** — pick from 0%, 5%, 12%, 18% or 28%. This is the rate that
     will be applied on every quotation and invoice for this product, so get
     it right.
   - **Prices** — the MRP, your usual purchase price and your usual selling
     price. The selling price is offered as a starting point when you build a
     quotation; you can always change it per quote.
   - **Requires serial number** — tick this for items tracked individually by
     serial number (panels, inverters). Each unit will then need a serial
     recorded when it arrives.
3. Click **Create product**.

_[screenshot pending: the create-product form]_

> **When tax rates change.** If the GST Council changes a rate, update the
> product here. The new rate applies to **new** quotations only — documents
> already issued keep the rate they were created with.

### Recording procurements

A **procurement** records a batch of stock arriving from a supplier. This is
what puts sellable inventory into the system.

1. Open **Inventory → Procurements** and click **New procurement**.
2. Enter the **supplier**, the procurement date and (optionally) the
   supplier's invoice number and date.
3. Add a **line** for each product: choose the product, the quantity and the
   unit price you paid.
4. Click **Save as draft**.
5. On the procurement's page, click **Confirm procurement**.
6. For serial-tracked products, click **Enter serials** and paste one serial
   number per line — one per unit. Dealerlink rejects duplicates and any
   serial that already exists in your inventory.
7. Once every serial is entered, click **Finalize as received**. The units
   are now **in stock** and ready to be sold.

_[screenshot pending: the procurement and serial-entry screens]_

> **Why serials matter.** Recording a serial for every unit means you can,
> later, see exactly which physical items were reserved for an order, which
> were dispatched, and which were delivered — all the way to the customer.

---

## 3–10. Coming in Stage C

The remaining sections — **Sales Pipeline**, **Quotations**, **Performa
Invoices**, **Orders**, **Payments**, **Dispatch**, **Reports** and
**Troubleshooting** — are outlined and will be written during Stage C, after
the validation walkthrough confirms each screen. Until then, the operator
runbooks in `docs/RUNBOOKS.md` cover every one of these workflows step by
step.

---

_Dealerlink Phase 1 · user manual stub · last updated 2026-05-16_
