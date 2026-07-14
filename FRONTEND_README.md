# ShopMS — Frontend Reference

Full structural map of the Next.js frontend as it exists in source today (read in full,
2026-07-14). Companion to `API_README.md` (backend contract) and `PERFORMANCE_ANALYSIS.md`
(render/fetch performance findings) and `GAP_ANALYSIS.md` (dead code, missing pieces).

---

## 1. Tech Stack (frontend-relevant)

| Layer | Library / Version |
|---|---|
| Framework | Next.js 16.2.9, App Router, Turbopack |
| UI | React 19.2.7, TypeScript 5.4 |
| Styling | Tailwind CSS 3.4 (utility classes + `@layer components` custom classes in `globals.css`, 139 lines) |
| Icons | lucide-react 1.20.0 |
| Charts | Recharts 3.8 (`AreaChart`, `BarChart` in `AnalyticsDashboard`) |
| Toasts | react-hot-toast |
| Client state | React `useState`/`useEffect`/`useCallback` only — **no Redux/Zustand/Context-based
  global store, no SWR/TanStack Query/RTK Query.** Every component owns and fetches its own data
  independently. |
| Forms | Uncontrolled-ish local `useState` per field, no react-hook-form/Formik |

There is no client-side data-fetching/caching library anywhere in `package.json` — confirmed by
grep. Every one of the ~40 components that needs server data does its own `fetch()` inside a
`useEffect`. See `PERFORMANCE_ANALYSIS.md` for the consequences of this.

---

## 2. Routing Layout

Two protected route groups plus auth, guarded by `proxy.ts` middleware (documented in
`API_README.md` §3) and, redundantly, by server-side role checks inside each layout/page.

```
app/
├── (admin-dashboard)/         ← SUPER_ADMIN + BRANCH_ADMIN only (layout redirects MANAGER → '/')
│   ├── layout.tsx             ← wraps AdminSidebar + <main className="flex-1 overflow-y-auto">
│   │                             (NO padding at layout level — every page must add its own p-6)
│   ├── analytics/
│   ├── branch-report/
│   ├── branch-dashboard/[branchId]/
│   ├── branches/              ← SUPER_ADMIN only page-level guard too
│   ├── products/
│   ├── customers/
│   ├── users/
│   ├── stock-log/
│   ├── regular-orders/
│   ├── due/
│   └── owner-ledger/
│
├── (manager-pos)/[branchId]/  ← MANAGER (and admins viewing POS)
│   ├── pos/
│   ├── transactions/
│   ├── customers/
│   ├── stock/
│   ├── due/
│   └── z-report/
│
├── (auth)/login/
├── api/                       ← see API_README.md
├── globals.css
├── layout.tsx                 ← root layout, wraps SessionProvider
└── page.tsx                   ← root redirect: MANAGER → /{branchId}/pos, others → /analytics
```

### Page-by-page (line counts as of this read — most `page.tsx` files are thin wrappers that fetch
the current session server-side and hand role/branch props to a client component)

| Route | File | Lines | Renders |
|---|---|---|---|
| `/analytics` | `(admin-dashboard)/analytics/page.tsx` | 21 | `AnalyticsDashboard` |
| `/branch-report` | `(admin-dashboard)/branch-report/page.tsx` | 25 | `BranchReport` |
| `/branch-dashboard/[branchId]` | `.../branch-dashboard/[branchId]/page.tsx` | 33 | `BranchReport` with `defaultBranchId` pre-set |
| `/branches` | `(admin-dashboard)/branches/page.tsx` | 19 | `BranchManager` |
| `/products` | `(admin-dashboard)/products/page.tsx` | 19 | `ProductManager` |
| `/customers` (admin) | `(admin-dashboard)/customers/page.tsx` | 28 | `CustomerManager` |
| `/users` | `(admin-dashboard)/users/page.tsx` | 21 | `UserManager` |
| `/stock-log` | `(admin-dashboard)/stock-log/page.tsx` | 38 | `StockLogViewer` |
| `/regular-orders` | `(admin-dashboard)/regular-orders/page.tsx` | 25 | `RegularOrderManager` |
| `/due` (admin) | `(admin-dashboard)/due/page.tsx` | 27 | `DuePage` |
| `/owner-ledger` | `(admin-dashboard)/owner-ledger/page.tsx` | 21 | `OwnerLedger` |
| `[branchId]/pos` | `(manager-pos)/[branchId]/pos/page.tsx` | 28 | `POSTerminal` |
| `[branchId]/transactions` | `.../transactions/page.tsx` | 34 | `SalesLog` (embeds `DailyOrders`) |
| `[branchId]/customers` | `.../customers/page.tsx` | 40 | `CustomerManager` with `lightMode` |
| `[branchId]/stock` | `.../stock/page.tsx` | 34 | `StockManager` |
| `[branchId]/due` | `.../due/page.tsx` | 34 | `DuePage` with `lightMode` |
| `[branchId]/z-report` | `.../z-report/page.tsx` | 34 | `ZReport` |
| `/login` | `(auth)/login/page.tsx` | 117 | standalone credentials form |

---

## 3. Component Inventory

### `components/pos/` — manager-facing, Bangla UI, light theme

| Component | Lines | Purpose |
|---|---|---|
| `POSTerminal.tsx` | 899 | Main cash register: product grid, cart, customer search, checkout. Largest client component in the codebase. |
| `ZReport.tsx` | 578 | End-of-day close: night cash check, stock check, tomorrow's pre-orders, single "finish day" batched save + lock. |
| `StockManager.tsx` | 484 | Stock receiving form, per product/variant or pooled tank, store-vs-owner funding picker. |
| `DailyOrders.tsx` | 373 | Standing Paikari order dispatch panel, embedded inside `SalesLog`. |
| `DuePage.tsx` | 333 | Khata/due collection, shared component also used in admin dashboard via `lightMode` prop. |
| `SalesLog.tsx` | 286 | Daily transaction ledger with summary tiles; hosts `DailyOrders` when viewing today. |
| `CheckoutModal.tsx` | 235 | **Dead code** — standalone checkout modal, not imported anywhere. `POSTerminal` has its own separate inline checkout implementation instead. See `GAP_ANALYSIS.md`. |

### `components/admin/` — admin-facing, English UI, dark theme

| Component | Lines | Purpose |
|---|---|---|
| `ProductManager.tsx` | 772 | Product/variant/pooled-stock CRUD. Contains 4 inline modal sub-components (`ProductModal`, `VariantModal`, `BranchStockModal`, `PooledStockModal`). |
| `BranchReport.tsx` | 761 | Per-branch daily operations report: sales, cash check, stock check, supplier orders, debtors, 7-day history. |
| `RegularOrderManager.tsx` | 531 | Configure customers' standing daily orders (`fixedProductRates`). |
| `CustomerManager.tsx` | 503 | Customer directory CRUD, shared with manager pages via `lightMode` prop. |
| `UserManager.tsx` | 456 | User CRUD with role-aware branch assignment. |
| `OwnerLedger.tsx` | 342 | Withdrawal + owner-funded-purchase ledger, per-admin net-settlement view. |
| `BranchManager.tsx` | 262 | Branch directory CRUD (SUPER_ADMIN only), soft activate/deactivate. |
| `StockLogViewer.tsx` | 231 | Read-only stock movement audit trail. |
| `ChangePasswordModal.tsx` | 97 | Self-service password change modal, launched from `AdminSidebar`. |

### `components/dashboard/`

| Component | Lines | Purpose |
|---|---|---|
| `AnalyticsDashboard.tsx` | 418 | Revenue/profit/COGS analytics: 8 stat cards, trend area chart, branch bar chart, product table. |

### `components/layout/`

| Component | Lines | Purpose |
|---|---|---|
| `AdminSidebar.tsx` | 159 | Persistent nav for admin dashboard shell; role-filtered nav items, per-branch POS shortcuts. |
| `POSHeader.tsx` | 140 | Top nav for manager POS shell — two entirely separate JSX branches for MANAGER (light, Bangla) vs admin (dark, English), rather than one themed template. |

### `components/ui/` and `components/providers/`

| Component | Lines | Purpose |
|---|---|---|
| `ConfirmModal.tsx` | 57 | Generic reusable confirm dialog (delete/deactivate/toggle), used across 4+ managers. |
| `SessionProvider.tsx` | 11 | Thin wrapper around NextAuth's `SessionProvider`. |

---

## 4. State Management Approach

No global store of any kind. Every data-bearing component follows the same shape:

```
useState for the data array/object
useState for loading
useEffect (dep array = whatever filter/id values matter) → calls an async load() function
  → one or more fetch() calls, usually Promise.all'd if there are 2+ independent endpoints
  → setState with the result
```

Mutations (`POST`/`PATCH`/`DELETE`) are triggered by user actions (button clicks, form submits),
awaited directly in the handler, and on success call the same `load()`/`loadCustomers()` function
again to refresh — there is no optimistic UI update pattern and no shared cache to invalidate, so
every write is followed by a full re-fetch of that component's own data.

`useCallback` is used for `load` functions specifically so they can be listed as the `useEffect`
dependency without an infinite loop (a `useCallback`-wrapping-`useEffect` combo, not `useMemo`).
`useMemo` is essentially unused across the whole components tree — derived values (cart totals,
summary sums, filtered lists) are recomputed inline on every render. `React.memo` is not used
anywhere — zero memoized components in the codebase (confirmed by repo-wide grep). Full
implications in `PERFORMANCE_ANALYSIS.md`.

### Search / filter fetch patterns (verified per-file)

| Component | Search field | Debounced? |
|---|---|---|
| `POSTerminal.tsx` (customer phone search) | `customerPhone` | **Yes** — explicit 300ms `setTimeout` + `clearTimeout` cleanup |
| `CustomerManager.tsx` | `search` | **No** — fires `/api/customers` on every keystroke |
| `DuePage.tsx` | `search` | **No** — fires `/api/customers` on every keystroke |
| `RegularOrderManager.tsx`, `BranchReport.tsx`, etc. | branch/date `<select>`/`<input type=date>` | N/A — discrete user actions, not keystroke streams |

---

## 5. Theming System

Two independent theming conventions coexist:

1. **Token-object convention** (`CustomerManager.tsx`, `DuePage.tsx`): a `lightMode?: boolean` prop
   selects between two plain-object maps of Tailwind class strings (`t.card`, `t.input`, etc.),
   computed inline each render. Admin routes render these with `lightMode` unset (dark, slate-900
   base); manager routes explicitly pass `lightMode` (light, gray-50 base). This is the
   *recommended* pattern going forward per prior project convention.
2. **Fully-separate-branch convention** (`POSHeader.tsx`): two completely distinct JSX return
   blocks gated by `role === 'MANAGER'`, each hand-styled, rather than one template driven by
   theme tokens. Functionally equivalent output, structurally inconsistent with convention 1.

Global utility classes (`app/globals.css`, `@layer components`):

| Class | Meaning |
|---|---|
| `.card` | Dark card — `bg-slate-900 border border-slate-800 rounded-xl` |
| `.lcard` | Light card — `bg-white border border-gray-200 rounded-2xl shadow-sm` |
| `.input-base` | Dark-theme input |
| `.btn-primary` / `.btn-secondary` / `.btn-danger` | Blue / slate / rose buttons |

**Bangla vs English**: manager-facing components (`components/pos/*`, `POSHeader.tsx` manager
branch) are entirely in Bangla; admin-facing components (`components/admin/*`,
`AdminSidebar.tsx`, `POSHeader.tsx` admin branch) are entirely in English. This is a hardcoded
per-string convention, not a formal i18n library — labels are inline string literals/ternaries,
not translation keys.

**Bangladesh-time display** — three different techniques for the same requirement are used across
files (worth consolidating, see `GAP_ANALYSIS.md`):
- `BranchReport.tsx`, `OwnerLedger.tsx`: explicit `timeZone: 'Asia/Dhaka'` passed to
  `toLocaleTimeString`/`toLocaleString`.
- `StockLogViewer.tsx`: `'en-BD'` locale string, no explicit `timeZone` override.
- `AnalyticsDashboard.tsx`: plain browser-local `new Date()` for date-range presets, no Bangladesh
  handling at all.

---

## 6. Auth Flow (client side)

```
/login (phone + password form)
  → next-auth/react signIn('credentials', {...})
  → on success: NextAuth issues JWT cookie
  → root page.tsx server-reads session → redirects MANAGER to /{branchId}/pos, else /analytics
  → proxy.ts middleware re-validates the JWT + role/branch on every subsequent navigation
```
`AdminSidebar.tsx` and `POSHeader.tsx` both render a sign-out action (NextAuth `signOut()`) and,
for SUPER_ADMIN/BRANCH_ADMIN, a "change password" action that opens `ChangePasswordModal.tsx`
(calls `PATCH /api/account/password`).

---

## 7. Notable Structural Facts (not fetch/render performance — see `PERFORMANCE_ANALYSIS.md` for that)

- `CheckoutModal.tsx` (235 lines) is unreferenced by any other source file — `POSTerminal.tsx`
  implements a separate, slightly-diverged inline checkout flow instead (it lacks a `discount`
  field and has a minor phone-handling difference from the live path). Candidate for deletion.
- `StockManager.tsx` defines its `PaySourcePicker` sub-component **inside** the parent function
  body (`StockManager.tsx:107-167`) rather than as a sibling/module-level component — a new
  component identity is created every parent render (see `PERFORMANCE_ANALYSIS.md` for the
  render-cost consequence).
- `POSHeader.tsx`'s `Props` type declares a `userId` field that is never destructured or used.
  `POSTerminal.tsx`'s `Props` similarly declares `userId` and never uses it.
- Three parallel hardcoded lists of transaction-type vocabulary exist across the frontend
  (`SALE_TYPES`, `CASH_IN_TYPES`, `TYPE_BN`/`TYPE_COLORS` in `SalesLog.tsx`) that must be kept in
  sync by hand rather than derived from one shared source/enum.
- The Bangladesh phone regex `/^01[3-9]\d{8}$/` is duplicated verbatim in both
  `CustomerManager.tsx` and `UserManager.tsx` instead of living in a shared util (the backend
  equivalent, `lib/validators.ts`'s `bdPhone`, is correctly centralized).
