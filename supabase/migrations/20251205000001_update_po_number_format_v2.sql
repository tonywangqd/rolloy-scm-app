-- ================================================================
-- Migration: Confirm PO Number Format (no changes needed)
-- Format: PO{YYYYMMDD}{NN} - e.g., PO2025120501
-- Author: Rolloy SCM System
-- Date: 2025-12-05
-- ================================================================

-- The validate_po_number_format function already exists in 20251201_update_po_number_format.sql
-- and validates the format: PO{YYYYMMDD}{NN}
-- No changes needed - this file is kept for documentation purposes

-- Example valid PO numbers:
-- PO2025010101 - First PO on Jan 1, 2025
-- PO2025120501 - First PO on Dec 5, 2025
-- PO2025120502 - Second PO on Dec 5, 2025
