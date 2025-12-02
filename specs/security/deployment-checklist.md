# RLS Migration Deployment Checklist

**Migration:** `20251202000001_add_rls_policies.sql`
**Author:** System Architect
**Date:** 2025-12-02

---

## Pre-Deployment

### 1. Review Migration File
- [x] Migration file created: `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20251202000001_add_rls_policies.sql`
- [x] 16 tables secured
- [x] 64 policies created (4 per table)
- [x] Design document created: `/Users/tony/Desktop/rolloy-scm/specs/security/rls-design.md`

### 2. Backup Production Database
```bash
# Via Supabase Dashboard:
# Settings > Database > Database Backups > Create Manual Backup

# Or via CLI:
supabase db dump -f backup_before_rls_$(date +%Y%m%d).sql
```

### 3. Test on Staging First
- [ ] Apply migration to staging database
- [ ] Run verification queries
- [ ] Test all application features
- [ ] Verify authenticated users can access data
- [ ] Verify anonymous users are blocked

---

## Deployment Steps

### Option A: Supabase Dashboard (Recommended)

1. Go to Supabase Dashboard → SQL Editor
2. Open a new query tab
3. Copy contents of `supabase/migrations/20251202000001_add_rls_policies.sql`
4. Paste into SQL Editor
5. Click "Run" button
6. Wait for "Success" message
7. Proceed to verification

### Option B: Supabase CLI

```bash
# Navigate to project root
cd /Users/tony/Desktop/rolloy-scm

# Apply migration
supabase db push

# Or run specific migration
psql $DATABASE_URL -f supabase/migrations/20251202000001_add_rls_policies.sql
```

---

## Post-Deployment Verification

### 1. Verify RLS is Enabled

Run this query in Supabase SQL Editor:

```sql
SELECT
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

**Expected Result:** All 16 tables should show `rls_enabled = true`

### 2. Verify Policies Created

```sql
SELECT
  tablename,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY tablename;
```

**Expected Result:** Each table should have exactly 4 policies

### 3. Test Application Access

**Authenticated User:**
- [ ] Log in to application
- [ ] Navigate to Dashboard
- [ ] Navigate to Planning (Sales Forecasts)
- [ ] Navigate to Procurement (Purchase Orders)
- [ ] Navigate to Logistics (Shipments)
- [ ] Navigate to Inventory (Stock Levels)
- [ ] Navigate to Settings (Master Data)
- [ ] All pages should load without errors

**Anonymous User:**
- [ ] Open application in incognito/private window
- [ ] Try to access protected routes
- [ ] Should redirect to login or show auth error

### 4. Test CRUD Operations

- [ ] Create: Add a new product in Settings
- [ ] Read: View inventory snapshots
- [ ] Update: Edit a purchase order
- [ ] Delete: Remove a test record
- [ ] All operations should work normally

---

## Rollback Plan

If issues occur, execute emergency rollback:

```sql
-- Disable RLS on all tables
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses DISABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_forecasts DISABLE ROW LEVEL SECURITY;
ALTER TABLE sales_actuals DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_sales_forecasts DISABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_sales_actuals DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_projections DISABLE ROW LEVEL SECURITY;
ALTER TABLE replenishment_suggestions DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE production_deliveries DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipments DISABLE ROW LEVEL SECURITY;
ALTER TABLE shipment_items DISABLE ROW LEVEL SECURITY;
```

Then restore from backup and investigate issue.

---

## Monitoring

### Watch for These Issues:

1. **Empty Query Results**
   - Symptom: Queries return 0 rows when data exists
   - Cause: RLS policy blocking access
   - Fix: Check authentication and policy logic

2. **401 Unauthorized Errors**
   - Symptom: API requests fail with 401
   - Cause: JWT token missing or expired
   - Fix: Verify Supabase Auth is working

3. **Performance Degradation**
   - Symptom: Queries slower than before
   - Cause: Policy evaluation overhead (unlikely with current simple policies)
   - Fix: Add indexes if needed

### Monitoring Queries

```sql
-- Check for failed queries
SELECT
  query,
  calls,
  total_time,
  mean_time
FROM pg_stat_statements
WHERE query LIKE '%FROM%'
  AND calls > 0
ORDER BY mean_time DESC
LIMIT 20;
```

---

## Success Criteria

Migration is successful if:

- [x] All 16 tables have RLS enabled
- [x] 64 policies created (4 per table)
- [ ] Authenticated users can access all features
- [ ] Anonymous users are blocked from data access
- [ ] No performance degradation
- [ ] No application errors in logs

---

## Next Steps (Future)

When ready to implement multi-tenant:

1. Review Section 5 of `rls-design.md`
2. Create `organizations` and `organization_members` tables
3. Add `organization_id` foreign keys to master tables
4. Create `get_user_organization_id()` function
5. Update policies to filter by organization_id
6. Test with multiple test organizations
7. Deploy gradually (one module at a time)

---

## Contact

**Issues or Questions:**
- System Architect: Review `specs/security/rls-design.md`
- QA Director: Run full security audit
- Backend Specialist: Debug policy issues

**Documentation:**
- Design Document: `/Users/tony/Desktop/rolloy-scm/specs/security/rls-design.md`
- Migration File: `/Users/tony/Desktop/rolloy-scm/supabase/migrations/20251202000001_add_rls_policies.sql`
- This Checklist: `/Users/tony/Desktop/rolloy-scm/specs/security/deployment-checklist.md`
