/*
  # Products table for planogram integration

  Stores product catalog information for mapping planogram EAN/BNR to StoreFlow products.
  Used by planogram import to link planogram items to existing products.
*/

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid REFERENCES stores(id) ON DELETE CASCADE,
  -- Product identification
  name text NOT NULL,
  brand text,
  -- Article identifiers (multiple formats supported)
  sap_article_id text,           -- SAP/MAT-NR
  article_number text,           -- Internal article number
  ean text,                      -- EAN-13 barcode
  bnr text,                      -- BNR (butiksnummer)
  -- Product details
  size text,                     -- e.g., "0.450 KG", "1.5 L"
  unit text,                     -- KG, L, ST, etc.
  category text,                 -- Product category
  -- Planogram/space management
  default_facings int DEFAULT 1,
  default_quantity int DEFAULT 0,
  -- Status
  is_active boolean DEFAULT true,
  is_discontinued boolean DEFAULT false,
  -- Metadata
  created_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  -- Constraints
  UNIQUE (store_id, ean),
  UNIQUE (store_id, bnr),
  UNIQUE (store_id, sap_article_id)
);

ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Users can see products for their store
DROP POLICY IF EXISTS "products_user_select" ON products;
CREATE POLICY "products_user_select" ON products
  FOR SELECT USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

-- Managers/admins can manage products for their store
DROP POLICY IF EXISTS "products_manager_insert" ON products;
CREATE POLICY "products_manager_insert" ON products
  FOR INSERT WITH CHECK (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "products_manager_update" ON products;
CREATE POLICY "products_manager_update" ON products
  FOR UPDATE USING (
    store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
    OR store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
  );

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_products_store_ean ON products(store_id, ean);
CREATE INDEX IF NOT EXISTS idx_products_store_bnr ON products(store_id, bnr);
CREATE INDEX IF NOT EXISTS idx_products_store_sap ON products(store_id, sap_article_id);
CREATE INDEX IF NOT EXISTS idx_products_store_active ON products(store_id, is_active);

/*
  # Planogram PDFs table
  Stores original PDF files for planograms
*/

CREATE TABLE IF NOT EXISTS planogram_pdfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  planogram_id uuid REFERENCES shelf_planograms(id) ON DELETE CASCADE,
  storage_path text NOT NULL,           -- Path in Supabase storage (attachments bucket)
  original_filename text NOT NULL,
  file_size_bytes bigint,
  uploaded_by uuid REFERENCES app_users(id) ON DELETE SET NULL,
  uploaded_at timestamptz DEFAULT now()
);

ALTER TABLE planogram_pdfs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "planogram_pdfs_select" ON planogram_pdfs;
CREATE POLICY "planogram_pdfs_select" ON planogram_pdfs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM shelf_planograms sp
      WHERE sp.id = planogram_pdfs.planogram_id
      AND (
        sp.store_id = (SELECT store_id FROM app_users WHERE id = auth.uid())
        OR sp.store_id = (SELECT active_store_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (SELECT 1 FROM app_users WHERE id = auth.uid() AND role = 'admin')
      )
    )
  );

CREATE INDEX IF NOT EXISTS idx_planogram_pdfs_planogram ON planogram_pdfs(planogram_id);

/*
  # Update shelf_planograms table to add PDF reference
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'shelf_planograms' AND column_name = 'pdf_storage_path'
  ) THEN
    ALTER TABLE shelf_planograms ADD COLUMN pdf_storage_path text;
  END IF;
END $$;

-- Add comment
COMMENT ON COLUMN shelf_planograms.pdf_storage_path IS 'Path to original PDF in Supabase storage (attachments bucket)';
