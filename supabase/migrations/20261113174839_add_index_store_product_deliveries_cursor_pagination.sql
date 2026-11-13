/*
  Add composite index for cursor-based pagination on store_product_deliveries.
  This supports the query pattern: filter by store_id, order by arrival_date DESC, id ASC.
  This replaces offset-based pagination which times out at large offsets.
*/
CREATE INDEX IF NOT EXISTS idx_store_product_deliveries_store_arrival_id
  ON public.store_product_deliveries (store_id, arrival_date DESC, id ASC);