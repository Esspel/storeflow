/*
# Add delivery_entry_keys to checklist_templates

## Purpose
Allows a delivery template to be configured for specific delivery days
rather than all days for a given supplier+flow combo.

## Change
- Adds `delivery_entry_keys text` to `checklist_templates`
  Stores pipe-separated keys in the form "Måndag||SupplierName||FlowName"
  each representing one specific delivery occurrence (day+supplier+flow).
  When empty/null the template falls back to the existing supplier+flow
  matching (backwards compatible).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'delivery_entry_keys'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN delivery_entry_keys text;
  END IF;
END $$;
