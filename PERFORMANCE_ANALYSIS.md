# ShopMS — Performance Analysis

Root-cause analysis of why this app feels slow, based on a full line-by-line read of every API
route, model, and component (2026-07-14). Findings are split into backend/DB, frontend
fetch/cache, frontend render, and bundle/loading — each with exact `file:line` citations and a
concrete fix. Prioritized fix list is in §6.

**Headline finding**: there is no caching layer anywhere in the stack. No DB query result cache,
no HTTP cache, no client-side request cache (no TanStack Query/SWR/RTK Query). Every screen visit
re-runs every query from scratch, every component re-fetches its own copy of shared data
independently, and several write operations trigger full-collection re-aggregations. This is the
single biggest lever available — §6.1 covers it first.

---

## 1. Executive Summary — Top 5 Root Causes

| # | Cause | Impact | Fix effort |
|---|---|---|---|
| 1 | No client-side query cache — every component fetches its own copy of shared data (products, branches, customers) on every mount, with no dedupe | Duplicate network round-trips on nearly every screen; visible lag switching tabs | Medium — adopt TanStack Query |
| 2 | Sequential per-item DB round-trips in checkout/dispatch (`for` loop with `await Product.findById` + `await product.save()` per line) | Checkout latency scales linearly with cart size; a 6-item sale is 6× slower than it needs to be | Medium — restructure to bulk read + `bulkWrite` |
| 3 | `updateDailySummary()` fully re-aggregates the entire day's transactions from scratch on **every single write**, fired from 5 different endpoints | DB load grows quadratically with transaction volume per branch per day; each POS sale gets slower as the day goes on | Medium — incremental `$inc` update instead of full re-aggregate |
| 4 | Undebounced search-per-keystroke in `CustomerManager.tsx` and `DuePage.tsx`, no request cancellation | A user typing an 8-character name fires 8 overlapping, un-cancelled requests; late responses can race and overwrite fresher state | Small — debounce + `AbortController` |
| 5 | Zero code-splitting — 899/772/761/578-line client components ship as one JS chunk per route, no `next/dynamic`, no lazy-loaded modals | Larger-than-necessary JS payload and hydration cost on every page load | Medium — `next/dynamic` on modals and rarely-used panels |

---

## 2. Backend / Database Performance

### 2.1 Sequential N+1 write loops — the most direct latency cost per user action

Four separate endpoints process cart/order items in a `for...of` loop where **each iteration
does its own awaited `Product.findById()` and, after mutating in memory, its own awaited
`product.save()`** — fully serialized, not batched, not parallelized:

- `app/api/transactions/route.ts:97-183` — the main POS checkout. For an N-item sale, this is N
  sequential `findById` calls interleaved with N sequential `save()` calls = up to 2N round trips
  to MongoDB, one at a time, before the response can be sent.
- `app/api/customers/[id]/route.ts:151-181` (`handleDispatch`) — same shape, one per dispatch line
  item.
- `app/api/customers/[id]/route.ts:289-321` (`handleAutoDispatch`) — same shape, one per
  `fixedProductRates` entry.
- `app/api/daily-orders/route.ts:212-284` (`PATCH`, `taken` path) — same shape again.

Why this exists: each item needs its own stock check (insufficient stock must abort with a
specific product name in the error) and its own independent `save()` because Mongoose subdocument
array mutation (`branchDetail.stockLevel -= item.quantity`) has to be saved per-document. The
current code is correct, just not fast.

**Fix**: split into two phases. Phase 1 — parallel read: `Product.find({_id: {$in: itemProductIds}})`
in a single query (or `Promise.all` of the individual finds, still faster than serial awaits
since MongoDB can service them concurrently over the same pooled connection). Phase 2 — validate
all items against the in-memory batch (still catches insufficient-stock errors before any write).
Phase 3 — build one `Product.bulkWrite()` with one `updateOne` op per touched product (using
positional/array-filter updates for the specific variant's `branchDetails.$.stockLevel`), executed
as a single round trip instead of N. This preserves per-item validation and per-item error
messages while cutting DB round trips from `2N` to `2` (one read, one bulk write).

### 2.2 `updateDailySummary()` — full re-aggregation on every write, fired from 5 places

`lib/update-daily-summary.ts:4-94` recomputes the **entire day's** `Transaction` aggregation for a
branch from scratch on every call — one main `$group` aggregation plus two additional
`volumeLookup()` aggregations (each does `$unwind` + `$lookup` into `products` + a second
`$group`), so **3 aggregation queries per call**, all scanning every transaction created that
branch+day so far.

This is called, fire-and-forget (`.catch(() => {})`, non-blocking on the HTTP response but still
real DB load), from:
- `app/api/transactions/route.ts:214` — after every POS sale
- `app/api/stock-log/route.ts:134` and `:207` — after every procurement/owner-purchase stock entry
- `app/api/daily-orders/route.ts:317` — after every standing-order dispatch
- `app/api/withdrawals/route.ts:92` — after every owner withdrawal

As a branch's transaction count for the day grows (a busy shop doing 100+ sales/day), each new
sale triggers a fresh full-day aggregation over an ever-larger transaction set — the per-write
cost is `O(transactions so far today)`, so total daily DB work is `O(n²)` in the number of
transactions, not `O(n)`. This is very plausibly a meaningful, growing-over-the-day slowdown
during the busiest hours, which is exactly when it matters most.

**Fix (pick one)**:
- **Incremental** (recommended): instead of re-aggregating from scratch, apply a `$inc` delta
  update to the existing `DailySummary` document using only the just-written transaction's fields
  (`salesRevenue += totalBill`, etc.) — `O(1)` per write instead of `O(n)`. Requires computing the
  volume-by-unit-type delta for just this transaction's items (a small in-memory lookup against
  already-loaded product data from the calling route, not a fresh DB aggregation).
- **Debounced/coalesced**: if incremental math is too risky to get exactly right initially, at
  minimum coalesce rapid repeated calls for the same `(branchId, date)` within a short window
  (e.g. trailing-edge debounce per key) so a burst of sales doesn't trigger a full re-aggregate
  per sale.

### 2.3 Over-fetching — full documents fetched, filtered client-side after the DB round trip

- `app/api/products/route.ts:51-63` (`GET ?branchId=`) — queries
  `Product.find({'variants.branchDetails.branchId': branchId})`. Mongoose returns the **entire**
  matching document, including every other branch's `branchDetails` entries inside every variant
  — then the route filters `branchDetails` down to just the requested branch **in application
  code** (`.map()` at line 57-62) after the full payload has already crossed the wire from Mongo
  to Node. For a product catalog shared across many branches, this means transferring
  `O(branches)` times more data than needed for every product load — and this route is hit by
  `POSTerminal`, `ZReport`, `StockManager`, and `DailyOrders` independently (see §3.1).
- `app/api/products/route.ts:25-40` (`GET ?all=1`, BRANCH_ADMIN path) — same pattern at catalog
  scope: `Product.find({})` pulls **every product, every branch's data**, then filters
  `branchDetails` per-product in application code afterward.

**Fix**: use a MongoDB aggregation with `$project`/`$filter` on `variants.branchDetails` (or
`$elemMatch` for the common single-branch case) to have MongoDB itself return only the requested
branch's pricing/stock data, cutting payload size proportionally to branch count and removing the
in-app filter pass entirely.

### 2.4 Unbounded queries — no `.limit()`, no pagination

- `app/api/customers/route.ts:76` — `Customer.find(filter).sort({name:1}).lean()` — **no limit at
  all**. Every customer-list load (admin dashboard, POS customer search fallback, due page)
  returns the complete matching set. As the customer base grows this scales linearly and will
  eventually become the slowest query in the app; it also feeds directly into the undebounced
  keystroke search in §3.3, compounding the problem.
- `app/api/transactions/route.ts:46-50` (`GET`) — no `.limit()`. A busy branch's full day of
  transactions (which can be large) is returned in one response every time `SalesLog`/`BranchReport`
  loads.
- `app/api/products/route.ts` — neither `GET` variant has a `.limit()`; acceptable while the
  catalog is small, will not scale.

**Fix**: add `.limit()` + cursor/offset pagination (or at minimum a sane cap like the `stock-log`/
`withdrawals`/`owner-purchases` routes already correctly do at 200 rows) to `customers`,
`transactions`, and `products` list endpoints, with UI-side "load more" or date/branch narrowing
to match.

### 2.5 Indexing gaps

Overall indexing is reasonably good (every hot-path branch/date/customer lookup has a supporting
compound index — see `API_README.md` §5 for the full list per model). Two specific notes:

- `models/Transaction.ts` — `TransactionSchema.index({'items.isCustomOverride': 1})` indexes a
  boolean field nested inside an array with no accompanying query in the codebase that actually
  filters on it (grepped — no route filters by `isCustomOverride`). A boolean-field index has poor
  selectivity by nature and, being on an array subfield, also costs extra index-maintenance work
  on every transaction write for no observed read benefit. Candidate for removal.
- No index exists purely on `transactionType` — but every current query that filters by type also
  filters by `branchId`+`createdAt` range first (which *is* indexed), so this is not currently a
  gap; flagged only in case a future "all transactions of type X across branches" query gets
  added without the branch/date prefix.

### 2.6 Sequential round trips within a single request

- `app/api/daily-closing/route.ts` `GET` (lines 87-126): `DailyClosing.findOne` (yesterday) →
  `lateWithdrawalsSince()` (its own separate `Transaction.aggregate`) → `DailyClosing.findOne`
  (today) → conditionally `computeSystemTotals()` (another `Transaction.aggregate`) → `.save()`.
  Up to **5 sequential DB round trips** for what is the single most-loaded endpoint in the app
  (hit by `POSTerminal`, `ZReport`, and `BranchReport` on every mount). The same 5-round-trip shape
  repeats in `PATCH` `startDay` (148-180) and `POST` lock (262-303).
- `app/api/analytics/route.ts` (lines 13-216): 6 distinct queries — summary aggregate, trend
  aggregate, byBranch aggregate, a `Branch.find` to resolve branch names, a live `Transaction`
  aggregate for `byProduct` (the most expensive one here — unwind + lookup, not pre-aggregated),
  and a `Customer` aggregate for outstanding khata, plus a final `Branch.find` for the dropdown —
  **7 total round trips**, several of which (byBranch names, byProduct, khata total, visible
  branches) have no data dependency on each other and could run concurrently via `Promise.all`
  instead of one after another.

**Fix**: batch the independent reads in `daily-closing` `GET` and `analytics` `GET` with
`Promise.all` wherever one query doesn't depend on another's result — this doesn't reduce total DB
work but does reduce wall-clock latency by running them concurrently instead of serially.

### 2.7 `ZReport`'s N-parallel-PATCH pattern for stock-reason saves

`components/pos/ZReport.tsx:201-210` builds one `fetch PATCH /api/daily-closing` call **per
stock-reason entry with a non-empty reason** (via `.map()`), all fired inside one `Promise.all` —
parallel, not serial, but still N separate HTTP requests and N separate
`findOneAndUpdate`-then-conditionally-`$push` DB writes (the `stockReason` action itself is two
sequential writes server-side — `app/api/daily-closing/route.ts:225-244`, a `$pull` then a
`$push`) for something that could be a single batched array-replace payload.

**Fix**: extend the `stockReason` PATCH action (or add a new `stockReasons` bulk action, mirroring
the existing `physicalStock`/`preOrders` actions which already accept a full array in one call) to
accept the whole reasons map in one request, cutting N×2 writes down to 1.

---

## 3. Frontend Fetch / Cache Performance

### 3.1 Zero shared cache — the same data is fetched independently, over and over

Confirmed via full read of every component: there is no SWR/TanStack Query/RTK Query, no
`Context`-based cache, nothing. Every component that needs `/api/products?branchId=` for a given
branch fetches its own independent copy:

- `POSTerminal.tsx:139-145` (`loadProducts`, on mount + after every checkout)
- `ZReport.tsx:77-110` (on mount)
- `StockManager.tsx:56-63` (`loadProducts`, on mount, note the distinct `context=stock` query param)
- `DailyOrders.tsx:72-84` (`load`, on mount + after every take/skip action)

A manager who opens POS, then Z-Report, then Stock, in one session triggers **4 independent full
fetches of the same branch's product catalog**, each a fresh network round trip, fresh JSON parse,
fresh React state — none of them aware the others exist or already have the data. The same pattern
applies to `/api/branches` (fetched independently in `BranchReport`, `ProductManager`,
`RegularOrderManager`, `CustomerManager`, `UserManager`, `BranchManager`) and `/api/daily-closing`
(fetched independently in `POSTerminal.tsx:101-110` and `ZReport.tsx:77-110`).

This is the single highest-leverage fix available (see §6.1) — a shared query cache eliminates
essentially all of this duplicate work for free, without touching any business logic.

### 3.2 Cascading refetch waterfall

`SalesLog.tsx:101` renders `DailyOrders` with `onTaken={load}` (`SalesLog`'s own reload function).
When a manager marks one standing order "taken" inside `DailyOrders`:
1. `DailyOrders.act()` (`DailyOrders.tsx:102-127`) completes the PATCH, then calls its own
   `load()` (`:126`) — refetching **both** `/api/daily-orders` and `/api/products` for the branch.
2. It also calls `onTaken?.()` (`:123`) — `SalesLog`'s `load` — refetching `/api/transactions`.

One click → 2 independent reload cycles → 3 endpoint refetches, for a mutation that only actually
changed one `DailyOrderLog` row and created one `Transaction`. A shared cache with targeted
invalidation (or even just optimistic local state updates) would turn this into zero additional
network round trips beyond the mutation itself.

### 3.3 Undebounced search-per-keystroke, no cancellation

- `CustomerManager.tsx:55-80` — `loadCustomers` is a `useCallback` with `search` in its dependency
  array (`:76`), and the search `<input>` (`:182`) updates `search` state directly on every
  `onChange` with no debounce. Every keystroke fires a new `GET /api/customers?search=...`
  request.
- `DuePage.tsx:41-62` — identical pattern: `search` (`:37`) feeds `load`'s dependency array
  (`:60`), input `onChange` (`:155`) has no debounce.

Contrast with `POSTerminal.tsx:150-162`, which does this correctly: an explicit 300ms
`setTimeout`/`clearTimeout` debounce around the customer-phone search fetch. The other two files
should follow the same pattern.

Neither undebounced file uses an `AbortController` to cancel in-flight requests either — if a user
types "ab" then quickly "abc", both requests fire, and if the "ab" response arrives *after* the
"abc" response (plausible under variable network latency), the UI briefly shows stale results for
the wrong query with no way to detect it happened.

**Fix**: debounce both search inputs (~250-300ms, matching the existing `POSTerminal` pattern), and
add `AbortController` cancellation of the previous in-flight request when a new one fires — or,
more robustly, let a query cache library (§6.1) handle both concerns automatically via built-in
request deduplication and cancellation.

### 3.4 No revalidation/staleness strategy

Every component's data is only ever as fresh as its last mount or its last manual `load()` call
after a mutation. There is no window-focus revalidation, no polling, no `staleTime`/`cacheTime`
concept — switching browser tabs away and back, or two managers on two devices editing the same
branch concurrently, will show stale data indefinitely until the component remounts. This is a
direct consequence of §3.1 (no cache library) rather than a separate bug, but worth naming
explicitly since "data feels stale/wrong until I refresh" is a distinct user complaint from "the
app feels slow."

---

## 4. Frontend Render Performance

### 4.1 Zero `React.memo` usage — confirmed via repo-wide grep, zero hits

No component in the tree is memoized. Practical consequence: any state update in a large parent
re-renders its **entire** subtree unconditionally, every time. Concretely:

- A single keystroke in `POSTerminal.tsx`'s search box, or a single quantity-stepper click, causes
  the entire 899-line component — including the full product grid (`filtered.map`, `:465-523`)
  and the full cart list (`cart.map`, `:723-778`) — to re-render, even though most of that subtree
  didn't change.
- `ProductManager.tsx` (772 lines) and `BranchReport.tsx` (761 lines) have the same characteristic
  — no `StatCard`/table-row/list-item component is wrapped in `memo`, so every parent state change
  re-renders every row.

**Fix**: wrap the obvious pure leaf components (`StatCard` in `AnalyticsDashboard.tsx:95-111` and
`BranchReport.tsx:94-115`, per-row cart/product/customer components) in `React.memo`. This is a
mechanical, low-risk change since none of these components currently rely on always re-rendering.

### 4.2 Nested component definition — forces remount, not just re-render

`StockManager.tsx:107-167` defines `PaySourcePicker` **inside** the `StockManager` function body,
rather than as a sibling or module-level component. Every render of `StockManager` creates a new
function/component identity for `PaySourcePicker`, so React treats each render's version as a
*different component type* — its usages (`:392`, `:474`) fully unmount and remount (losing any
internal state, forcing fresh DOM nodes) on every parent re-render, rather than just re-rendering
in place. Since every keystroke inside any stock-entry row updates the parent's `rows` state
(`setRow`), this means the pay-source picker UI remounts on every keystroke in every row.

**Fix**: hoist `PaySourcePicker` out of `StockManager`'s function body to module scope (or wrap in
`useCallback`-memoized factory if it must stay nested for closure reasons — but a plain hoist plus
passing `rows`/`setRow` as props is simpler and removes the remount entirely).

### 4.3 Unmemoized derived values recomputed every render

- `SalesLog.tsx:84-94` — `saleCount`, `cashTotal`, `khataTotal`, `total`, `procurementTotal` each
  do a fresh `.filter()`/`.reduce()` pass over the full `transactions` array on **every** render,
  including renders triggered purely by toggling a row's expanded state (`expanded`, `:66`) —
  work that has nothing to do with the summary tiles.
- `ZReport.tsx:122` — `products.filter(milk-name-check)` re-runs on every keystroke into the
  night-cash input, even though `products` hasn't changed since the last fetch.
- `POSTerminal.tsx:164-167, 260-270` — `filtered` (product search results) and cart
  totals/change/khata-added are recomputed inline every render; cheap individually at current
  catalog/cart sizes, but a `useMemo` with the correct dependency array (`[products, search]` /
  `[cart, discount, cashPaid, mode]`) costs nothing and removes the redundant work.

**Fix**: wrap each of the above in `useMemo` with a precise dependency array.

### 4.4 List virtualization

No list in the app is virtualized (`react-window`/`react-virtual` not installed). At current data
volumes (typical product catalogs, typical daily transaction counts, customer lists in the low
thousands at most) this is not yet a practical problem — flagged here only because it compounds
with §2.4 (unbounded queries): once customer/transaction lists grow large *and* have no
server-side pagination, the DOM will be asked to render every row at once with no virtualization
to fall back on. Fixing §2.4 (pagination) is the higher-priority half of this; virtualization is
a secondary mitigation if page sizes ever need to be large regardless.

---

## 5. Bundle / Loading Performance

### 5.1 No code-splitting anywhere

`next/dynamic` is not used once in the codebase (grepped). Every component — including
`ProductManager.tsx`'s 4 inline modals (`ProductModal`, `VariantModal`, `BranchStockModal`,
`PooledStockModal`, none of which are visible until a user clicks an action button) — ships as
part of the same JS chunk as the page that contains it. A user who never opens the "pooled stock"
modal still downloads and parses its code on every visit to `/products`.

**Fix**: wrap infrequently-opened modals (all 4 in `ProductManager`, `ChangePasswordModal`,
`ConfirmModal` usages behind delete actions) in `next/dynamic(() => import(...), {ssr: false})` so
their code splits into separate chunks loaded only when actually opened.

### 5.2 No `next/image` usage

Confirmed 0 hits for `next/image` anywhere in `app/`/`components/`. If product images or any other
raster assets are added in the future, using plain `<img>` bypasses Next's automatic
resizing/lazy-loading/format-negotiation — worth establishing the convention now before image
usage grows, even though there is currently no observed image-loading performance problem (there
appear to be no product images in the current UI at all).

### 5.3 22 client components (`'use client'`), all eagerly bundled per route

Every interactive component in the app is a Client Component (confirmed 22 files via grep) — this
is largely unavoidable given the amount of local state/interactivity, but combined with §5.1 (no
splitting), each route's initial JS payload includes 100% of that route's component code
regardless of what the user actually interacts with in that session.

### 5.4 Dead code shipped in source (not in the runtime bundle, but worth removing)

`CheckoutModal.tsx` (235 lines, confirmed unreferenced by any other file) is tree-shaken out of
the production bundle by Next's build since nothing imports it, so it has **no runtime
performance cost today** — flagged here for completeness/source hygiene, full detail in
`GAP_ANALYSIS.md`.

---

## 6. Prioritized Fix Plan

### P0 — do first, highest ratio of impact to effort

1. **Adopt TanStack Query** for all client-side data fetching. This single change addresses §3.1
   (duplicate fetches), §3.2 (cascading refetch), §3.3's cancellation half (built-in request
   dedupe/cancel), and §3.4 (configurable `staleTime`/refetch-on-focus) simultaneously, without
   touching any backend code. Suggested rollout: wrap the app in a `QueryClientProvider` at the
   root layout, then migrate component-by-component starting with the ones with the worst
   duplication (`/api/products`, `/api/branches`, `/api/daily-closing`) — each `useEffect` +
   `useState` fetch pattern becomes a `useQuery(['products', branchId], ...)` call, and mutations
   become `useMutation` calls that `invalidateQueries` on the relevant key instead of manually
   re-calling `load()`.
2. **Debounce + cancel** the two undebounced searches (`CustomerManager.tsx`, `DuePage.tsx`) —
   small, isolated, immediately noticeable fix. (Superseded by item 1 if TanStack Query lands
   first, since its default behavior handles this, but worth doing standalone if sequencing
   TanStack Query later.)
3. **Batch `ZReport`'s stock-reason saves** into one PATCH call instead of N parallel ones (§2.7).

### P1 — backend query/write cost

4. **Restructure the 4 sequential N+1 write loops** (§2.1) into read-batch + validate +
   `bulkWrite`, starting with `POST /api/transactions` since it's the highest-frequency endpoint
   (every sale).
5. **Fix over-fetching in `/api/products`** (§2.3) — project only the requested branch's data at
   the DB layer instead of full-doc-then-filter.
6. **Add pagination/limits** to `/api/customers`, `/api/transactions` GET (§2.4).
7. **Parallelize the independent reads** in `daily-closing` GET and `analytics` GET with
   `Promise.all` (§2.6).

### P2 — render performance and structural cleanup

8. **Wrap `StatCard` and other pure leaf/row components in `React.memo`** (§4.1).
9. **Hoist `PaySourcePicker` out of `StockManager`** (§4.2) — fixes the per-keystroke remount.
10. **Memoize derived values** in `SalesLog`, `ZReport`, `POSTerminal` with `useMemo` (§4.3).
11. **Code-split `ProductManager`'s 4 modals** and other rarely-opened panels via `next/dynamic`
    (§5.1).
12. **Reconsider `updateDailySummary`** — move to incremental `$inc` updates (§2.2). Marked P2
    despite its O(n²) growth characteristic because it requires the most careful correctness
    verification (per the existing "money math must be verified live, not just reviewed" project
    convention) — schedule it, don't rush it.
13. **Drop the unused `items.isCustomOverride` index** on `Transaction` (§2.5) — free write-path
    speedup, zero read-path cost.
14. **Delete dead code** (`CheckoutModal.tsx`) for source clarity — no runtime effect, listed here
    only for completeness alongside the rest of the cleanup pass.
