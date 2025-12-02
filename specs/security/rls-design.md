# Row Level Security (RLS) Design Document

**Feature:** Comprehensive Database Security via Row Level Security
**Author:** System Architect
**Date:** 2025-12-02
**Status:** Implementation Complete

---

## 1. Overview

This document describes the Row Level Security (RLS) implementation for the Rolloy SCM database. RLS is a PostgreSQL security feature that restricts which rows a user can access in database queries.

### 1.1 Design Goals

1. **Security by Design:** Enforce authentication at the database level, not just the application level
2. **Single-tenant Ready:** Allow all authenticated users to access company data
3. **Multi-tenant Prepared:** Design allows future extension to multi-tenant architecture
4. **Performance:** Policies should not significantly impact query performance

---

## 2. Architecture Design

### 2.1 Current Implementation: Single-Tenant

**Authentication Model:**
- Supabase Auth provides authentication via JWT tokens
- `auth.uid()` function returns the authenticated user's UUID
- Policy: `TO authenticated USING (true)` means "allow all authenticated users"

**Security Boundary:**
- Application requires user to sign in via Supabase Auth
- All database queries use authenticated Supabase client
- RLS prevents direct database access without authentication

### 2.2 Policy Pattern (4 Policies per Table)

Each table has 4 policies covering all DML operations:

```sql
-- SELECT: Read access
CREATE POLICY "[table]_select_policy"
  ON [table] FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Create new records
CREATE POLICY "[table]_insert_policy"
  ON [table] FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: Modify existing records
CREATE POLICY "[table]_update_policy"
  ON [table] FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- DELETE: Remove records
CREATE POLICY "[table]_delete_policy"
  ON [table] FOR DELETE
  TO authenticated
  USING (true);
```

**Why 4 separate policies?**
- Granular control: Can disable INSERT but allow SELECT
- Audit trail: Policy names show intent clearly
- Future flexibility: Easy to add role-based restrictions per operation

---

## 3. Schema Coverage

### 3.1 Tables Secured (16 Total)

#### Master Data (4 tables)
- `products` - SKU master data with cost and safety stock
- `channels` - Sales channel definitions (Amazon, eBay, etc.)
- `warehouses` - FBA and 3PL warehouse locations
- `suppliers` - Factory and vendor information

#### Planning Data (4 tables)
- `sales_forecasts` - Weekly sales forecasts (ISO week format)
- `sales_actuals` - Actual sales data (ISO week format)
- `weekly_sales_forecasts` - Legacy forecast format (YYYY-WW)
- `weekly_sales_actuals` - Legacy actual sales format (YYYY-WW)

#### Inventory Data (3 tables)
- `inventory_snapshots` - Current on-hand inventory by warehouse
- `inventory_projections` - Computed weekly projections (if table exists)
- `replenishment_suggestions` - Automated reorder recommendations

#### Procurement Data (3 tables)
- `purchase_orders` - PO header (supplier, dates, status)
- `purchase_order_items` - PO line items (SKU quantities)
- `production_deliveries` - Factory delivery records with payment tracking

#### Logistics Data (2 tables)
- `shipments` - Shipment tracking and cost information
- `shipment_items` - SKU quantities per shipment

### 3.2 Policy Statistics

- **Total tables secured:** 16
- **Total policies created:** 64 (16 tables × 4 policies)
- **RLS mode:** Enabled on all tables
- **Default action:** DENY (RLS blocks access by default)

---

## 4. Security Model

### 4.1 Authentication Flow

```
User Request
    ↓
Next.js Server Action/API Route
    ↓
createServerSupabaseClient()
    ↓
Supabase Client (with JWT)
    ↓
PostgreSQL + RLS
    ↓
Data (if authenticated) OR Access Denied
```

### 4.2 Policy Evaluation

**For SELECT queries:**
```sql
USING (true)  -- If true, user can see this row
```

**For INSERT queries:**
```sql
WITH CHECK (true)  -- If true, user can create this row
```

**For UPDATE queries:**
```sql
USING (true)       -- Can user see existing row?
WITH CHECK (true)  -- Is new row value allowed?
```

**For DELETE queries:**
```sql
USING (true)  -- Can user delete this row?
```

### 4.3 Current Policy Logic

```sql
TO authenticated   -- Only users with valid JWT
USING (true)       -- Allow all rows (single-tenant)
WITH CHECK (true)  -- Allow all inserts/updates
```

This means:
- Anonymous users: BLOCKED (no JWT token)
- Authenticated users: ALLOWED (all company data)

---

## 5. Future Enhancement: Multi-Tenant

### 5.1 Migration Path

When transitioning to multi-tenant architecture:

**Step 1: Add Organization Tables**
```sql
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id),
  user_id UUID REFERENCES auth.users(id),
  role TEXT NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);
```

**Step 2: Add organization_id to Master Tables**
```sql
ALTER TABLE products ADD COLUMN organization_id UUID REFERENCES organizations(id);
ALTER TABLE channels ADD COLUMN organization_id UUID REFERENCES organizations(id);
-- ... repeat for all master tables
```

**Step 3: Create Helper Function**
```sql
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
  SELECT organization_id
  FROM organization_members
  WHERE user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

**Step 4: Update Policies**
```sql
-- Replace single-tenant policy
DROP POLICY "products_select_policy" ON products;

-- With multi-tenant policy
CREATE POLICY "products_select_policy"
  ON products FOR SELECT
  TO authenticated
  USING (organization_id = get_user_organization_id());
```

### 5.2 Multi-Tenant Design Benefits

- **Data Isolation:** Each organization only sees their own data
- **Scalability:** Support unlimited organizations on same database
- **Cost Efficiency:** Share database infrastructure across customers
- **Security:** Impossible for Organization A to access Organization B's data

---

## 6. Testing and Verification

### 6.1 Manual Verification Query

Run this query in Supabase SQL Editor to verify RLS is enabled:

```sql
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN (
    'products', 'channels', 'warehouses', 'suppliers',
    'sales_forecasts', 'sales_actuals',
    'weekly_sales_forecasts', 'weekly_sales_actuals',
    'inventory_snapshots', 'inventory_projections', 'replenishment_suggestions',
    'purchase_orders', 'purchase_order_items', 'production_deliveries',
    'shipments', 'shipment_items'
  )
ORDER BY tablename;
```

Expected output: All 16 tables should show `rls_enabled = true`.

### 6.2 Policy Verification Query

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd;
```

Expected: 64 policies (16 tables × 4 operations).

### 6.3 Application Testing

1. **Authenticated User Test:**
   - Sign in via Supabase Auth
   - Verify all pages load correctly
   - Verify CRUD operations work (Create, Read, Update, Delete)

2. **Anonymous User Test:**
   - Clear Supabase session
   - Attempt to access API endpoints directly
   - Expected: Auth errors (401 Unauthorized)

3. **Direct Database Test:**
   - Try to query tables via SQL Editor without auth
   - Expected: RLS blocks access (returns empty results)

---

## 7. Performance Considerations

### 7.1 Index Strategy

RLS policies can impact query performance. Current policies use `USING (true)` which has minimal overhead since there's no filtering.

**When migrating to multi-tenant:**
```sql
-- Add index on organization_id for fast filtering
CREATE INDEX idx_products_organization_id ON products(organization_id);
CREATE INDEX idx_channels_organization_id ON channels(organization_id);
-- ... repeat for all tables
```

### 7.2 Policy Complexity

- **Simple policies** (current): `USING (true)` → No performance impact
- **Filtered policies** (multi-tenant): `USING (organization_id = ...)` → Minimal impact with proper indexes
- **Complex policies** (joins/subqueries): Can cause significant slowdown → Use `SECURITY DEFINER` functions

---

## 8. Migration Execution

### 8.1 Migration File

**File:** `supabase/migrations/20251202000001_add_rls_policies.sql`

**Contents:**
- 16 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` statements
- 64 `CREATE POLICY` statements (4 per table)
- Documentation comments
- Verification queries
- Future enhancement guide

### 8.2 Deployment Steps

1. **Backup:** Create database backup before migration
2. **Test:** Run migration on staging environment first
3. **Verify:** Execute verification queries
4. **Deploy:** Apply to production via Supabase Dashboard or CLI
5. **Monitor:** Check application logs for auth errors

### 8.3 Rollback Plan

If issues occur:

```sql
-- Disable RLS on all tables (emergency rollback)
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE channels DISABLE ROW LEVEL SECURITY;
-- ... repeat for all tables

-- Or drop all policies but keep RLS enabled
DROP POLICY "products_select_policy" ON products;
-- ... repeat for all policies
```

---

## 9. Security Best Practices

### 9.1 What RLS Protects Against

- Direct database access without authentication
- SQL injection attacks bypassing application logic
- Compromised API keys exposing all data
- Accidental data leaks from debugging endpoints

### 9.2 What RLS Does NOT Protect Against

- Application-level authorization bugs (e.g., user A editing user B's profile)
- XSS attacks stealing JWT tokens
- Brute force attacks on authentication endpoints
- Denial of Service (DoS) attacks

### 9.3 Defense in Depth

RLS is ONE layer of security. Complete security requires:

1. **Authentication:** Supabase Auth (JWT tokens)
2. **RLS:** Database-level access control (this migration)
3. **Application Logic:** Server Actions validate business rules
4. **HTTPS:** Encrypt data in transit (Vercel handles this)
5. **Environment Variables:** Secure API keys (never commit to git)
6. **Monitoring:** Log failed auth attempts and suspicious queries

---

## 10. Documentation for Developers

### 10.1 Adding New Tables

When creating new tables, ALWAYS add RLS policies:

```sql
-- Step 1: Create table
CREATE TABLE new_table (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Enable RLS
ALTER TABLE new_table ENABLE ROW LEVEL SECURITY;

-- Step 3: Add policies
CREATE POLICY "new_table_select_policy"
  ON new_table FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "new_table_insert_policy"
  ON new_table FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "new_table_update_policy"
  ON new_table FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "new_table_delete_policy"
  ON new_table FOR DELETE
  TO authenticated
  USING (true);
```

### 10.2 Debugging RLS Issues

**Symptom:** Queries return empty results even though data exists.

**Diagnosis:**
1. Check if RLS is enabled: `SELECT rowsecurity FROM pg_tables WHERE tablename = 'your_table'`
2. Check if policies exist: `SELECT * FROM pg_policies WHERE tablename = 'your_table'`
3. Verify user is authenticated: `SELECT auth.uid()` should return UUID, not NULL
4. Check policy logic: Review USING and WITH CHECK clauses

**Temporary Bypass (dev only):**
```sql
ALTER TABLE your_table DISABLE ROW LEVEL SECURITY;
-- Run your query
-- Re-enable immediately:
ALTER TABLE your_table ENABLE ROW LEVEL SECURITY;
```

### 10.3 Testing with Different Users

```typescript
// Server Action example
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function getData() {
  const supabase = await createServerSupabaseClient()

  // Check current user
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'Unauthorized' }
  }

  // RLS automatically filters based on auth.uid()
  const { data, error } = await supabase
    .from('products')
    .select('*')

  return { data, error }
}
```

---

## 11. Compliance and Audit

### 11.1 Regulatory Considerations

RLS helps meet compliance requirements:

- **SOC 2:** Access controls at database level
- **GDPR:** Data isolation per organization (when multi-tenant)
- **HIPAA:** Prevent unauthorized data access
- **ISO 27001:** Defense in depth security model

### 11.2 Audit Trail

Policy changes are logged in PostgreSQL:

```sql
-- View policy change history
SELECT
  event_time,
  user_name,
  object_name,
  command_tag,
  query
FROM pg_stat_statements
WHERE query LIKE '%POLICY%'
ORDER BY event_time DESC;
```

---

## 12. Summary

This RLS implementation provides a robust security foundation for Rolloy SCM:

- **16 tables** fully protected with Row Level Security
- **64 policies** covering all CRUD operations
- **Single-tenant ready** for current use case
- **Multi-tenant prepared** for future scaling
- **Production-grade** security with minimal performance impact

The migration is complete and ready for deployment.
