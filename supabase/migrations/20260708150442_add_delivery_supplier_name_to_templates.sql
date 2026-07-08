/*
# Add delivery_supplier_name to checklist_templates

## Summary
Adds a `delivery_supplier_name` column to `checklist_templates` to allow templates
to be filtered not just by delivery flow name (e.g. "Färskt") but also by specific
supplier/company name (e.g. "Eskilstuna Coop logistik AB").

## Changes
- `checklist_templates`: new nullable text column `delivery_supplier_name`
  - Stores pipe-separated supplier names, e.g. "Eskilstuna Coop logistik AB|ICA Lager AB"
  - Combined with `delivery_flow_name` to filter delivery entries at batch-create time
  - If empty, only `delivery_flow_name` is used for filtering (existing behavior)
  - If set, only entries matching BOTH flow AND supplier are pre-selected

## Notes
- No data migration needed — existing rows default to NULL (no supplier filter)
- NULL delivery_supplier_name = show all deliveries of the matching flows (backwards compatible)
*/

ALTER TABLE checklist_templates
ADD COLUMN IF NOT EXISTS delivery_supplier_name text;
