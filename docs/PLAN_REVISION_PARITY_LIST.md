# Plan revision — the client's parity list

**Source:** six items requested by Maharudra Agencies after the demo, plus
evidence from three real Tally tax invoices they shared
(`INV-40`, `INV-68`, `INV-93`, Sep 2026).

**The framing that matters:** every item on their list already works in Swipe.
This is a **parity list, not a wishlist**. They will switch for the pipeline and
serial traceability, but only if they do not go backwards on anything they use
daily. Treat each item as a blocker to adoption rather than an enhancement.

**Amended 2026-09-29, after §6's filings were applied,** on two operator
corrections: the Tally masters export is not a client deliverable (§7), and the
two-entity question moves to the onboarding template (§6 item 6, §7). Both
corrections were in effect when F.144–F.150 were filed; this document is the
version those rows cite.

---

## 1. New facts, with evidence

**Their real GSTIN is `30AAVCM1063F1ZN`**, PAN `AAVCM1063F` (characters 3–12).
This closes F.115's open value — but see the entity question below.

**Two legal entities exist.** These invoices are issued by _MAHARUDRA SOLAR
AGENCIES PRIVATE LIMITED_. On `PFI-2033` that same Pvt Ltd was the **customer**,
with _MAHARUDRA AGENCIES_ as the seller. Two businesses, two GSTINs, and in
Dealerlink's model two tenants. **Establish which entity is being onboarded
before seeding anything** — F.115's GSTIN belongs to the Pvt Ltd, and the demo
tenant may be the wrong one.

**Invoice volume, measured:** `INV-40` dated 17 Sep, `INV-93` dated 25 Sep — 53
invoices in 8 days, roughly 6–7 per working day. This answers the question filed
against F.11 and F.6: manual IRN generation at that rate is about ten minutes a
day, so **Phase 1 invoicing with manual IRNs is viable** and the Tally ledger fix
does not have to wait for e-invoicing automation.

**Their documents are heavily multi-rate.** Eight to twelve distinct HSN codes
per invoice across two rates. Tally's own "Tax Analysis" output _is_ an HSN-wise
summary — the same table F.4 built, and the one they reconcile against. F.4's
output should be checked against these three invoices directly.

**Their Tally is now multi-user and hosted.** The screenshot showed TallyPrime
Silver, which is single-user; they have since moved to a multi-user edition and
to cloud hosting. That materially changes F.7 — see §3.

---

## 2. The six items

| #   | Ask                                  | State                                            | Est.             |
| --- | ------------------------------------ | ------------------------------------------------ | ---------------- |
| 1   | Clickable dashboard numbers          | Not built                                        | 1–2 d            |
| 2   | Bulk upload in inventory             | Dealers and products have it; inventory does not | 4–6 d            |
| 3   | Confirm order against incoming stock | **Contradicts current behaviour** — see §4       | 5–8 d + design   |
| 4a  | Proforma invoice                     | ✅ built                                         | —                |
| 4b  | Delivery challan                     | ✅ dispatch note — confirm it satisfies them     | —                |
| 4c  | Sales invoice                        | Not built — F.6                                  | ~4 d             |
| 4d  | Credit note                          | Not built                                        | 4–6 d            |
| 4e  | **Debit note**                       | Not built, **not on the plan at all**            | 2–3 d            |
| 4f  | E-way bill                           | Not built, GSP-gated                             | 5–8 d + contract |
| 5   | Live Tally sync, multi-user          | Not built — F.7, currently a deferred plugin     | 25–40 d          |
| 6   | Mobile app with scan                 | Not built                                        | 10–16 d          |

**Roughly 60–100 dev-days**, plus a GSP contract carrying 2–4 weeks of lead time
that has not started.

Two things to note on scope:

- **4b needs confirming, not building.** A dispatch note may or may not satisfy
  what they mean by a delivery challan. Ask before assuming either way.
- **4e is new information.** Debit note appears nowhere in the plan and usually
  pairs with credit note. File it.

---

## 3. Item 5 — live Tally sync, and why it improves

F.7 was deferred as a paid plugin on the argument that a one-way export solves
the stated problem. **The client has now said it does not**, and they are the
ones who have to use it. They are not asking for a new capability: their
Swipe→Tally sync is already live, and it is the thing that is broken — on
voucher `MA/26-27/1079` it collapses ₹222.94 at 5% and ₹334.08 at 18% into a
single ₹557.02.

F.7's recorded objection was operational fragility: _their Tally must be running
and reachable_. On a desktop that meant machine on, Tally open, company loaded,
office internet up, dynamic IP, NAT. **On hosted infrastructure that objection
largely dissolves** — always on, static IP, no NAT.

**The mechanism is unchanged by hosting.** TallyPrime integrates by running as an
HTTP server on a configurable port (default 9000) accepting XML, on-premise or
hosted alike.

**One design constraint that is not negotiable:** Tally's XML API has **no
authentication**. Anyone who can reach port 9000 can read and write vouchers. It
must never be exposed to the public internet. The correct shape is an
**outbound-only agent** that runs beside Tally, polls Dealerlink, and posts to
`localhost:9000`. That also survives a move back on-premise, which is worth
building for.

**Sequencing within item 5 — CORRECTED 2026-10-03, AND IT IS NOW INVERTED FOR
HALF OF IT.** This read: "the hard part — ledger mapping, rate-wise voucher
construction, product-name matching — is identical for export and for sync. F.11
builds that; the agent is transport on top. So F.11 first, not as a substitute but
because sync needs something correct to transport." **The first three sentences
still hold. "F.11 first" does not.** The agent's **READ** path — transport,
credentials, and fetching ledgers and stock items out of Tally — needs none of the
mapping, and F.11 now needs it, because the masters come through the integration
rather than through an exported file. Order: **F.148 (agent transport +
masters-read) → F.11 (fetch-then-select) → F.12 → F.13 → F.178 (agent write
path)**, days 54–77. Reasoning on F.148.

**And the constraint that outranked both — DROPPED 2026-10-03. IT DOES NOT
ARISE.** This read: "the export or sync only helps once **Dealerlink issues the
invoices**. While Swipe is the invoice of record there is nothing to export, and
running both sync paths would double-post every sale." **The second half assumed a
parallel run. The plan is a migration with a cutover** (operator ruling,
2026-10-03), so Swipe and Dealerlink are never systems of record at the same time
and the same sale cannot be posted twice. **The first half survives in a different
form:** the sync is useful from the **cutover date**, and the cutover needs their
historical data in Dealerlink first — filed as F.179, extraction route unknown.
The volume measurement above is what makes the cutover viable before e-invoicing
is automated, because manual IRN generation at that rate is about ten minutes a
day (F.154).

---

## 4. Item 3 — the one needing a design decision

Order confirmation currently **blocks** on insufficient stock, naming the short
product. That is a genuine differentiator: their own Swipe screen shows
`Stock: -84.00 NOS` against a 36-unit proforma.

**They are not asking to remove it.** They are asking it to count stock already
on the way — a confirmed procurement in transit or under order. That is how
distribution actually works, and refusing it would be defending a control they
did not object to.

But it is a real design change, not a flag:

- Reservation would need to recognise **expected inventory with an expected
  date**, distinct from stock on hand.
- **A serial cannot be reserved before it exists.** Today reservation binds
  serials FIFO at confirmation; against incoming stock there is nothing to bind.
  Either reservation becomes quantity-based with serials bound at dispatch — the
  option rejected in F.84's Q-series as too large — or incoming stock is
  reserved by quantity while on-hand stock is reserved by serial, which means
  two mechanisms.
- **Do not implement it as a "confirm anyway" override.** An override destroys
  the control: people click through it and the block stops meaning anything.

This wants an audit and a spec of its own before any build, on the F.3/F.5a
pattern.

---

## 5. Proposed sequence

The deal does not turn on the pipeline or the HSN table. It turns on whether
parity arrives before they lose patience — and parity is 3–5 months at current
pace. The ordering below front-loads what unblocks the rest and what is cheap.

| Order | Work                               | Why here                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Items 1 and 2                      | Cheap, visible, buys goodwill while larger work runs                                                                                                                                                                                                                               |
| 2     | **F.6 + credit note + debit note** | One body of work, ~10 d. Makes Dealerlink the system of record, which everything downstream needs                                                                                                                                                                                  |
| 3     | F.11 mapping module                | Specifiable now. **Corrected 2026-09-29:** this read "needs their Tally masters export — request it now, it is the longest client-side lead", which was wrong (see §7) — the export is a step in their onboarding, not an input to the design, so nothing here waits on the client |
| 4     | Tally export, then the sync agent  | Export first: sync is transport over the same mapping                                                                                                                                                                                                                              |
| 5     | Item 3 audit and spec, then build  | Needs a design decision, not a flag                                                                                                                                                                                                                                                |
| 6     | Mobile app with scan               | Largest single item; depends on nothing above                                                                                                                                                                                                                                      |
| —     | **GSP contract**                   | Runs in parallel from now. Gates e-way bill and e-invoicing; 2–4 weeks of paperwork, not started                                                                                                                                                                                   |

**F.5b and the remaining Stage F backlog** sit behind this. The parity list is
adoption-blocking; most of the backlog is not.

---

## 6. What to file

1. **Debit note** — new, nothing owns it.
2. **Clickable dashboard numbers** — new.
3. **Bulk upload in inventory** — new; dealers and products already have the
   pattern to follow.
4. **Confirm against incoming stock** — new, HIGH, with §4's design constraints
   recorded so nobody implements it as an override.
5. **F.7 re-scoped** — out of deferred-plugin status, with the hosting change,
   the outbound-agent constraint, and the F.11-first sequencing.
6. **F.115 amended** — the real GSTIN and PAN. The two-entity question goes
   into the ONBOARDING TEMPLATE, not into a list of things to ask this client:
   which entity to provision is a question every tenant answers at onboarding,
   so asking it once as a bespoke favour builds nothing, while a field on the
   template asks it of everyone forever.
7. **F.11 and F.6 amended** — the measured invoice volume, and what it implies
   about Phase 1 invoicing with manual IRNs.
8. **Delivery challan** — confirm whether the dispatch note satisfies it. A
   question, not a task.

---

## 7. Open questions for the client

Exactly one, and the two this section originally carried are gone. Both were
removed for the same reason rather than for two reasons: a question whose answer
every tenant supplies at onboarding is not an open question about this client,
it is a missing field on the onboarding template. Asked bespokely it yields one
answer and no mechanism; asked by the template it yields an answer from every
tenant, including the ones nobody has met yet.

- Does the existing dispatch note serve as their delivery challan? **This one
  stays**, because it is not a fact about the client to be collected — it is a
  question about whether a document WE already render satisfies a statutory
  purpose, and the answer changes what we build.

**Moved to the onboarding template, not asked here:**

- **Which legal entity is being onboarded** — _Maharudra Agencies_ or
  _Maharudra Solar Agencies Pvt Ltd_. Every tenant has exactly this question and
  the GSTIN is wrong if it is answered wrongly, so it belongs on the provisioning
  form (see §6 item 6).
- **The Tally masters export — ledgers and stock items.** This section had it as
  the longest-lead-time client-side item, blocking F.11's specification. That is
  **wrong, and the correction is not a scheduling change but a change of
  direction**: the export is not coming from the client at all. It is part of
  THEIR ONBOARDING — the data we import to stand their tenant up — not an input
  we need in order to design the Tally export format. F.11 is specified against
  Tally's documented import shape, which does not depend on this client's
  particular ledger names. Waiting on it would have blocked a design on data
  that only ever mattered at migration time.
