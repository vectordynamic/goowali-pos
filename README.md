# ShopMS — Multi-Branch Shop Management System

A full-stack POS (Point of Sale) and admin management system for multi-branch retail businesses. Built for dairy/milk product shops but generalizable. Manages sales, stock, customers (retail + wholesale), daily cash closings, and analytics across multiple branches.

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Getting Started](#getting-started)
3. [Environment Variables](#environment-variables)
4. [Roles & Permissions](#roles--permissions)
5. [Application Structure](#application-structure)
6. [Transaction Types](#transaction-types)
7. [Business Logic & Formulas](#business-logic--formulas)
8. [Data Models](#data-models)
9. [API Routes](#api-routes)
10. [Components](#components)
11. [Key Design Decisions](#key-design-decisions)
12. [Known Gotchas](#known-gotchas)

---

## Tech Stack

| Layer | Library / Version |
|---|---|
| Framework | Next.js 16.2.9 (App Router, Turbopack) |
| UI Library | React 19, TypeScript 5.4 |
| Database | MongoDB via Mongoose 8.4 |
| Auth | NextAuth 4.24 (JWT, credentials — phone + password) |
| Styling | Tailwind CSS 3.4 |
| Charts | Recharts 3.8 |
| Icons | lucide-react |
| Toasts | react-hot-toast |
| Validation | Zod 4.4 |
| Hashing | bcryptjs |

---

## Getting Started

```bash
# Install dependencies
npm install

# Run dev server (Turbopack)
npm run dev
# → http://localhost:3000

# If port 3000 is busy
fuser -k 3000/tcp && npm run dev

# Build for production
npm run build && npm start

# Seed initial data (products, sample branches)
npm run seed
```

---

## Environment Variables

Create `.env.local` in the project root:

```env
MONGODB_URI=mongodb://localhost:27017/shopms
NEXTAUTH_SECRET=your_secret_here
NEXTAUTH_URL=http://localhost:3000

# Super admin auto-seeded on every server start
SUPER_ADMIN_NAME=Admin
SUPER_ADMIN_PHONE=01700000001
SUPER_ADMIN_PASSWORD=change_this_strong_password
```

**How seeding works:** `instrumentation.ts` runs `lib/seed-admin.ts` on every server start. It **upserts** (not just creates) the SUPER_ADMIN user from env vars, re-hashing the password each time. This means changing the password in `.env.local` takes effect on next restart.

---

## Roles & Permissions

Three roles, strictly enforced at both middleware and API level.

### SUPER_ADMIN
- Full access to everything
- Sees all branches, all data, profit margins, buying prices
- `assignedBranches` in DB is `[]` (empty) — at login, auth dynamically fetches all active branch IDs and populates the session
- Can create/edit/delete branches, users, products, customers

### BRANCH_ADMIN
- Access to assigned branches only
- Full admin features (analytics, products, customers, reports) for their branches
- **Never** shown data from other branches — API filters server-side at every endpoint
- Can manage users and customers within their scope

### MANAGER
- Assigned to exactly one branch
- POS-only access: sell, add stock, view transactions, manage customers (Retail only), Z-Report
- **Never** sees buying prices or net profit amounts — stripped server-side before API response
- All UI pages in **Bangla** (field role, native speaker context)
- Redirected to their branch POS if they try to access any admin URL

### Branch Isolation Rule
API always checks `role` + `assignedBranches` on every request. BRANCH_ADMIN and MANAGER receive a **404** (not 403) for unauthorized branches — they don't even learn the branch exists.

---

## Application Structure

```
app/
├── (admin-dashboard)/          ← Admin route group (SUPER_ADMIN + BRANCH_ADMIN only)
│   ├── analytics/              ← Business analytics with charts
│   ├── branch-report/          ← Daily cash + stock check per branch
│   ├── branch-dashboard/[id]/  ← Branch-specific view of BranchReport
│   ├── branches/               ← Create/manage branches (SUPER_ADMIN only)
│   ├── products/               ← Product + variant management
│   ├── customers/              ← Customer list across branches
│   ├── users/                  ← User management
│   ├── stock-log/              ← Stock movement audit trail
│   ├── regular-orders/         ← Paikari (wholesale) standing orders
│   └── due/                    ← Outstanding dues across branches
│
├── (manager-pos)/[branchId]/   ← Manager POS route group
│   ├── pos/                    ← Main POS terminal (cash register)
│   ├── transactions/           ← Daily transaction log (সেলস লগ)
│   ├── customers/              ← Branch customer management
│   ├── stock/                  ← Stock entry (add incoming stock)
│   ├── due/                    ← Customer due collection
│   └── z-report/               ← End-of-day closing report
│
├── (auth)/login/               ← Login page (phone + password)
├── api/                        ← All API routes
├── globals.css                 ← Tailwind + global component classes
├── layout.tsx                  ← Root layout
└── page.tsx                    ← Root redirect: MANAGER→/pos, others→/analytics

components/
├── admin/                      ← Admin-only components (English UI)
│   ├── AnalyticsDashboard.tsx
│   ├── BranchManager.tsx
│   ├── BranchReport.tsx
│   ├── CustomerManager.tsx     ← Shared with manager page (lightMode prop)
│   ├── ProductManager.tsx
│   ├── RegularOrderManager.tsx
│   ├── StockLogViewer.tsx
│   └── UserManager.tsx
├── pos/                        ← Manager POS components (Bangla UI)
│   ├── POSTerminal.tsx         ← Cart + checkout
│   ├── CheckoutModal.tsx       ← Payment modal
│   ├── SalesLog.tsx            ← Transaction list + summaries
│   ├── StockManager.tsx        ← Stock entry form
│   ├── DuePage.tsx             ← Due collection
│   ├── DailyOrders.tsx         ← Today's paikari pre-orders
│   └── ZReport.tsx             ← Night cash check + stock check
├── dashboard/
│   └── AnalyticsDashboard.tsx
├── layout/
│   ├── POSHeader.tsx           ← Manager nav bar (tabs)
│   └── AdminSidebar.tsx        ← Admin sidebar with branch shortcuts
├── providers/
│   └── SessionProvider.tsx
└── ui/
    └── ConfirmModal.tsx

lib/
├── auth.ts                     ← NextAuth config + JWT callbacks
├── db.ts                       ← Mongoose connection (singleton)
├── seed-admin.ts               ← Upserts SUPER_ADMIN on startup
├── update-daily-summary.ts     ← Recomputes DailySummary after transactions
├── utils.ts                    ← assertBranchAccess, branchDenied, today(), formatCurrency
└── validators.ts               ← Zod schemas for all API inputs

models/                         ← Mongoose models
scripts/
└── seed.ts                     ← Seeds sample branches + products (npm run seed)

types/
├── index.ts                    ← All shared TypeScript interfaces
└── next-auth.d.ts              ← Session type augmentation

proxy.ts                        ← Next.js middleware (auth guard + role redirects)
```

---

## Transaction Types

Every financial event is recorded as a `Transaction` with one of these types:

| Type | Direction | Description |
|---|---|---|
| `Cash Sale` | Cash IN | Customer pays full amount in cash |
| `Credit Sale` | No cash | Full amount added to customer's due (khata) |
| `Partial Payment` | Cash IN + Due | Customer pays part now, rest goes to khata |
| `Due Collection` | Cash IN | Customer pays off existing due |
| `Expense` | Cash OUT | Operational costs (rent, fuel, etc.) |
| `Procurement` | Cash OUT | Buying stock from supplier |

### Revenue vs Cash Groupings (important for calculations)

```
SALE_TYPES       = ['Cash Sale', 'Credit Sale', 'Partial Payment']
CASH_IN_TYPES    = ['Cash Sale', 'Partial Payment', 'Due Collection']
CASH_OUT_TYPES   = ['Expense', 'Procurement']
```

Procurement is **not** revenue — it is a cost. Never include it in sales totals or "cash received" figures.

---

## Business Logic & Formulas

### Expected Drawer Cash (End of Day)

```
expectedDrawerCash = openingCash
                   + cashSales          ← cashPaid from Cash Sale + Partial Payment
                   + dueCollections     ← cashPaid from Due Collection
                   - expensesLogged     ← totalBill from Expense
                   - procurementCost    ← cashPaid from Procurement
```

`openingCash` = yesterday's `nightCashCounted` (auto-carried, no manual input).

### Net Profit per Transaction

```
Sale:        netProfitAmount = Σ (rateApplied - buyingPrice) × quantity
Procurement: netProfitAmount = -totalBill   ← negative, it's a cost
Expense:     netProfitAmount = -totalBill
```

### Analytics (DailySummary fields)

```
salesRevenue    = totalBill from Cash Sale + Credit Sale only
cogs            = salesRevenue - grossProfit
grossProfit     = Σ netProfitAmount on sales
netProfit       = grossProfit - expenses
cashIn          = cashPaid: Cash Sale + Partial Payment + Due Collection
cashOut         = cashPaid: Procurement + Expense
```

### Stock Entry (StockManager)

- Always **additive** (add incoming quantity, never set total)
- `recordAsPurchase` must be checked — creates a `Procurement` transaction
- Buying price auto-filled from product's stored `buyingPrice`; manager can override
- Saving without `recordAsPurchase` checked → blocked with toast error

### Customer Due (Khata)

- `amountAddedToKhata` tracked per transaction
- `Due Collection` increases cash, reduces `khata.currentDue`
- Credit limit enforced at checkout

---

## Data Models

### User
```typescript
{
  name: string
  phone: string            // unique, used as login identifier
  passwordHash: string
  role: 'SUPER_ADMIN' | 'BRANCH_ADMIN' | 'MANAGER'
  assignedBranches: ObjectId[]
  isActive: boolean
}
```

### Branch
```typescript
{
  name: string
  address?: string
  contactPhone?: string
  isActive: boolean
}
```

### Customer
```typescript
{
  name: string
  phone: string            // optional, sparse unique index
  location?: string
  customerType: 'Retail' | 'Paikari'
  registeredBranch: ObjectId
  paikariConfig: {
    deliveryMethod: 'Pickup' | 'Send'
    dailyRequirementLiters: number
    fixedProductRates: [{ productId, variantId, lockedRate, dailyQty }]
  }
  khata: {
    currentDue: number
    creditLimit: number
    lastPaymentDate?: Date
  }
}
```
- **Retail**: walk-in customers, standard pricing
- **Paikari**: wholesale customers, fixed locked rates per product, standing daily orders

### Product
```typescript
{
  name: string
  category?: string
  unitType: 'Liquid' | 'Weight' | 'Fixed'
  isOpenLoose: boolean        // allows fractional quantities (e.g. 0.5 kg)
  variants: [{
    variantId: string         // e.g. "1L", "500ml", "1kg"
    sizeLabel?: string
    branchDetails: [{
      branchId: ObjectId
      stockLevel: number
      buyingPrice: number     // cost price (hidden from MANAGER)
      mrpPrice: number        // selling price
    }]
  }]
}
```
Stock level and prices are stored **per variant per branch**.

### Transaction
```typescript
{
  invoiceId: string           // unique, auto-generated
  branchId: ObjectId
  recordedBy: ObjectId        // user who created it
  customerId?: ObjectId
  transactionType: TransactionType
  items: [{
    productId: ObjectId
    variantId: string
    quantity: number
    rateApplied: number       // actual price charged
    isCustomOverride: boolean // true if manager changed price
  }]
  financials: {
    totalBill: number
    cashPaid: number
    amountAddedToKhata: number
    netProfitAmount: number   // negative for Procurement/Expense
  }
  notes?: string
}
```

### DailyClosing
```typescript
{
  branchId: ObjectId
  date: string                // 'YYYY-MM-DD'
  status: 'Open' | 'Locked'
  mathematicalSystemTotals: {
    openingCash: number
    cashSales: number
    dueCollections: number
    expensesLogged: number
    procurementCost: number
    expectedDrawerCash: number
  }
  managerSubmittedTotals: {
    physicalCashCounted: number
    remainingMilkStock: number
  }
  discrepancies: {
    cashShortage: number      // expected - physical
    stockMismatch: number
  }
  nightCashCounted: number | null
  cashCheckReason: string | null    // required when |gap| > ৳30
  physicalStock: [{ productId, variantId, physicalQty, systemQty }]
  stockCheckReasons: [{ productId, variantId, reason }]  // required when |gap| > 1 unit
  tomorrowPreOrders: [{ productId, variantId, productName, quantity }]
  submittedBy?: ObjectId
}
```

### DailySummary
Pre-computed per-branch per-day analytics. Updated non-blocking after every transaction write.
```typescript
{
  branchId: ObjectId
  date: string                // 'YYYY-MM-DD', unique index with branchId
  salesRevenue: number
  cogs: number
  grossProfit: number
  procurementCost: number
  expenses: number
  netProfit: number
  cashIn: number
  cashOut: number
  khataAdded: number
  khataCollected: number
  salesCount: number
  procurementCount: number
  txCount: number
  liquidSold: number          // total litres (Liquid unit products)
  weightSold: number          // total kg (Weight unit products)
}
```

### StockLog
Audit trail for every stock change.
```typescript
{
  branchId: ObjectId
  productId: ObjectId
  variantId: string
  action: 'add' | 'set'
  quantityBefore: number
  quantityChange: number
  quantityAfter: number
  buyingPriceBefore?: number
  buyingPriceAfter?: number
  paidFromCash: boolean
  totalPurchaseCost?: number
  notes?: string
  recordedBy: ObjectId
}
```

### DailyOrderLog
Tracks whether paikari customers received their daily order.
```typescript
{
  branchId: ObjectId
  date: string
  customerId: ObjectId
  status: 'pending' | 'taken' | 'skipped'
  transactionId?: ObjectId
  updatedBy?: ObjectId
}
// Unique index: { branchId, date, customerId }
```

---

## API Routes

All routes require authentication (NextAuth session). Branch access enforced on every request.

### `GET /api/transactions`
Returns transactions for a branch on a date.
- Query: `branchId` (required), `date` (YYYY-MM-DD, default today), `type` (filter by TransactionType)
- MANAGER: `netProfitAmount` stripped from response

### `POST /api/transactions`
Creates a new transaction.
- Deducts stock for each item
- Updates `khata.currentDue` for credit/partial
- Calls `updateDailySummary` non-blocking

### `GET /api/stock-log`
Stock movement history with product + user populated.
- Query: `branchId`, `productId` (optional), `limit`

### `POST /api/stock-log`
Add stock to a product/variant.
- Body: `{ branchId, productId, variantId, action: 'add', quantity, buyingPrice?, recordAsPurchase }`
- If `recordAsPurchase: true` → creates a `Procurement` transaction + calls `updateDailySummary`

### `GET /api/analytics`
Reads from `DailySummary` (fast pre-computed reads).
- Query: `branchId` (optional for SUPER_ADMIN), `from`, `to` (YYYY-MM-DD)
- Returns: `{ summary, trend[], byBranch[], totalOutstandingKhata, visibleBranches[] }`

### `GET /api/daily-closing`
Gets or creates today's DailyClosing for a branch.
- Auto-carries yesterday's `nightCashCounted` as `openingCash`
- Recomputes `mathematicalSystemTotals` if status is 'Open'
- Returns `yesterdayPreOrders` alongside closing data

### `PATCH /api/daily-closing`
Updates specific fields. Body must include `action`:
| action | payload | effect |
|---|---|---|
| `nightCash` | `{ nightCash }` | Saves manager's physical cash count |
| `physicalStock` | `{ physicalStock[] }` | Saves stock check results |
| `preOrders` | `{ preOrders[] }` | Saves tomorrow's pre-orders |
| `cashReason` | `{ reason }` | Saves explanation for cash gap > ৳30 |
| `stockReason` | `{ productId, variantId, reason }` | Saves explanation for stock gap > 1 unit |

### `POST /api/daily-closing`
Locks the day (Z-Report submit). Computes final discrepancies and sets `status: 'Locked'`.

### `GET /api/daily-closing/history`
- Query: `branchId`, `days` (default 7), `endDate`
- Returns last N DailyClosing records

### `GET /api/products`
- `?branchId=` — products with stock levels for that branch; strips `buyingPrice` for MANAGER
- `?context=stock` — includes `buyingPrice` (for StockManager, only MANAGER can access their own branch)
- `?all=1` — all products for admin product manager

### `GET /api/customers`
- `?search=` — search by name or phone
- `?branchId=` — filter by branch
- `?type=Retail|Paikari`
- `?due=1` — only customers with currentDue > 0
- `?pos=1` — lightweight list for POS customer selector
- `POST ?quick=1` — quick customer creation from POS (phone optional); returns `{ error, existing }` on 409

### `GET /api/branches`
Returns branches the current user has access to.

### `GET/POST/PATCH /api/users`
User CRUD. BRANCH_ADMIN can only create/view users for their branches.

### `GET /api/daily-orders`
Returns today's paikari order log for a branch.

### `POST /api/daily-orders`
Creates/updates a daily order entry (pending → taken/skipped).

---

## Components

### POSTerminal (`components/pos/POSTerminal.tsx`)
Main cash register. Features:
- Product search + cart
- Transaction mode selector: Cash Sale / Credit Sale / Partial Payment / Due Collection / Expense
- `cashPaid` auto-syncs to cart total when mode is 'Cash Sale' (via `useEffect`)
- Customer selector (searchable, with due balance shown)
- Checkout modal with payment breakdown

### SalesLog (`components/pos/SalesLog.tsx`)
Daily transaction log for managers. Summary cards:
- **মোট বিক্রি** — count of sales (SALE_TYPES only)
- **মোট টাকা** — total bill (admin/branch_admin only)
- **নগদ পেয়েছি** — cash received (CASH_IN_TYPES only — excludes Procurement)
- **বাকি দিয়েছি** — amount added to khata (shown when > 0)
- **স্টক কিনেছি** — total stock purchase cost (shown when > 0, in red)

### StockManager (`components/pos/StockManager.tsx`)
Stock entry for managers:
- Shows current stock level + buying price per product/variant
- Quantity input (additive only — no set-total mode)
- Buying price auto-filled from product; manager can override
- "দোকানের টাকায় কিনেছি" checkbox — **required**, defaults checked, shows total cost
- Blocked from saving if checkbox unchecked

### ZReport (`components/pos/ZReport.tsx`)
End-of-day closing. Three sections:
1. **রাতের ক্যাশ চেক** — expected vs physical cash; gap display; reason required if |gap| > ৳30
2. **স্টক চেক** — physical count per product; reason required if |gap| > 1 unit
3. **কালকের প্রি-অর্ডার** — set tomorrow's paikari delivery quantities

### BranchReport (`components/admin/BranchReport.tsx`)
Admin daily report for a branch. Sections:
1. **Sales cards** — revenue, cash in, due collected, expenses, procurement
2. **Cash check** — visual chip equation: `Opening + Sales + Collections − Expenses − Stock Bought = Expected`, then manager's count + gap
3. **Stock check** — physical vs system stock table with reasons
4. **Supplier orders** — yesterday's pre-orders vs tomorrow's pre-orders
5. **Due debtors** — customers with outstanding balance
6. **7-day history** — recent DailyClosing records

### AnalyticsDashboard (`components/dashboard/AnalyticsDashboard.tsx`)
Business analytics. Reads from DailySummary (fast). Shows:
- Row 1: Total Sales Revenue / COGS / Gross Profit / Net Profit
- Row 2: Cash In / Procurement Cost / Total Litres Sold / Outstanding Due
- Revenue & Net Profit trend chart
- Branch comparison table (SUPER_ADMIN only)

### UserManager (`components/admin/UserManager.tsx`)
User CRUD with role-aware branch selector:
- **MANAGER** role → single `<select>` dropdown (one branch only)
- **BRANCH_ADMIN** role → multi-checkbox list

### CustomerManager (`components/admin/CustomerManager.tsx`)
Customer CRUD. Used in both admin and manager pages.
- `lightMode` prop: pass from manager pages (bg-gray-50) to get light-theme text/borders
- Without `lightMode`: dark slate theme for admin dashboard

---

## Key Design Decisions

### Why DailySummary (pre-computed analytics)?
Running aggregations on the full `transactions` collection for date ranges is slow at scale. `DailySummary` is upserted after every transaction write — analytics reads are instant O(n days) not O(n transactions).

### Why 404 (not 403) for unauthorized branches?
Security through obscurity. BRANCH_ADMIN and MANAGER shouldn't even know other branches exist.

### Why Bangla for manager UI, English for admin?
Managers are field staff — native Bangla speakers operating a physical POS. Admins are owners/operators who work in English.

### Procurement ≠ Revenue
Stock purchases from suppliers are a **cost**, not a sale. They reduce drawer cash and must be tracked separately. Never include Procurement in revenue totals or "cash received" summaries.

### Opening Cash Auto-Carry
No manual opening cash input. Yesterday's `nightCashCounted` automatically becomes today's `openingCash`. This prevents human error and keeps the chain of custody intact.

### SUPER_ADMIN Branch Session
SUPER_ADMIN's `assignedBranches` is empty in the DB by design. At login, `lib/auth.ts` queries all active `Branch._id` values and puts them in the JWT. This means new branches are automatically accessible after the admin logs out and back in.

### netProfitAmount on Procurement
`netProfitAmount = -totalBill` for Procurement and Expense transactions. This makes profit aggregations simple: `SUM(netProfitAmount)` across all transaction types gives correct gross profit because costs are already negative.

---

## Known Gotchas

### Zod v4 `.partial()` drops `.default()`
In Zod 4, calling `.partial()` on a schema strips nested `.default()` values. Use explicit `.optional()` in update schemas instead of `.partial()`.

### Turbopack dynamic import in auth
`lib/auth.ts` uses `const User = (await import('@/models/User')).default` inside the `authorize` callback. This is a Turbopack workaround — static imports of Mongoose models at the top level can fail during hot reload.

### instrumentationHook config
Do **not** add `instrumentationHook: true` to `next.config.mjs`. It's built-in in Next.js 15+ and adding it explicitly causes a warning.

### setRow buyingPrice bug pattern
In `StockManager.tsx`, `setRow(key, patch)` internally calls `getRow(key, 0)` to build the initial state. If `rows[key]` doesn't exist yet (first interaction), the `buyingPrice` arg of 0 creates an empty buying price. Always pass the actual `buyingPrice` as the third argument to `setRow`: `setRow(key, patch, buyingPrice)`.

### DailySummary backfill
If transactions were created before `DailySummary` was introduced, run `lib/update-daily-summary.ts` for each branch + date pair to backfill.

### Branch admin sees no other branches
Every API that returns branch-scoped data filters by `session.user.assignedBranches`. If a BRANCH_ADMIN is accidentally given an empty `assignedBranches` array, they'll see no data but get no error — silent empty state. Check their user record in the DB.

---

## CSS Utility Classes

Defined in `globals.css` under `@layer components`:

| Class | Usage |
|---|---|
| `.card` | Dark card: `bg-slate-900 border border-slate-800 rounded-xl` |
| `.lcard` | Light card: `bg-white border border-gray-200 rounded-2xl shadow-sm` (manager pages) |
| `.input-base` | Dark input for admin forms |
| `.btn-primary` | Blue primary button |
| `.btn-secondary` | Slate secondary button |
| `.btn-danger` | Rose danger button |

Admin pages use dark theme (slate-900 base). Manager POS pages use light theme (gray-50 base, white cards).

---

## Auth Flow

```
Login page (phone + password)
  → NextAuth credentials provider
  → lib/auth.ts authorize()
    → find User by phone
    → bcrypt compare password
    → if SUPER_ADMIN: fetch all Branch._ids → put in assignedBranches
    → return JWT { id, name, phone, role, assignedBranches }
  → JWT stored in cookie
  → proxy.ts middleware checks JWT on every request
    → no token → redirect /login
    → MANAGER on admin URL → redirect /{branchId}/pos
    → BRANCH_ADMIN on wrong branch → redirect /
```

## Middleware (proxy.ts)

```
/branches/*                  → SUPER_ADMIN only
/analytics, /users, /products, /customers, /due, /regular-orders, /branches
  → MANAGER redirected to /{branchId}/pos

/[branchId]/(pos|transactions|customers|stock|due|z-report)
  → non-SUPER_ADMIN: must have branchId in assignedBranches

/[branchId]/anything-else
  → non-SUPER_ADMIN: must have branchId in assignedBranches
```
