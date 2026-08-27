ALTER TABLE public.store_sections ADD COLUMN IF NOT EXISTS rotation_deg integer NOT NULL DEFAULT 0;
UPDATE public.store_sections SET rotation_deg = 0 WHERE rotation_deg IS NULL;
