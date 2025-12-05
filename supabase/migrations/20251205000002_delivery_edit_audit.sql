-- Delivery edit audit log for tracking all changes
-- Migration created: 2025-12-05
-- Purpose: Add audit trail for production delivery edits

-- Create audit log table
CREATE TABLE IF NOT EXISTS delivery_edit_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  delivery_id UUID NOT NULL REFERENCES production_deliveries(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES auth.users(id), -- User who made the change
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  changed_fields JSONB NOT NULL, -- { "delivered_qty": { "old": 500, "new": 600 } }
  change_reason TEXT, -- From remarks or separate field
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for querying audit history
CREATE INDEX IF NOT EXISTS idx_delivery_edit_audit_delivery_id ON delivery_edit_audit_log(delivery_id);
CREATE INDEX IF NOT EXISTS idx_delivery_edit_audit_changed_at ON delivery_edit_audit_log(changed_at DESC);

-- Add comments for documentation
COMMENT ON TABLE delivery_edit_audit_log IS 'Audit trail for all production delivery record modifications';
COMMENT ON COLUMN delivery_edit_audit_log.changed_fields IS 'JSONB object containing old and new values for each changed field';
COMMENT ON COLUMN delivery_edit_audit_log.change_reason IS 'Optional explanation for why the change was made';

-- Enable Row Level Security
ALTER TABLE delivery_edit_audit_log ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow all authenticated users to read audit logs
CREATE POLICY "Audit logs viewable by authenticated users"
  ON delivery_edit_audit_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- RLS Policy: System can insert audit logs (using service role)
CREATE POLICY "System can insert audit logs"
  ON delivery_edit_audit_log FOR INSERT
  WITH CHECK (true);

-- Grant permissions
GRANT SELECT ON delivery_edit_audit_log TO authenticated;
GRANT INSERT ON delivery_edit_audit_log TO service_role;
