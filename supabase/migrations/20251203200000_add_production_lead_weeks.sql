-- ================================================================
-- Migration: Add production_lead_weeks to products table
-- Date: 2025-12-03 20:00
-- Description: Add production cycle time field to track manufacturing lead time
-- ================================================================

-- Add production_lead_weeks field to products table
-- Default: 5 weeks (industry standard for most products)
-- Constraint: Minimum 1 week (production must take at least 1 week)
ALTER TABLE products
ADD COLUMN IF NOT EXISTS production_lead_weeks INTEGER NOT NULL DEFAULT 5;

-- Add constraint to ensure production cycle is at least 1 week
ALTER TABLE products
ADD CONSTRAINT production_lead_weeks_min CHECK (production_lead_weeks >= 1);

-- Add comment explaining the field's purpose
COMMENT ON COLUMN products.production_lead_weeks IS '生产周期（周数），从下单到工厂出货的时间，默认5周。用于补货建议和库存预测中的提前期计算。';

-- Update existing products to use default value if needed
-- (This is safe because we added the column with NOT NULL and DEFAULT)
UPDATE products
SET production_lead_weeks = 5
WHERE production_lead_weeks IS NULL;
