/*
  # Link stores to foreningar/distrikt and distrikt to foreningar

  ## Changes
  1. Populate stores.forening_id by matching stores.bolag to foreningar.name
  2. Populate stores.distrikt_id by matching stores.distrikt_namn to distrikt.name
  3. Populate distrikt.forening_id by finding the most common forening_id among
     stores that belong to each distrikt (best-effort inference)

  ## Notes
  - Only updates rows where the match is unambiguous
  - Stores with no matching bolag/distrikt_namn are left as NULL
*/

-- Step 1: Link stores to foreningar via bolag column (exact name match)
UPDATE stores
SET forening_id = f.id
FROM foreningar f
WHERE stores.bolag IS NOT NULL
  AND stores.bolag != ''
  AND stores.bolag = f.name
  AND stores.forening_id IS NULL;

-- Step 2: Link stores to distrikt via distrikt_namn column (exact name match)
UPDATE stores
SET distrikt_id = d.id
FROM distrikt d
WHERE stores.distrikt_namn IS NOT NULL
  AND stores.distrikt_namn != ''
  AND stores.distrikt_namn = d.name
  AND stores.distrikt_id IS NULL;

-- Step 3: Link distrikt to foreningar by finding the most common forening_id
-- among stores that belong to each distrikt
UPDATE distrikt
SET forening_id = subq.forening_id
FROM (
  SELECT
    s.distrikt_id,
    s.forening_id,
    COUNT(*) as cnt,
    ROW_NUMBER() OVER (PARTITION BY s.distrikt_id ORDER BY COUNT(*) DESC) as rn
  FROM stores s
  WHERE s.distrikt_id IS NOT NULL
    AND s.forening_id IS NOT NULL
  GROUP BY s.distrikt_id, s.forening_id
) subq
WHERE subq.rn = 1
  AND distrikt.id = subq.distrikt_id
  AND distrikt.forening_id IS NULL;
