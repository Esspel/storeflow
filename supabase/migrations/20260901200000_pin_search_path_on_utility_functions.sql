/*
  Migration: Pin search_path on utility functions to prevent
  "function_search_path_mutable" Supabase linter warning.

  Five functions were created without an explicit SET search_path.
  The recommended fix is to set search_path to a known safe schema
  (public) so the function cannot be tricked into running attacker-
  controlled code from another schema.

  Functions fixed:
  - get_store_distinct_categories   (created 20260828270000)
  - update_updated_at_column        (created 20260823150000)
  - vector3_distance                (created 20260823150000)
  - find_nearest_markers            (created 20260823150000)
  - set_updated_at                  (likely created by an earlier trigger migration)
*/

CREATE OR REPLACE FUNCTION public.get_store_distinct_categories(p_store_id uuid)
RETURNS TABLE(category text)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT category
  FROM store_product_deliveries
  WHERE store_id = p_store_id AND category IS NOT NULL AND category <> ''
  UNION
  SELECT DISTINCT category
  FROM products
  WHERE store_id = p_store_id AND category IS NOT NULL AND category <> ''
$$;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.vector3_distance(a vector3, b vector3)
RETURNS double precision
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT sqrt(
    (a.x - b.x)^2 + (a.y - b.y)^2 + (a.z - b.z)^2
  );
$$;

CREATE OR REPLACE FUNCTION public.find_nearest_markers(
  p_map_id uuid,
  p_position vector3,
  p_max_distance double precision DEFAULT 10.0,
  p_limit int DEFAULT 10
)
RETURNS TABLE (
  marker_id uuid,
  marker_type text,
  marker_id_str text,
  marker_position vector3,
  distance double precision
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    sm.id,
    sm.marker_type,
    sm.marker_id,
    sm.position as marker_position,
    vector3_distance(sm.position, p_position) as distance
  FROM spatial_markers sm
  WHERE sm.map_id = p_map_id
    AND sm.is_active = true
    AND vector3_distance(sm.position, p_position) <= p_max_distance
  ORDER BY distance
  LIMIT p_limit;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.set_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SET search_path = public
      AS $body$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $body$;
    $fn$;
  END IF;
END $$;
