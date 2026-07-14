# ShopMS — Gap Analysis

What's missing, unfinished, duplicated, or risky in the current codebase, found during a full
line-by-line read (2026-07-14). Companion to `API_README.md`, `FRONTEND_README.md`, and
`PERFORMANCE_ANALYSIS.md` (fetch/render/query cost is covered there, not repeated here).

---

## 1. Dead / Unused Code

| Item | Where | Detail |
|---|---|---|
| `CheckoutModal.tsx` | `components/pos/CheckoutModal.tsx` (235 lines) | Not imported by any other source file (verified: only self-reference, `README.md`, and the build artifact `tsconfig.tsbuildinfo` mention it). `POSTerminal.tsx` has its own separate, slightly-diverged inline checkout flow instead — the two have drifted (`CheckoutModal` has no `discount` field; it always sends `phone` unconditionally where `POSTerminal` conditionally omits it for phone-less customers). Either delete it, or if it was meant to replace the inline flow, finish that migration and delete the inline version instead. |
| `handleDispatch` / `?action=dispatch` | `app/api/customers/[id]/route.ts:121-203` | Fully implemented, validated, cross-branch-IDOR-protected — but no frontend code calls it. Leftover from a removed wholesale-dispatch page (per project history). |
| `handleAutoDispatch` / `?action=auto-dispatch` | `app/api/customers/[id]/route.ts:254-361` | Same situation — implemented and safe, but unreferenced by any current UI. The equivalent live functionality is instead served by `PATCH /api/daily-orders` (`DailyOrders.tsx`), which duplicates most of this logic independently (see §3). |
| `/wholesale-orders` path reference | `proxy.ts` `adminOnlyPaths` array | Middleware still lists a route that doesn't exist under `app/(admin-dashboard)/`. Harmless (matching a non-existent path is a no-op) but signals leftover cruft from the same removed feature. |
| `userId` prop | `POSHeader.tsx` `Props` type, `POSTerminal.tsx` `Props` type | Declared, never destructured or read in either component body. |

**Recommendation**: either wire up `dispatch`/`auto-dispatch` to a real UI entry point (if wholesale
manual dispatch is still a wanted feature) or delete both handlers and the `DispatchSchema` — carrying
untested, unreachable code paths is a liability even when currently harmless.

---

## 2. Missing Tests

**Zero test files exist anywhere in the repository** — no `*.test.*`/`*.spec.*` files, no test
runner configured in `package.json` (`scripts` has `dev`/`build`/`start`/`lint`/`seed` only, no
`test`). This is the single largest structural gap in the project.

Highest-value places to start, given what's actually fragile here:
1. **Business-math formulas** — `expectedDrawerCash`, the opening-cash carry-forward with late
   withdrawals (`lateWithdrawalsSince()`), `updateDailySummary`'s rollup math. These have already
   had multiple real bugs found only by careful manual live-testing (per project history:
   `procurementCost` silently never persisted, lock-time opening cash hardcoded to 0). Formula
   correctness here directly affects real money reconciliation — this is exactly the kind of logic
   that benefits most from a regression test suite instead of re-verifying by hand every time it's
   touched.
2. **RBAC/branch-isolation checks** — every route's access-control branching (`assertBranchAccess`,
   the `getActorAndTarget` actor/target rules in `/api/users/[id]`) is security-relevant and easy
   to silently regress with a future refactor.
3. **The day-status gate** — `POST /api/transactions` blocking sales when `Pending`/`Locked`.

No CI configuration (no `.github/workflows/`, no other CI config found) — so even if tests
existed, nothing would currently run them automatically on push/PR.

---

## 3. Duplicated Logic (drift risk)

| Logic | Duplicated in | Risk |
|---|---|---|
| Bangladesh phone regex `/^01[3-9]\d{8}$/` | `lib/validators.ts` (`bdPhone`, canonical), `CustomerManager.tsx`, `UserManager.tsx`, `app/(auth)/login/page.tsx` | Four independent copies of the same regex. A future format change (e.g. a new prefix range) requires remembering to update all four; missing one produces inconsistent client-side validation vs. the server's actual rule. |
| Standing-order dispatch math (pooled/normal stock deduction, COGS, khata update) | `app/api/customers/[id]/route.ts` (`handleAutoDispatch`, unused per §1) and `app/api/daily-orders/route.ts` `PATCH` (live) | Two independent implementations of "dispatch a Paikari customer's fixed-rate order" exist. Since one is dead code, the risk is currently latent, but if `auto-dispatch` is ever revived without deleting/reconciling the other, they will diverge further. |
| `canManage()` actor/target authorization rule | `components/admin/UserManager.tsx:79-81` (client-side UI-hiding mirror) and `app/api/users/[id]/route.ts` `getActorAndTarget()` (server-side, authoritative) | The client copy only controls which Edit/Delete icons render — the server route is the real enforcement point, so this isn't a security gap. But if the server rule changes and the client mirror isn't updated in lockstep, the UI will show actionable buttons that silently 403, which is a real (if minor) UX regression risk worth a comment linking the two. |
| Transaction-type vocabulary | `SalesLog.tsx`'s `SALE_TYPES`, `CASH_IN_TYPES`, `TYPE_BN`, `TYPE_COLORS` (4 parallel hardcoded arrays/maps) vs. the backend's `TransactionType` union (`types/index.ts`) | Adding a new transaction type (as happened with `Owner Purchase`/`Owner Withdrawal`) requires remembering to update every one of these lists by hand; nothing enforces exhaustiveness. |
| Super-admin seeding | `lib/seed-admin.ts` (upserts every server boot) vs. `scripts/seed.ts` (`npm run seed`, only creates, never updates) | Two independent implementations of the same conceptual operation with different semantics (upsert vs. create-only). Not currently harmful since `seed-admin.ts` runs automatically and `seed.ts` is optional/manual, but confusing for anyone reading the codebase cold — pick one source of truth, or clearly document why both exist. |
| Bangladesh-time display | 3 different techniques across `BranchReport.tsx`/`OwnerLedger.tsx` (explicit `timeZone: 'Asia/Dhaka'`), `StockLogViewer.tsx` (`'en-BD'` locale, no explicit timezone), `AnalyticsDashboard.tsx` (plain browser-local time, no Bangladesh handling at all) | Functionally near-equivalent for users physically in Bangladesh, but not equivalent for an admin accessing from elsewhere, and not consistent as a codebase convention. Extract one shared `formatBDTime()` util. |

---

## 4. Known Bugs / Sharp Edges (carried forward, verified still present)

- **Zod v4 `.partial()` drops nested `.default()`** — `ProductUpdateSchema =
  ProductCreateSchema.partial()` (`lib/validators.ts:130`) loses defaults on nested
  `variants[]`/`pooledStock[]` schemas. Confirmed still present in current source. Only the
  variant-update path is actually affected in practice (verified against current route usage), but
  the schema itself remains a footgun for any future code that reuses it differently.
- **`GET /api/daily-closing` has a write side effect** — when `status === 'Open'`, it recomputes
  `mathematicalSystemTotals` and calls `.save()` before returning (`app/api/daily-closing/route.ts:119-123`).
  Intentional (keeps totals fresh for the next reader) but worth flagging since it means this GET
  is not idempotent/side-effect-free, which can surprise anyone adding caching, retries, or
  prefetching later.
- **No rate limiting on login** (`app/api/auth/[...nextauth]/route.ts` → NextAuth credentials
  flow) — `authorize()` (`lib/auth.ts`) has no attempt counter, no lockout, no delay-on-failure.
  Combined with `console.log('[auth] password mismatch for:', credentials.phone)` logging the raw
  phone number on every failed attempt, a scripted brute-force attempt against a known phone
  number is both unthrottled and would flood application logs with that phone number. Low
  real-world severity for an internal multi-branch POS tool behind normal network access controls,
  but worth a note if this is ever exposed to the open internet.

---

## 5. Production-Readiness Gaps

- **No structured logging / error monitoring** — every error path is `console.log`/`console.error`
  (grepped across `lib/auth.ts`, `lib/db.ts`, all seed scripts). No integration with an error
  tracker (Sentry or equivalent), no log levels, no request-ID correlation. In production this
  means failures are only visible if someone is tailing server stdout at the time.
- **No health-check endpoint** — nothing like `GET /api/health` exists for load-balancer/uptime
  monitoring to hit.
- **No CI pipeline** — no `.github/workflows/` or equivalent; `npm run build`/`lint` are not
  automatically verified on push.
- **`.env.example` password value is a real-looking strong password** (`Agnos@ShopMS2026!`) rather
  than an obvious placeholder like `changeme` — low risk since it's an example file, but worth
  swapping for a clearly-fake placeholder so nobody ever mistakes it for a real credential to keep.
- **Seed/reseed behavior**: `seedAdmin()` runs on **every** server start/restart/hot-reload in dev
  and re-hashes+re-applies the password from env every time (`lib/seed-admin.ts:20-22`). This is
  documented as intentional (README "Known Gotchas"), but worth double-checking it's the wanted
  behavior in production too — an accidental env-var change would silently reset the super admin's
  password on the next deploy/restart with no confirmation step.
- **No API request size limits / no explicit rate limiting** anywhere beyond what Next.js
  provides by default — relevant mainly for the public-facing login endpoint (§4) but worth a
  general pass before any external exposure.

---

## 6. Feature-Completeness Notes (not bugs, just worth naming)

- **Stock-check discrepancy** (`DailyClosing.discrepancies.stockMismatch`) is declared in the
  schema and typed throughout, but every write path that sets `discrepancies` (`POST
  /api/daily-closing`) only ever sets `stockMismatch: 0` hardcoded — the actual per-product
  physical-vs-system stock gap data is captured (`physicalStock[]`, `stockCheckReasons[]`) but
  never rolled up into this summary field. If `stockMismatch` is meant to represent an aggregate
  discrepancy count/value, that rollup doesn't exist yet.
- **`DailyClosing.managerSubmittedTotals.remainingMilkStock`** is captured from the UI
  (`ZReport.tsx`'s `totalPreOrders`/milk-specific computation) but its only consumer downstream
  appears to be display — not consulted by any business-logic branch (e.g. it doesn't feed into
  next-day stock reconciliation automatically). Worth confirming this matches intent.
- **Milk/dairy-specific heuristics are hardcoded by product name**, not by a formal product flag —
  e.g. `ZReport.tsx:122`: `p.name.toLowerCase().includes('milk') || p.productCode?.toLowerCase()
  === 'milk'`. Works for the current single-category use case but is brittle if the product catalog
  ever needs a second "pre-order tracked" category — would silently fail to include it unless the
  name also happens to contain "milk".

---

## 7. Documentation Gaps (addressed by this pass)

Before this session, the only documentation was the original `README.md` (accurate but became
stale in a few places relative to current source — e.g. it still describes `DailyClosing.status`
as a 2-value `Open|Locked` enum, missing the `Pending` state added later) and `last_commit_analysis.md`
(a single-commit snapshot, not a living reference). This pass adds:

- `API_README.md` — full backend contract, verified against current source line-by-line.
- `FRONTEND_README.md` — full frontend structure, component inventory, state/theming conventions.
- `PERFORMANCE_ANALYSIS.md` — root-cause performance findings with fixes, prioritized.
- `GAP_ANALYSIS.md` (this file) — dead code, missing tests, duplicated logic, production gaps.

**Recommendation**: treat the original `README.md` as the high-level onboarding doc (tech stack,
quick start, getting-started) and these four as the detailed reference layer — update `README.md`'s
"Data Models" and "API Routes" sections to point here rather than maintaining the same information
in two places (see the root `README.md` pointer section added alongside this pass).
