# Optional async walkthrough script (UMA Trading Company)

> **Optional — operator's call.** The pilot is self-serve with no live training,
> so a short recorded walkthrough (Loom-style screen recording, or a set of
> annotated screenshots) is a nice-to-have that often saves several support
> round-trips. This is a shot list / narration script you can record against the
> live `umatrading.dealerlink.in` workspace.
>
> **Record on a clean/empty tenant view, or use a throwaway demo tenant** — do
> **not** record using the pilot's admin login (keep that pristine for Akhshay's
> first sign-in). Staging (`demo.staging.dealerlink.in`, seeded) is a good place
> to record without touching production.
>
> Keep it short: aim for **6–8 minutes total**. Pair it with
> `docs/PILOT_GETTING_STARTED.md` (same order).

---

## Shot list & narration

| #   | Screen / action                          | Say (narration)                                                                                                  | Annotate / highlight                                     |
| --- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1   | Login page at `umatrading.dealerlink.in` | "This is your private workspace. Enter your email and the temporary password from your welcome email."           | Circle the email + password fields and **Continue**.     |
| 2   | Set-new-password screen                  | "On first login you'll set your own password — 8+ characters, a capital, a number, a symbol."                    | Highlight the strength meter.                            |
| 3   | Dashboard / Overview                     | "This is home. It's empty today; it fills in as you work. The dark menu on the left is how you move around."     | Point to each sidebar item briefly.                      |
| 4   | Settings                                 | "Confirm your company details here. Important: add your real bank details before sending any invoice."           | Box the **Bank** section + the placeholder warning text. |
| 5   | Dealers → Create a dealer                | "Add a customer. The state you pick decides the GST type, so choose it carefully."                               | Highlight the **State** dropdown.                        |
| 6   | Catalog → Create a product               | "Add a product — SKU, HSN, GST rate, prices. Tick 'requires serial number' for panels and inverters."            | Highlight **GST rate** + **Requires serial number**.     |
| 7   | Inventory → Procurements                 | "Record stock arriving: save draft → confirm → enter serials → finalize as received."                            | Number the four buttons in sequence.                     |
| 8   | Quotations → New quotation               | "Pick the customer, add products, watch the totals and GST calculate live. Save, then download the PDF to send." | Highlight the live totals panel.                         |
| 9   | Convert flow                             | "When the customer agrees: convert to Proforma Invoice, then to an Order. Confirming an order reserves stock."   | Show the **Convert** buttons.                            |
| 10  | Payments                                 | "Record → verify → allocate a payment against the order. The order then shows as paid."                          | Highlight the three steps.                               |
| 11  | Dispatch                                 | "Create a dispatch, pick the serial numbers shipping out, generate the dispatch note, mark delivered."           | Highlight serial picking.                                |
| 12  | Reports                                  | "Sales, GST, stock, and outstanding money — all here, always up to date."                                        | Pan across the report list.                              |
| 13  | Close                                    | "That's the full cycle. The written guide covers each step in detail, and I'm one message away."                 | Show the support contact.                                |

---

## Tips

- Speak slowly and plainly; assume no software background.
- Don't show real customer data on screen if recording on a shared tenant.
- Upload the recording somewhere the pilot can view without an account (Loom
  share link, Google Drive "anyone with link", or a YouTube unlisted video) and
  paste the link into the cover email.
