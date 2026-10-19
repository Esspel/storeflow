-- Snabbare products-hämtning i ersättningscheck: täckande index på store_id + is_active + sap_article_id
CREATE INDEX IF NOT EXISTS idx_products_store_active_sap ON products(store_id, is_active, sap_article_id);
CREATE INDEX IF NOT EXISTS idx_products_store_active_name ON products(store_id, is_active, name);
