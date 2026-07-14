# ShopMS — API / Backend Reference

Stack-agnostic-ish reference for the ShopMS backend: every route, every data model, every
business formula, exactly as implemented in `app/api/`, `models/`, `lib/`. This document is
generated from a full read of the current source (2026-07-14), not from memory or the older
`README.md` — where the two disagree, this file reflects the actual code.

For frontend structure see `FRONTEND_README.md`. For performance findings see
`PERFORMANCE_ANALYSIS.md`. For known gaps/missing pieces see `GAP_ANALYSIS.md`.

---

## 1. Tech Stack (backend-relevant)

| Layer | Library / Version (installed) |
|---|---|
| Framework | Next.js 16.2.9 (App Router, Turbopack, Route Handlers) |
| Language | TypeScript 5.4, strict mode |
| Database | MongoDB via Mongoose 8.4 |
| Auth | NextAuth 4.24 — Credentials provider, JWT session strategy |
| Validation | Zod 4.4 |
| Hashing | bcryptjs (cost factor 12) |
| Middleware | `next-auth/middleware` (`proxy.ts`, edge-compatible) |

`next.config.mjs` sets `serverExternalPackages: ['mongoose']` (required — Mongoose is a
Node-only package and must be excluded from Turbopack's server bundle). No other config.

---

## 2. Process Lifecycle

- **DB connection** (`lib/db.ts`): a global-scoped singleton cache (`global.mongooseCache`)
  holding `{ conn, promise }`. `dbConnect()` returns the cached connection if present, otherwise
  connects once via `mongoose.connect(uri, { bufferCommands: false })` and caches the promise so
  concurrent callers await the same in-flight connection rather than opening duplicates. This is
  the correct Next.js serverless-safe pattern — connection reuse across hot-reloads/route
  invocations in the same process.
- **Startup seed** (`instrumentation.ts` → `lib/seed-admin.ts`): on every server start (`register()`
  hook, Node runtime only — Mongoose cannot run on Edge), upserts a `SUPER_ADMIN` user from
  `SUPER_ADMIN_NAME` / `SUPER_ADMIN_PHONE` / `SUPER_ADMIN_PASSWORD` env vars. Always re-hashes the
  password (bcrypt cost 12) and re-applies `isActive: true`, even if the user already exists — so
  changing the password in `.env.local` takes effect on next restart without a manual migration.
- **Standalone seed script** (`scripts/seed.ts`, `npm run seed`): a separate, simpler duplicate of
  the same super-admin creation logic, run manually via `tsx --env-file=.env.local`. Unlike
  `seed-admin.ts` it does **not** upsert — if a user with that phone already exists it just logs
  and exits, it never updates the existing record. Two independent implementations of "create the
  super admin" exist in the codebase (see `GAP_ANALYSIS.md`).

---

## 3. Auth

- **Credentials**: `phone` (Bangladesh format, regex `^01[3-9]\d{8}$`, 11 digits) + `password`.
- **Flow** (`lib/auth.ts`): `authorize()` connects to the DB, dynamically imports the `User` model
  (see gotcha below), finds `{ phone, isActive: true }`, compares password via `bcrypt.compare`,
  and on success returns `{ id, name, phone, role, assignedBranches }`.
- **SUPER_ADMIN branch resolution happens at login, not from the stored record**: if
  `role === 'SUPER_ADMIN'`, `assignedBranches` is *not* read from the user document — it is
  computed fresh by querying every `Branch` with `isActive: true` and collecting their `_id`s.
  This means a SUPER_ADMIN's effective branch list updates automatically as branches are
  added/deactivated, without ever editing the user record — but also means the branch list is
  only as fresh as the last login (see Known Gotchas).
- **Session**: JWT strategy (no DB-backed sessions). `jwt()` callback copies `id`, `role`,
  `assignedBranches`, `phone` onto the token on sign-in; `session()` callback copies them onto
  `session.user`. Every route handler reads `session.user.{role,assignedBranches,id}` — these 4
  claims are the entire authorization surface.
- Inactive users (`isActive: false`) cannot log in — filtered out at the query level, not just an
  after-the-fact check.
- Every `authorize()` branch (missing credentials, user not found, password mismatch, success, or
  thrown error) is logged via `console.log`/`console.error` prefixed `[auth]` — including the raw
  phone number on failure paths. See `GAP_ANALYSIS.md` for the PII-in-logs note.

### Middleware (`proxy.ts`)

Runs on every request except `/api/*`, `/_next/static`, `/_next/image`, `favicon.ico`, `/login`
(see `matcher` config). Pure JWT/route-pattern logic, no DB calls:

1. No token → redirect `/login`.
2. `/branches*` → non-`SUPER_ADMIN` redirected to `/` (not a 403 page — existence not revealed).
3. Admin-only paths (`/analytics`, `/users`, `/products`, `/customers`, `/regular-orders`,
   `/wholesale-orders`, `/due`, `/branches`) → `MANAGER` silently redirected to
   `/{their branch}/pos` (or `/login` if somehow branchless).
4. `/[branchId]/(pos|transactions|customers|stock|due|z-report)` → non-`SUPER_ADMIN` must have
   `branchId` in `assignedBranches`, else redirect `/`.
5. Any other `/[24-hex-char-id]/...` path not matched by rule 4 gets the same branch check as a
   catch-all (covers unknown/future branch-scoped routes).

Note: `/wholesale-orders` is listed in the admin-only path array (line with `adminOnlyPaths`) but
no such route exists under `app/(admin-dashboard)/` — dead reference, harmless (see
`GAP_ANALYSIS.md`).

---

## 4. RBAC Capability Matrix

| Capability | SUPER_ADMIN | BRANCH_ADMIN | MANAGER |
|---|---|---|---|
| See/manage branches | all | own only, never told others exist | 403 |
| Create users | any role | MANAGER or a fellow BRANCH_ADMIN, own branches only | 403 |
| Edit/deactivate users | anyone | MANAGERs they can reach only — never a fellow admin, not even self | 403 |
| See buying price / profit margin | yes | yes (own branch) | never — stripped server-side |
| Create customers | any type, any branch | Retail + Paikari, own branch | Retail only, own branch |
| List customers | all | own branch(es), all customers | own-created-only by default; `due=1`/`pos=1`/`confirm=1` show whole branch |
| Products: create/edit | yes | yes, own branch pricing/stock | no |
| Products: delete | yes | no | no |
| Record sales (POS) | yes | yes | yes, gated by day-status |
| Record stock / procurement | yes | yes | yes |
| Daily closing (Z-Report) | yes | yes | yes |
| Analytics dashboard | yes, all branches | yes, own branch(es) | 403 |
| Self password change | yes | yes | 403 (explicit product decision) |
| Withdraw drawer cash | no (view-only) | yes, own branch, self only | no |
| Fund a purchase with own money | not offered | is the one being picked | picks which BRANCH_ADMIN funded it |
| Owner Ledger view | all branches | own branch | 403 |

"Never reveal other branches/SUPER_ADMIN exist" is the governing principle behind every denial:
generic `403 Forbidden` / `404 Not found`, never branch-naming error text; UI copy always singular
("your branch").

---

## 5. Data Models (`models/`)

### User
```
name: string (required)
phone: string (required, unique, indexed)
passwordHash: string (required)
role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'MANAGER' (required)
assignedBranches: ObjectId[] → Branch
isActive: boolean (default true)
timestamps: createdAt, updatedAt
```
Indexes: `phone` (unique), `role`, `assignedBranches`. Password never returned by any endpoint.

### Branch
```
name: string (required)
address?: string
contactPhone?: string
isActive: boolean (default true)
```
Index: `name`.

### Customer
```
name: string (required)
phone?: string (sparse unique — many customers can have no phone, no two can share one)
location?: string
customerType: 'Retail' | 'Paikari' (required)
registeredBranch: ObjectId → Branch (required, indexed)
createdBy?: ObjectId → User (indexed)
paikariConfig: {
  deliveryMethod: 'Pickup' | 'Send' (default Pickup)
  dailyRequirementLiters: number (default 0)
  fixedProductRates: [{ productId, variantId, lockedRate, dailyQty (default 1) }]
}
khata: {
  currentDue: number (default 0)
  lastPaymentDate?: Date
  creditLimit: number (default 5000)
}
```
Indexes: `registeredBranch`, `createdBy`, `customerType`, `khata.currentDue`, `phone` (sparse
unique).

### Product
```
productCode: string (required, unique, uppercased, indexed)
name: string (required)
category?: string
unitType: 'Liquid' | 'Weight' | 'Fixed' (required)
isOpenLoose: boolean (default false) — UI-only, allows decimal qty entry, no backend effect
isPooled: boolean (default false)
variants: [{
  variantId: string (required, /^[a-z0-9_]+$/)
  sizeLabel?: string
  portionSize: number (default 0)
  branchDetails: [{ branchId, stockLevel (default 0), buyingPrice (required), mrpPrice (default 0) }]
}]
pooledStock: [{ branchId, stockQty (default 0), buyingPrice (default 0) }]
```
Indexes: `productCode` (unique), `name`, `variants.branchDetails.branchId`, `pooledStock.branchId`.

Pooled products share one stock "tank" per branch (`pooledStock`, keyed by `branchId`) instead of
per-variant `branchDetails.stockLevel`. Selling/buying a pooled variant moves
`portionSize × quantity` against the tank; `branchDetails.stockLevel` stays 0 and is ignored for
pooled variants. Pricing (`mrpPrice`) is still per-variant even when pooled — only stock is shared.

### Transaction
The single ledger for every money/stock movement.
```
invoiceId: string (required, unique, indexed) — format below
branchId: ObjectId → Branch (required, indexed)
recordedBy: ObjectId → User (required) — who entered it
customerId?: ObjectId → Customer (default null)
ownerId?: ObjectId → User (default null) — which admin funded/withdrew (Owner Purchase/Withdrawal only)
transactionType: 'Cash Sale' | 'Credit Sale' | 'Partial Payment' | 'Due Collection'
                | 'Expense' | 'Procurement' | 'Owner Purchase' | 'Owner Withdrawal'
items: [{ productId, variantId, quantity, rateApplied, isCustomOverride (default false) }]
financials: {
  totalBill: number (default 0)
  discount: number (default 0)
  cashPaid: number (default 0)
  amountAddedToKhata: number (default 0)
  netProfitAmount: number (required, no default)
}
notes?: string
```
Indexes: `branchId+createdAt` (desc), `customerId+createdAt` (desc), `items.isCustomOverride`
(low-selectivity boolean — see `PERFORMANCE_ANALYSIS.md`).

Invoice ID format: `INV-{last4ofBranchId.upper}-{Date.now().toString(36).upper}-{3 random
base36 chars.upper}`. Not sequential/gapless — fine as a display ID, not for accounting-grade
sequential numbering.

`MANAGER` never sees `financials.netProfitAmount` (stripped server-side by
`stripSensitiveTransactionData`).

### DailyClosing
One document per `(branchId, date)`, unique compound index. `date` is a `YYYY-MM-DD` string, not
a `Date`.
```
branchId, date, status: 'Pending' | 'Open' | 'Locked' (default Pending)
mathematicalSystemTotals: {
  openingCash, cashSales, dueCollections, expensesLogged, procurementCost,
  ownerWithdrawals, expectedDrawerCash   (all default 0)
}
managerSubmittedTotals: { physicalCashCounted, remainingMilkStock }
discrepancies: { cashShortage, stockMismatch }
dayStartedAt: Date | null      — set when manager taps "Start Day"
dayLockedAt: Date | null       — set when Z-Report is locked
nightCashCounted: number | null
cashCheckReason: string | null — free text when |cash gap| > ৳30 (UI convention, not schema-enforced)
physicalStock: [{ productId, variantId, physicalQty, systemQty }]
stockCheckReasons: [{ productId, variantId, reason }]
tomorrowPreOrders: [{ productId, variantId, productName, quantity }]
submittedBy?: ObjectId → User
```
Index: `branchId+date` (unique).

### DailySummary
Pre-computed per-`(branchId, date)` rollup — the fast-read source for all analytics. Fully
re-aggregated (not incrementally patched) on every relevant write.
```
branchId, date
salesRevenue, cogs, grossProfit, salesCount
procurementCost, procurementCount, ownerPurchaseCost, ownerWithdrawals
expenses, netProfit
cashIn, cashOut, khataAdded, khataCollected
txCount
liquidSold, weightSold, liquidProcured, weightProcured
```
Indexes: `branchId+date` (unique), `date`.

### StockLog
Append-only audit trail, one row per stock mutation.
```
branchId, productId, variantId ('__pool__' for pooled), action: 'add'|'set'
quantityBefore, quantityChange, quantityAfter
buyingPriceBefore?, buyingPriceAfter?
paidFromCash: boolean
totalPurchaseCost?
notes?, recordedBy
```
Indexes: `branchId+createdAt` (desc), `productId+variantId+createdAt` (desc).

### DailyOrderLog
One row per `(branchId, date, customerId)`, unique compound index.
```
branchId, date, customerId, status: 'pending'|'taken'|'skipped'
transactionId? (set when taken), updatedBy?
```
Auto-created as `pending` for every Paikari-configured customer on first `GET` of a given day
(`bulkWrite` upsert, not a scheduled job).

---

## 6. Business Logic Formulas

**Sale profit** (Cash Sale / Credit Sale / Partial Payment):
`netProfitAmount = totalBill − totalCOGS`, where `totalCOGS = Σ(buyingPrice × quantity)` per line
(pool buying price for pooled products, `branchDetails.buyingPrice` otherwise).
`totalBill = max(0, subtotal − discount)`. `rateApplied` = the variant's `mrpPrice` if set (> 0),
else whatever the client sent — server treats `mrpPrice` as authoritative for the main POS path.

**Procurement / Owner Purchase**: `totalBill = quantity × buyingPrice`,
`netProfitAmount = -totalBill` (always negative — a cost, not revenue). Identical math; the only
difference is `Procurement` reduces `expectedDrawerCash` (store cash), `Owner Purchase` never does
(funded by a specific admin's own money, tracked via `ownerPurchaseCost`/`ownerId`).

**Owner Withdrawal**: `totalBill = cashPaid = amount`, `netProfitAmount = 0`. Reduces
`expectedDrawerCash` directly, and reduces *tomorrow's* opening cash if it happens after today is
already locked.

**Due Collection**: `totalBill = cashPaid = amountCollected`, `netProfitAmount = 0`,
`khata.currentDue -= amountCollected` (floored at 0).

**expectedDrawerCash** =
`openingCash + cashSales + dueCollections − expensesLogged − procurementCost − ownerWithdrawals`
— `cashSales` here = `cashPaid` summed over `Cash Sale + Partial Payment` only (not `Credit Sale`,
no cash changed hands). `Owner Purchase` never appears in this formula.

**openingCash carry-forward** (computed identically in 3 places — `GET`, `PATCH startDay`, `POST`
lock — via the shared `lateWithdrawalsSince()` helper):
```
openingCash(day N) = ( yesterday.nightCashCounted ?? yesterday.mathematicalSystemTotals.openingCash ?? 0 )
                    − ( Σ Owner Withdrawal cashPaid where yesterday.dayLockedAt < createdAt < start-of-day-N )
```
The subtracted term only applies if yesterday was actually locked (`dayLockedAt` set).

**DailySummary rollup** (`lib/update-daily-summary.ts`, full re-aggregation every call):
- `salesRevenue` = Σ totalBill where type ∈ {Cash Sale, Credit Sale}
- `grossProfit` = Σ netProfitAmount where type ∈ {Cash Sale, Credit Sale}
- `cogs` = salesRevenue − grossProfit
- `procurementCost` = Σ totalBill where type = Procurement
- `ownerPurchaseCost` = Σ totalBill where type = Owner Purchase
- `ownerWithdrawals` = Σ cashPaid where type = Owner Withdrawal
- `expenses` = Σ totalBill where type = Expense
- `netProfit` = grossProfit − expenses
- `cashIn` = Σ cashPaid where type ∈ {Cash Sale, Partial Payment, Due Collection}
- `cashOut` = Σ cashPaid where type ∈ {Procurement, Expense} (excludes Owner Withdrawal on purpose)
- `khataAdded` = Σ amountAddedToKhata (all types)
- `khataCollected` = Σ cashPaid where type = Due Collection
- `liquidSold`/`weightSold`/`liquidProcured`/`weightProcured` — separate `$lookup`-into-`products`
  aggregations to resolve `unitType` per item, summed by quantity

**Pooled inventory deduction**: `variantId = '__pool__'` for stock-log purposes;
`portionSize ?? 1` × quantity moves against the shared tank. Selling price still comes from the
variant's own `branchDetails.mrpPrice`; only stock is pooled.

**Regular order dispatch** (`PATCH /api/daily-orders`, `status: 'taken'`): quantity may be
overridden per line at dispatch time, but **price always resolves server-side** from
`customer.paikariConfig.fixedProductRates` — never client-supplied. Unmatched
product/variant pairs in a client override are silently dropped.

---

## 7. REST API Reference

All endpoints require a valid NextAuth session (`401` otherwise). `objectId` = 24 lowercase-hex
char string.

### Auth
No custom `/api/auth/*` routes beyond NextAuth's catch-all handler
(`app/api/auth/[...nextauth]/route.ts` — 6 lines, delegates entirely to `authOptions`).

### Account — `PATCH /api/account/password`
Self-service password change. **SUPER_ADMIN / BRANCH_ADMIN only** (403 MANAGER). Body:
`{ currentPassword, newPassword (min 6) }`. Verifies `currentPassword` via `bcrypt.compare` before
allowing change (`400` if wrong).

### Users — `/api/users`, `/api/users/[id]`
- `GET /api/users` — SUPER_ADMIN: all. BRANCH_ADMIN: `$or` of `{_id: self}` and
  `{role ∈ [MANAGER, BRANCH_ADMIN], assignedBranches ∈ own}` — never SUPER_ADMIN, never other
  branches. MANAGER: 403. `.select('-passwordHash')`, sorted by role then name.
- `POST /api/users` — creates. SUPER_ADMIN: any role. BRANCH_ADMIN: `MANAGER` or `BRANCH_ADMIN`
  only, `assignedBranches` must be a subset of their own (generic `403` if not). Non-SUPER_ADMIN
  role requires ≥1 `assignedBranches` (`400` if empty). `409` if phone already registered. Body:
  `{ name, phone, password, role, assignedBranches[] }`.
- `PATCH /api/users/[id]` — `getActorAndTarget()` helper: BRANCH_ADMIN can only touch a target
  whose `role === 'MANAGER'` and who shares a branch — cannot edit a fellow BRANCH_ADMIN or
  themselves via this route. Cannot elevate role away from what SUPER_ADMIN allows, cannot assign
  branches outside their own.
- `DELETE /api/users/[id]` — soft-delete (`isActive = false`), same actor/target rule as PATCH.

### Branches — `/api/branches`, `/api/branches/[id]`
- `GET` — SUPER_ADMIN: all. BRANCH_ADMIN: `{_id: {$in: assignedBranches}}`. MANAGER: 403.
- `POST` / `PATCH` / `DELETE` (soft, `isActive:false`) — SUPER_ADMIN only, role checked before any
  DB lookup (no existence-leak via response-shape timing).

### Branch Admins — `GET /api/branch-admins`
Minimal `[{_id, name}]` list of active BRANCH_ADMINs for **the caller's own branch only**
(`assignedBranches[0]` from session, never a query param). Callable by MANAGER (the actual user —
the "owner paid" picker on the stock screen) and BRANCH_ADMIN (harmless, unused today). `403` for
SUPER_ADMIN. Returns `[]` (not an error) if the branch has zero admins.

### Customers — `/api/customers`, `/api/customers/[id]`
- `GET ?type=&search=&branchId=&confirm=1&due=1&pos=1` — SUPER_ADMIN: all (or one `branchId`).
  BRANCH_ADMIN: own branches. MANAGER: default view restricted to `createdBy = self`; `due=1`
  (due page), `pos=1` (POS search), `confirm=1` (dispatch-confirm, strips to
  `{_id, name, customerType, dailyLitres}`) show the whole branch instead. **No `.limit()`
  anywhere in this handler — every list request returns the full matching set.**
- `POST ?quick=1` — phone optional, `customerType` defaults Retail, branch
  auto-resolved from session (falls back to body value only if actor has >1 branch). `409` returns
  `{ error, existing }` if phone taken. `POST` (full) — MANAGER can only create `customerType:
  Retail` (403 otherwise). `409` on duplicate phone.
- `GET /api/customers/[id]` — `404` (not `403`) if outside actor's branch, fails closed if
  `registeredBranch` is missing.
- `PATCH /api/customers/[id]` — same fail-closed check on the *existing* record, **plus** validates
  any *new* `registeredBranch` in the payload is also within the actor's branches (prevents
  cross-branch reassignment).
- `POST /api/customers/[id]?action=dispatch|collect|auto-dispatch` — all three verify
  `customer.registeredBranch === branchId` from the body before proceeding (cross-branch IDOR
  fix). **Only `action=collect` has a live UI caller** (`DuePage.tsx`) — `dispatch` and
  `auto-dispatch` are reachable, validated, and fully implemented, but nothing in the current
  frontend calls them (see `GAP_ANALYSIS.md`).
  - `?action=collect` — `{ branchId, amountCollected, notes? }` → `Due Collection` tx, decrements
    `khata.currentDue`.
  - `?action=dispatch` — `{ branchId, items: [{productId, variantId, quantity, rateApplied,
    skipped}] }` → manual wholesale dispatch, `Credit Sale` tx.
  - `?action=auto-dispatch` — `{ branchId, paymentMode: paid|partial|due, cashPaid?, notes? }` →
    dispatches from `fixedProductRates`, no manual item entry.

### Products — `/api/products`, `/api/products/[id]`
- `GET ?branchId=` — branch-scoped: queries `{'variants.branchDetails.branchId': branchId}` (full
  documents, **all** branches' `branchDetails` come back over the wire), then filters
  `branchDetails` down to the requested branch in application code. `buyingPrice` stripped for
  MANAGER unless `?context=stock`.
- `GET ?all=1` — SUPER_ADMIN/BRANCH_ADMIN global view. BRANCH_ADMIN gets **every product
  document** (all branches) fetched from Mongo, then `branchDetails` filtered to their own
  branches in application code afterward.
- `POST` — SUPER_ADMIN/BRANCH_ADMIN only. `409` on duplicate `productCode`.
- `PATCH /api/products/[id]` — general field update, or `{pushVariant: {...}}` to append a variant
  (`409` if `variantId` already exists).
- `PUT /api/products/[id]` — three body shapes: `{setPooledStock:true, branchId, stockQty,
  buyingPrice}` upserts the pool tank entry (`400` if product isn't pooled); normal
  `{variantId, branchId, buyingPrice, mrpPrice?, stockLevel?}` upserts that variant+branch's
  pricing/stock (`stockLevel` silently ignored if the product is pooled).
- `DELETE /api/products/[id]` — SUPER_ADMIN only, hard delete.

### Transactions — `POST/GET /api/transactions`
- `GET ?branchId=&date=&type=` — branch-scoped, `.populate('customerId', 'name phone')` +
  `.populate('recordedBy', 'name')`, sorted newest-first, `netProfitAmount` stripped for MANAGER.
  No `.limit()`.
- `POST` — the main POS checkout. Body: `{branchId, customerId?, transactionType, items[{productId,
  variantId, quantity, rateApplied}], discount?, cashPaid?, notes?}`. **Blocked 403** if today's
  `DailyClosing` doesn't exist or isn't `Open`. **Items are processed in a sequential `for` loop**
  — each iteration does an independent `Product.findById` then, after mutating in memory,
  `await product.save()` before moving to the next item (see `PERFORMANCE_ANALYSIS.md`). Deducts
  stock (pooled or normal path), computes `netProfitAmount` server-side, updates customer khata,
  triggers `updateDailySummary()` non-blocking (`.catch(() => {})`, fire-and-forget) after the
  response-relevant writes complete.

### Stock — `/api/stock-log`
- `POST` — adds/sets stock for branch+product+variant (or `variantId:'__pool__'`). Body:
  `{branchId, productId, variantId, action: add|set, quantity, buyingPrice?, paidBy:
  'store'|'owner' (default store), ownerId? (required if paidBy=owner), notes?}`. When
  `paidBy:'owner'`, the server independently re-validates `ownerId` is an `isActive: true`
  `BRANCH_ADMIN` of this exact branch (`400 'Invalid owner selected'` otherwise — never trusts the
  client). Always writes a `StockLog` row; if an effective buying price is known, also creates a
  `Procurement`/`Owner Purchase` transaction and triggers `updateDailySummary()`.
- `GET ?branchId=&productId=&date=` — history, `.populate()`'d, **capped at 200 rows**, newest
  first. `branchId` required for non-SUPER_ADMIN.

### Withdrawals — `/api/withdrawals`
- `POST` — **BRANCH_ADMIN only** (403 SUPER_ADMIN and MANAGER). Branch and `ownerId` are always
  the caller's own (`assignedBranches[0]`, `recordedBy`) — never client-accepted. Creates an
  `Owner Withdrawal` transaction. No day-status gate — can happen whether the day is
  Pending/Open/Locked.
- `GET ?branchId=&from=&to=` — SUPER_ADMIN: all (optional filter). BRANCH_ADMIN: forced to own
  branch regardless of query param. MANAGER: 403. Capped 200 rows, `.populate('ownerId',
  'name')` + `.populate('branchId', 'name')`.

### Owner Purchases — `GET /api/owner-purchases`
Same shape/scoping as withdrawals GET, for `Owner Purchase` transactions, additionally populates
`items.productId` (name, unitType). No `POST` — creation only happens as a side effect of
`/api/stock-log` with `paidBy:'owner'`.

### Daily Closing — `/api/daily-closing`, `/api/daily-closing/history`
- `GET ?branchId=&date=` — computes yesterday's closing + late-withdrawal correction to derive
  `openingCash` on **every call**, regardless of whether today's doc exists. If no record for
  `date` exists, returns a **virtual** `{status:'Pending', openingCash, yesterdayPreOrders}`
  without writing to the DB. If `status:'Open'`, live-recomputes `mathematicalSystemTotals` from
  transactions before returning **and saves that recompute back to the DB** (a write inside a GET
  handler — see `GAP_ANALYSIS.md`).
- `PATCH` — action-dispatched by body: `startDay` (opens the day, `409` if already started other
  than Pending), `nightCash`, `physicalStock`, `preOrders`, `cashReason`, `stockReason`
  (product/variant-scoped, implemented as a `$pull` then conditional `$push` — two sequential
  writes per call). All upsert.
- `POST` — Z-Report submit (locks the day). Body: `{branchId, date?, physicalCashCounted,
  remainingMilkStock?}`. `409` if already `Locked`. Computes final `cashShortage =
  expectedDrawerCash − physicalCashCounted`, sets `status:'Locked'`, `dayLockedAt: now()`.
- `GET /api/daily-closing/history?branchId=&days=7&endDate=` — last N (max 30) records, descending.

### Analytics — `GET /api/analytics?branchId=&from=&to=`
SUPER_ADMIN/BRANCH_ADMIN only (403 MANAGER). Runs, per call: (1) a `DailySummary` aggregate for
period totals, (2) a `DailySummary` aggregate for the trend series (capped 30 rows), (3) a
`DailySummary` aggregate grouped by branch, (4) a **separate live `Transaction` aggregation**
(unwind + `$lookup` into `products`) for the `byProduct` breakdown — this one is not
pre-aggregated, acceptable cost for an admin-only on-demand view but the most expensive query in
this handler, (5) a `Customer` aggregate for `totalOutstandingKhata`, (6) a `Branch.find` for the
`visibleBranches` dropdown. **6 sequential-ish DB round trips per analytics page load** (some
independent and could be parallelized — see `PERFORMANCE_ANALYSIS.md`).

### Daily Orders — `/api/daily-orders`
- `GET ?branchId=&date=` — finds every Paikari-configured customer in-branch, `bulkWrite`-upserts
  a `pending` `DailyOrderLog` for any that don't have one yet today, then re-queries + populates,
  then loads **every product referenced by every customer's fixed rates** and computes per-line
  stock availability in application code (pooled-aware). Runs this full computation on every GET,
  not cached.
- `PATCH` — resolves one customer's order (`taken`/`skipped`). `taken` dispatches either a
  client-supplied quantity override (price always re-resolved server-side, unmatched pairs
  dropped) or the full standing config. Items processed in a **sequential `for` loop** identical in
  shape to the main transactions POST — one `Product.findById` + `save()` per line item, awaited
  in series. `409` if the log isn't `pending`.

---

## 8. Error Response Conventions

- Validation failure (Zod): `400 {error: 'Validation failed', errors: [{field, message}]}`.
- No session: `401 {error: 'Unauthorized'}`.
- Role/branch denial: `403 {error: 'Forbidden'}` — always generic, never names a branch.
- Branch-scoped resource not found *or* not visible to actor: `404 {error: 'Not found'}` —
  deliberately identical for both cases so existence can't be inferred.
- Everything else: `4xx {error: '<specific safe message>'}` — e.g. "Phone number already in use",
  "Day already locked", "Insufficient stock for X".

---

## 9. Known Backend Gotchas

- **Zod v4 `.partial()` drops nested `.default()`** — `ProductUpdateSchema =
  ProductCreateSchema.partial()` (`lib/validators.ts`) loses the nested defaults on `variants[]`/
  `pooledStock[]`. Only the variant-update path is affected in practice. Use explicit
  `.optional()` on schemas that need partial-update semantics instead of `.partial()`.
- **Turbopack + Mongoose top-level imports**: `lib/auth.ts` and most route handlers use
  `const { default: X } = await import('@/models/X')` inside the function body rather than a
  top-level `import` — a workaround for `mongoose.models` being evaluated too early under
  Turbopack hot-reload. This pattern repeats in nearly every route file (~30+ call sites).
- **`instrumentationHook` must not be added to `next.config.mjs`** — built into Next 15+, adding it
  explicitly produces a warning.
- **`GET /api/daily-closing` writes to the DB** when `status === 'Open'` (it re-saves the live
  recomputed totals) — a GET handler with a side effect, not idiomatic REST but intentional here
  (keeps `mathematicalSystemTotals` fresh for whoever reads it next).
- **Two independent super-admin seeders** (`lib/seed-admin.ts` upserts every boot;
  `scripts/seed.ts` only creates, never updates) — see `GAP_ANALYSIS.md`.
