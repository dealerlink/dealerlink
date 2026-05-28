# DNS Architecture Diagnostic — Pre-D.2

Run as a standalone prompt before starting Stage D Day D.2.

**Status context:** Stage D Day D.1 + follow-up complete. DEV.74-77 landed. Currently at DEV.77. /api/health all green. Pilot tracking June 3.

**Purpose:** Accurately document the DNS routing architecture for `app.dealerlink.in` so D.3's wildcard SSL decision has correct ground truth + concrete handoff actions, not "decide later."

**Estimated time:** ~30 minutes. Documentation-only, no infrastructure changes.

## Prompt for Claude Code

```
You are doing a focused DNS architecture diagnostic for Dealerlink production before starting Stage D Day D.2. D.1 + D.1 follow-up are complete (latest commit 063e2ea). Production is at app.dealerlink.in with all observability + email wired and verified.

Today's task: accurately characterize the DNS routing for app.dealerlink.in, document it in the right docs, and produce concrete handoff actions for D.3's wildcard SSL decision (so D.3 starts with a decision-ready brief, not open-ended exploration).

CONTEXT — WHAT WE KNOW:
1. Our Cloudflare zone for dealerlink.in has:
   - app (CNAME → dealerlink-production-8treh.ondigitalocean.app) — DNS only / gray-cloud
   - dealerlink.in apex (A → 2.57.91.91) — Proxied / orange-cloud
   - *.staging (CNAME → DO staging origin) — DNS only / gray-cloud
   - staging (CNAME → DO staging origin) — DNS only / gray-cloud
   - www (CNAME → dealerlink.in) — Proxied / orange-cloud

2. nslookup verification (already done by operator):
   nslookup app.dealerlink.in 1.1.1.1
   → Resolves to 172.66.0.96, 162.159.140.98, 2606:4700:7::60, 2a06:98c1:58::60
   → These are Cloudflare IP ranges (/16), NOT DigitalOcean

3. Therefore: DO App Platform routes through Cloudflare's edge network (DO's own Cloudflare integration). NOT a configuration error on our side.

4. Current state: we have working SSL on app.dealerlink.in only. No wildcard cert yet for tenant subdomains (<tenant>.dealerlink.in). D.3 must resolve this before Stage E pilot onboarding.

GOAL:
- Verify the architecture (re-confirm + capture details)
- Document it accurately in handoff docs
- Produce a CONCRETE D.3 plan for wildcard SSL — not "decide later" but "do X, Y, Z in this order"

PRELIMINARY:
P.1. pnpm preflight green
P.2. Read docs/STAGE_D_HANDOFF.md §6 (Production Domain + DNS Plan) — find what was written
P.3. Read docs/PRODUCTION_ENV.md — DNS notes
P.4. Read docs/DEPLOYMENT.md — Cloudflare/DNS sections
P.5. Read docs/STAGING_ENV.md — staging DNS context (same DO-Cloudflare pattern applies)
P.6. Read DEVIATIONS.md — confirm current count is DEV.77 (this prompt's new entry will be DEV.78)

==========================================================
CHUNK A — Verify the architecture
==========================================================

A1. Confirm DNS resolution for app.dealerlink.in:
   - Run: nslookup app.dealerlink.in 1.1.1.1
   - Capture output to /tmp/dns-diagnostic.md
   - Confirm IPs are Cloudflare (whois or ARIN check; document the IP ranges 172.66.0.0/16, 162.159.0.0/16, 2606:4700::/32)

A2. Confirm DNS resolution for the underlying DO domain:
   - Run: nslookup dealerlink-production-8treh.ondigitalocean.app 1.1.1.1
   - This is the CNAME target
   - Expect same Cloudflare IPs — confirming DO routes through Cloudflare independently of our zone

A3. Confirm the same pattern for staging:
   - Run: nslookup demo.staging.dealerlink.in 1.1.1.1
   - Should ALSO resolve to Cloudflare IPs (same DO architecture)
   - Documents that this isn't a production-specific quirk

A4. Check the SSL cert chain at edge:
   - Run: curl -vI https://app.dealerlink.in 2>&1 | findstr -i "issuer subject"  (Windows)
   - OR: curl -vI https://app.dealerlink.in 2>&1 | grep -i "issuer\|subject"  (Unix-like)
   - Identify cert issuer (expect Let's Encrypt via DO)
   - Identify subject (should be app.dealerlink.in, not a wildcard)

A5. Test wildcard cert behavior — IMPORTANT FOR D.3:
   - Run: curl -vI https://test-tenant.dealerlink.in 2>&1 | findstr -i "issuer subject expire"
   - This is a hypothetical tenant subdomain that doesn't exist
   - Expected: Either:
     (a) DNS resolves (we have a CNAME * record?) AND cert covers it → wildcard already works
     (b) DNS resolves AND cert mismatch → cert needs wildcard upgrade
     (c) DNS doesn't resolve → we need to add wildcard CNAME first
   - Document which case applies — this directly informs D.3 plan

A6. Inspect DO App Platform domain configuration:
   - Run: doctl apps spec get <prod-app-id> | findstr -i domains  (Windows)
   - OR equivalent grep
   - Note which domains are currently configured on the production app
   - Note whether wildcard *.dealerlink.in is already set up OR not

A7. Research DO App Platform wildcard SSL support:
   - Either via doctl help/docs OR via DO's published documentation
   - Specifically: does DO App Platform support wildcard custom domains natively?
   - If yes: what's the verification mechanism (HTTP-01 fallback for wildcards is impossible; DNS-01 is required)
   - If no: what's the workaround?
   - Document findings concretely (link to relevant DO doc page or screenshot)

A8. Capture all findings to /tmp/dns-diagnostic.md:
   - nslookup outputs
   - IP whois confirmation
   - Cert chain results
   - DO wildcard support status
   - Recommended D.3 path

==========================================================
CHUNK B — Update documentation
==========================================================

B1. Update docs/STAGE_D_HANDOFF.md §6 (Production Domain + DNS Plan):

Replace any "gray-cloud, direct to DO" framing with the accurate description:

```

## DNS Architecture

Our Cloudflare zone for dealerlink.in:

- app (CNAME → dealerlink-production-8treh.ondigitalocean.app) — DNS only (gray-cloud)
- \*.staging + staging (CNAME → DO staging origin) — DNS only (gray-cloud)
- dealerlink.in (apex A record) — Proxied (orange-cloud) — for future marketing site
- www (CNAME → dealerlink.in) — Proxied (orange-cloud) — apex redirect

Resolution path for production app traffic:
User → Our Cloudflare DNS (gray-cloud)
→ CNAME resolves to ondigitalocean.app subdomain
→ ondigitalocean.app is itself behind Cloudflare's edge (DO's Cloudflare integration, NOT ours)
→ DO origin servers (BLR1 region)

Verified: app.dealerlink.in resolves to Cloudflare IPs (172.66.0.96, 162.159.140.98), NOT DO IPs. This is DO App Platform's architecture, not a misconfiguration.

Implications:

- Basic DDoS protection + edge SSL termination is already provided by DO's Cloudflare integration.
- SSL certificates are managed by DO via Let's Encrypt.
- We CANNOT add custom Cloudflare WAF rules to app traffic without conflict — traffic is already on DO's Cloudflare. Custom WAF would require switching to droplets behind our own Cloudflare (out of scope).
- The "gray-cloud" decision in our zone is correct: avoids double-proxy conflict with DO's setup, while traffic remains Cloudflare-fronted (via DO).
- Note: this measurement-vs-app distinction also explains the BetterStack response time spikes (DEV.76) — /api/health includes a Resend US-region fetch in responseMs.

```

B2. Add a new subsection to STAGE_D_HANDOFF.md §6 — D.3 WILDCARD SSL HANDOFF:

This is the concrete decision-ready brief for D.3 (NOT "decide later"):

```

## D.3 Wildcard SSL — Concrete Handoff Plan

REQUIREMENT: By end of D.3, \*.dealerlink.in must serve HTTPS with a valid wildcard cert. Stage E pilot onboarding creates the first tenant subdomain (e.g., acme.dealerlink.in) and must have working SSL.

CURRENT STATE (verified in this diagnostic):

- app.dealerlink.in: working SSL (Let's Encrypt via DO), single-domain cert
- \*.dealerlink.in: <STATE FROM A5 — does it work? does cert cover? document>
- DO App Platform wildcard support: <STATE FROM A7 — yes/no, mechanism>

EVALUATION OF OPTIONS:

Option A: DO-managed wildcard via DO App Platform native support

- Approach: Add \*.dealerlink.in as a custom domain in DO App Platform spec
- DO handles Let's Encrypt DNS-01 challenge automatically
- Prerequisite: <STATE FROM A7 — does DO support this?>
- If supported: PREFERRED — simplest path, automated cert renewal
- Effort estimate: ~30 minutes

Option B: Manual wildcard via Cloudflare API + Let's Encrypt + acme.sh or similar

- Approach: Run Let's Encrypt DNS-01 challenge ourselves using Cloudflare API
- Get the cert, upload it to DO App Platform as a custom cert
- Prerequisite: Cloudflare API token with DNS edit scope for dealerlink.in
- Cert renewal: needs cron/automation (90-day expiry on Let's Encrypt)
- Effort estimate: ~2-3 hours initial + ongoing renewal automation
- Use only if Option A unavailable

Option C: Cloudflare Origin Certificate (15-year self-signed by Cloudflare)

- REJECTED. Requires orange-cloud proxying in our zone, which conflicts with DO's Cloudflare setup (double-proxy).
- Documented for completeness; don't pursue.

RECOMMENDATION FOR D.3:

1. Attempt Option A first (~30 min)
2. If DO doesn't support wildcards natively: fall back to Option B (~2-3 hours)
3. Verify cert covers \*.dealerlink.in by curling a hypothetical subdomain (e.g., test-pilot.dealerlink.in) — expect cert success even if DNS doesn't resolve
4. Document the chosen approach + renewal procedure in PRODUCTION_ENV.md

PREREQUISITES TO PREPARE BEFORE D.3 STARTS:

- [ ] If Option B may be needed: Cloudflare API token with DNS edit scope for dealerlink.in (operator creates in Cloudflare dashboard)
- [ ] DO App Platform docs link for wildcard custom domains (captured in this diagnostic)

D.3 GO/NO-GO GATE:
By end of D.3, the following must be true:

- curl -vI https://acme-test.dealerlink.in returns 200 with cert.subject matching \*.dealerlink.in
- Cert renewal mechanism documented + tested (or automated)
- PRODUCTION_ENV.md updated with the wildcard SSL approach

```

B3. Update docs/STAGING_ENV.md:
   - Add brief architecture note (mirror of §6 above)
   - Note: staging has same DO-Cloudflare pattern but already has wildcard SSL via *.staging.dealerlink.in (from C.0)
   - Document HOW staging got its wildcard cert — that's the proven-working precedent for D.3

B4. Update docs/PRODUCTION_ENV.md:
   - Brief note: production DNS architecture is documented in STAGE_D_HANDOFF.md §6
   - Don't duplicate the architecture description
   - Add a row to the current state table: "Wildcard SSL: pending D.3"

B5. Update docs/DEPLOYMENT.md:
   - If it has a Cloudflare/DNS section, update to reference STAGE_D_HANDOFF.md §6 for accuracy
   - This is the operational doc — keep it brief, point to the authoritative source

B6. Log this as DEV.78:
   "DNS resolution path for *.dealerlink.in (excluding apex/www) routes through DO App Platform's Cloudflare integration, not directly to DO origin servers. Our Cloudflare zone is gray-cloud (correct) but the underlying ondigitalocean.app target is Cloudflare-fronted. Verified via nslookup (resolves to 172.66.x / 162.159.x — Cloudflare IPs). Not a configuration error — DO's architecture. Documented in STAGE_D_HANDOFF.md §6. Directly informs D.3 wildcard SSL decision constraints (see §6 'D.3 Wildcard SSL Handoff' for concrete plan)."

B7. Closeout:
   - pnpm preflight green (doc-only)
   - Commit: `docs(dns): accurately document DO/Cloudflare routing + D.3 wildcard SSL handoff plan`
   - Push to main (no code change → no functional impact on staging or prod)

GUARDRAILS:
- DOC-ONLY. No infrastructure changes. No DNS record changes. No SSL cert changes.
- Do NOT change the gray-cloud/orange-cloud configuration in Cloudflare — current setup is correct.
- Do NOT change DO App Platform domain config — that's also correct.
- This diagnostic ACCURATELY DOCUMENTS what's already in place AND prepares D.3 with a concrete handoff plan.
- The D.3 plan in B2 should be specific enough that D.3 starts execution, not decision-making. Provide effort estimates and prerequisites.

WHEN DONE:
- Print summary of nslookup outputs + IP ownership verification (Cloudflare confirmed)
- Print whether DO App Platform supports wildcard custom domains natively (A7 finding)
- Print whether wildcard cert currently works for *.dealerlink.in (A5 finding) — this is the gating question for D.3
- Confirm: STAGE_D_HANDOFF.md §6 now has architecture description + D.3 Wildcard SSL Handoff Plan section
- Confirm: DEV.78 logged
- Confirm: PRODUCTION_ENV.md, STAGING_ENV.md, DEPLOYMENT.md cross-reference the architecture doc
- Tell me the DNS diagnostic is complete + Stage D Day D.2 (F-1 + F-3 + DEV.64 + DEV.73) is cleared to start
- Critically: if A7 shows DO doesn't support native wildcards, flag this in your summary so the operator knows to create the Cloudflare API token BEFORE D.3 starts
```

## When to Run This

After D.1 follow-up wraps (it has). Before D.2 starts.

This prompt produces concrete handoff actions for D.3, not just "decide later." If DO doesn't support native wildcards, the operator needs to know NOW so they can create a Cloudflare API token between now and D.3.

## Watch For

If A7 (DO wildcard support research) returns "not supported natively," you'll need to create a **Cloudflare API token with DNS:Edit scope for the dealerlink.in zone**. Operator step. Claude Code will flag it explicitly in the closeout summary.

If A7 returns "supported natively," D.3 wildcard SSL becomes a 30-minute task instead of 2-3 hours.

Either way, you'll enter D.3 with a known plan, not exploratory work.
