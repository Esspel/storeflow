/*
  # Add SAP Integration Fields

  Adds SAP/Mitt Coop integration fields across stores, tasks, and incidents.

  ## Changes

  ### Modified Tables
  - `stores` — new `sap_site_id` (text, nullable): the store's unique SAP site number
    used to build Mitt Coop deep links (e.g., "1452")
  - `tasks` — new `sap_article_id` (text, nullable): SAP article ID for the article
    related to this task, enables Mitt Coop link generation
  - `incidents` — new `sap_article_id` (text, nullable): SAP article ID for the article
    related to this incident (e.g., a shelf-gap defect)

  ## Usage
  With both sap_site_id and sap_article_id set, the app can generate:
    https://mittcoop.coop.se/sortiment/articles/{sap_article_id}?siteId={sap_site_id}

  ## Notes
  - All fields are nullable; missing values are handled gracefully (no link shown)
  - No RLS changes needed; inherits existing table policies
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'stores' AND column_name = 'sap_site_id'
  ) THEN
    ALTER TABLE stores ADD COLUMN sap_site_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'tasks' AND column_name = 'sap_article_id'
  ) THEN
    ALTER TABLE tasks ADD COLUMN sap_article_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'incidents' AND column_name = 'sap_article_id'
  ) THEN
    ALTER TABLE incidents ADD COLUMN sap_article_id text;
  END IF;
END $$;
