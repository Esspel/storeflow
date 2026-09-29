/*
  Migration: Add composite index on reclamations for ersättningscheck performance
  (store_id, sap_article_id, status, created_at) to speed up statistics queries.
*/
CREATE INDEX IF NOT EXISTS idx_reclamations_ersattning_check
  ON public.reclamations (store_id, sap_article_id, status, created_at);