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

### Auto-Dispatch Rules (IMPORTANT)

When the user describes a task in natural language, **automatically dispatch** the appropriate agent(s) using the Task tool. Multiple agents can run **in parallel** when their work is independent.

**Trigger Keywords → Agent Mapping (中英文双语):**

| Agent | 中文触发词 | English Triggers | Parallel? |
|-------|-----------|------------------|-----------|
| `product-director` | 新功能、需求、用户故事、业务需求、产品定义 | new feature, requirement, user story, business need, define product | Start first |
| `system-architect` | 数据库设计、表结构、API设计、RLS策略、技术方案、架构 | database design, schema, API design, RLS policy, technical spec, architecture | After product |
| `frontend-artisan` | 页面、UI、组件、界面、图表、样式、前端 | page, UI, component, interface, chart, styling, frontend | ✅ Yes |
| `backend-specialist` | 写SQL、migration、Server Action、后端逻辑、接口、查询 | write SQL, migration, server action, backend logic, endpoint, query | ✅ Yes |
| `data-scientist` | 导入数据、Excel、CSV、数据清洗、算法、分析、ETL | import data, Excel, CSV, data cleaning, algorithm, analytics, ETL | ✅ Yes |
| `qa-director` | 检查、review、测试、安全审计、代码审查、验证 | check, review, test, security audit, code review, verify | After code |

**Parallel Execution Examples (中英文):**

```
中文: "给库存页面加一个图表，同时写个查询接口"
English: "Add a chart to inventory page and create a query endpoint"
→ Parallel: frontend-artisan + backend-specialist

中文: "做一个新的报表功能"
English: "Build a new reporting feature"
→ Sequential: product-director → system-architect → (frontend + backend) → qa-director

中文: "导入这个Excel，然后在页面上显示"
English: "Import this Excel and display it on a page"
→ Sequential: data-scientist → frontend-artisan

中文: "检查一下代码有没有安全问题"
English: "Review the code for security issues"
→ Single: qa-director
```

**Auto-Dispatch Behavior:**
1. Analyze user intent from natural language
2. Match to one or more agents based on keywords/context
3. For independent tasks: launch agents **in parallel** (single message, multiple Task calls)
4. For dependent tasks: launch **sequentially** (wait for previous agent to complete)
5. Aggregate results and present unified response to user

### Agent Definitions

1. **Product Director** (`product-director`)
   - **Trigger:** New feature requests, business requirements, user stories
   - **Focus:** WHAT & WHY. Business Value.
   - **Output:** `specs/[feature]/requirements.md`

2. **System Architect** (`system-architect`)
   - **Trigger:** Database design, API contracts, technical specifications
   - **Focus:** HOW. Database Schema (3NF), RLS Policies, API Contracts.
   - **Output:** `specs/[feature]/design.md`, SQL migrations, TypeScript types

3. **Frontend Artisan** (`frontend-artisan`)
   - **Trigger:** UI work, pages, components, charts, styling
   - **Focus:** UX/UI. Composition with ShadCN/Recharts.
   - **Output:** React components in `src/components/` and pages in `src/app/`

4. **Backend Specialist** (`backend-specialist`)
   - **Trigger:** Server logic, database operations, security rules
   - **Focus:** Security, Performance, Integrity.
   - **Output:** SQL migrations, Server Actions in `src/lib/actions/`

5. **Data Scientist** (`data-scientist`)
   - **Trigger:** Data import, Excel/CSV processing, analytics, algorithms
   - **Focus:** Data Migration, Analytics, Algorithms.
   - **Output:** Python scripts, SQL views, data transformations

6. **QA Director** (`qa-director`)
   - **Trigger:** Code review, testing, security audit, verification
   - **Focus:** Verification, Security Audit.
   - **Output:** Test cases, security review reports, bug reports

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
