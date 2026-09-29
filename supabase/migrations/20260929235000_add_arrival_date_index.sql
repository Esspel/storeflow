/*
  Migration: Add index on reclamations(arrival_date) to speed up ersättningscheck
  duplicate detection - avoids articles that already have a reclamation with same delivery date
*/
CREATE INDEX IF NOT EXISTS idx_reclamations_arrival_date
  ON public.reclamations (arrival_date)
  WHERE arrival_date IS NOT NULL;