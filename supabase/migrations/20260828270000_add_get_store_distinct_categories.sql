-- Return distinct non-empty categories for a store from both delivery history and products.
-- Uses SECURITY INVOKER so RLS applies normally (user only sees their own store's data).

CREATE OR REPLACE FUNCTION get_store_distinct_categories(p_store_id uuid)
RETURNS TABLE(category text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT category
  FROM store_product_deliveries
  WHERE store_id = p_store_id AND category IS NOT NULL AND category <> ''
  UNION
  SELECT DISTINCT category
  FROM products
  WHERE store_id = p_store_id AND category IS NOT NULL AND category <> ''
$$;
