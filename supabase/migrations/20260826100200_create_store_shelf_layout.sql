CREATE TABLE IF NOT EXISTS public.store_avdelningar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  namn text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_avdelning_store ON public.store_avdelningar (store_id);

CREATE TABLE IF NOT EXISTS public.store_sektioner (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  avdelning_id uuid NOT NULL REFERENCES public.store_avdelningar(id) ON DELETE CASCADE,
  skepp_id uuid,
  namn text NOT NULL,
  pos_x_cm integer NOT NULL DEFAULT 0,
  pos_y_cm integer NOT NULL DEFAULT 0,
  bredd_cm integer NOT NULL DEFAULT 80,
  höjd_cm integer NOT NULL DEFAULT 200,
  djup_cm integer NOT NULL DEFAULT 60,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sektion_avdelning ON public.store_sektioner (avdelning_id);

CREATE TABLE IF NOT EXISTS public.store_hyllor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sektion_id uuid NOT NULL REFERENCES public.store_sektioner(id) ON DELETE CASCADE,
  nivå integer NOT NULL,
  planogram_id text,
  manual_override boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.store_skepp (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL,
  marker_id text NOT NULL UNIQUE,
  namn text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_skepp_store ON public.store_skepp (store_id);

ALTER TABLE public.store_avdelningar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_sektioner ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_hyllor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_skepp ENABLE ROW LEVEL SECURITY;
