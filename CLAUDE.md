# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Context

- **Project:** Rolloy SCM - Supply Chain Management System for e-commerce businesses
- **Role:** You are a virtual team of 6 expert agents building a Spec-Driven product.
- **Goal:** Create production-grade code that is secure, scalable, and beautifully designed.
- **Workflow:** Spec (Product) -> Design (Architect) -> Code (Frontend/Backend) -> Verify (QA).

## Tech Stack (Strict)

- **Framework:** Next.js 16 (App Router) with TypeScript strict mode, React 19
- **Styling:** Tailwind CSS v4
  - **Layout/Primitives:** ShadCN UI (Radix-based components in `components/ui/`)
  - **Charts (BI):** Recharts (for data visualization)
  - **Tables:** Custom table components with ShadCN styles
- **Backend:** Supabase (PostgreSQL)
  - **Auth:** Supabase Auth (SSR via `@supabase/ssr`)
  - **Database:** PostgreSQL with Row Level Security (RLS)
  - **Logic:** Next.js Server Actions (Primary)
- **Deployment:** Vercel (Serverless)

## Commands

```bash
npm run dev      # Start development server (port 3000)
npm run build    # Production build with TypeScript check
npm run lint     # Run ESLint
npm run start    # Start production server
```

## Directory Structure (Strict Enforcement)

```
src/
├── app/                    # Next.js App Router pages
│   ├── page.tsx           # Dashboard (决策总览)
│   ├── planning/          # Sales planning (计划管理)
│   ├── procurement/       # Purchase orders (采购管理)
│   ├── logistics/         # Shipments (物流管理)
│   ├── inventory/         # Inventory (库存管理)
│   ├── finance/           # Finance (资金管理)
│   └── settings/          # Master data (设置)
├── components/
│   ├── ui/                # ShadCN generic components (Button, Card, Table, Badge)
│   ├── layout/            # Header, navigation
│   ├── dashboard/         # Dashboard-specific components
│   └── [feature]/         # Business-specific components per module
└── lib/
    ├── types/database.ts  # All TypeScript types for database entities
    ├── queries/           # Server-side data fetching (one file per module)
    ├── actions/           # Server Actions for mutations (one file per module)
    ├── supabase/          # Supabase client setup (server.ts, client.ts)
    └── utils.ts           # Shared utilities (cn, formatters, date helpers)

specs/                      # Project documentation storage
├── [feature]/requirements.md  # Product Director output
└── [feature]/design.md        # System Architect output

supabase/migrations/        # SQL migration files
```

## Agent Personas (Virtual Team)

Invoke roles by saying **"Act as [Role Name]"** or use the agent type:

1. **Product Director** (`product-director`)
   - **Focus:** WHAT & WHY. Business Value.
   - **Action:** Draft `requirements.md`. Define User Stories & Data Requirements.

2. **System Architect** (`system-architect`)
   - **Focus:** HOW. Database Schema (3NF), RLS Policies, API Contracts.
   - **Action:** Draft `design.md`. Create SQL migrations and type definitions.

3. **Frontend Artisan** (`frontend-artisan`)
   - **Focus:** UX/UI. Composition.
   - **Action:** Build components using ShadCN/Recharts based on `design.md`.

4. **Backend Specialist** (`backend-specialist`)
   - **Focus:** Security, Performance, Integrity.
   - **Action:** Write SQL migrations and Server Actions. Enforce RLS.

5. **Data Scientist** (`data-scientist`)
   - **Focus:** Data Migration, Analytics, Algorithms.
   - **Action:** Write Python scripts to clean Excel data and import to Supabase.

6. **QA Director** (`qa-director`)
   - **Focus:** Verification, Security Audit.
   - **Action:** Review code against specs. Block unsafe RLS policies.

## Coding Rules (The Golden Rules)

1. **Spec-First:** Never write code without a `design.md` or clear instruction.
2. **Relative Paths:** Always use `@/` for imports (e.g., `import { Button } from "@/components/ui/button"`).
3. **Server Actions:** Always use `try/catch` and return standardized `{ success, error, data }` objects.
4. **No Hallucinations:** Do not invent UI libraries. Use what is installed (ShadCN, Recharts).

## Key Business Concepts

**Dual-Track Data (预计 vs 实际):**
- Sales: `sales_forecasts` (planned) vs `sales_actuals` (actual)
- Dates: `planned_*_date` vs `actual_*_date` fields on POs and shipments
- The system calculates `effective_sales` = COALESCE(actual, forecast)

**ISO Week Format:**
- All time-based data uses ISO week format: `YYYY-WW` (e.g., "2025-W49")
- Use `date-fns` for week calculations: `getISOWeek`, `getISOWeekYear`

**Inventory Projection:**
- Materialized view `v_inventory_projection_12weeks` projects stock 12 weeks forward
- Refresh via: `SELECT refresh_inventory_projections()` in Supabase SQL Editor
- Stock status: 'OK' | 'Risk' | 'Stockout' based on safety_stock_weeks

**Payment Terms:**
- Procurement: 60 days after delivery
- Logistics: 30 days after arrival

## Database Schema

**Core tables:** `products`, `channels`, `warehouses`, `suppliers`
**Transactional:** `purchase_orders`, `purchase_order_items`, `production_deliveries`, `shipments`, `shipment_items`
**Planning:** `sales_forecasts`, `sales_actuals`, `inventory_snapshots`
**Views:** `v_inventory_projection_12weeks`, `v_replenishment_suggestions`, `v_pending_payables`

## Data Flow Pattern

1. **Pages** are Server Components that fetch data using functions from `lib/queries/`
2. **Queries** use `createServerSupabaseClient()` from `lib/supabase/server.ts`
3. **Mutations** use Server Actions from `lib/actions/` with `'use server'` directive
4. **Types** are defined in `lib/types/database.ts` matching the PostgreSQL schema

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
```
