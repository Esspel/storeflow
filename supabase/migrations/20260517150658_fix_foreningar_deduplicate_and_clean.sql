/*
  # Fix foreningar table: remove duplicates, keep canonical entries

  Two migrations seeded the foreningar table resulting in duplicates.
  This migration:
  1. Deletes all entries with lowercase short_codes (the second, malformed seed)
  2. Keeps the original entries with proper short_codes (MITT, NORD, etc.)
  3. Removes any other duplicate entries keeping only the oldest record per name

  The foreningar represent Swedish consumer cooperatives (konsumentföreningar).
  The data comes from the application seed migrations — it is sample/placeholder 
  data. Admins can manage the actual list via the admin panel.
*/

-- Remove the second (duplicate) seed entries which used lowercase short_codes
DELETE FROM foreningar WHERE short_code = lower(short_code) AND length(short_code) > 4;

-- Remove any remaining duplicates by name, keeping the oldest entry
DELETE FROM foreningar
WHERE id NOT IN (
  SELECT DISTINCT ON (name) id
  FROM foreningar
  ORDER BY name, created_at ASC
);
