/*
# Lägg till händelsebaserade uppgifter, uppgiftskedjor och leveransbaserade uppgifter

## Syfte
Tre nya funktioner för StoreFlow:

1. **Händelsebaserade uppgifter (#1):** En uppgift kan kräva att en ansvarig person 
   bekräftar att en viss händelse har inträffat innan uppgiften aktiveras.
   - `event_trigger_description` — beskrivning av händelsen som måste bekräftas
   - `event_trigger_user_id` — person som ansvarar för att bekräfta händelsen
   - `event_triggered_at` — tidpunkt när händelsen bekräftades (null = ej bekräftad)

2. **Uppgiftskedjor (#4):** En uppgift kan vara beroende av att en annan uppgift 
   är klar innan den kan påbörjas.
   - `depends_on_task_id` — ID för föregående uppgift i kedjan

3. **Leveransbaserade uppgifter (#2):** En uppgift kan vara kopplad till en specifik 
   leveransrad i leveransplanen, så att leveranstid och leverantör visas.
   - `delivery_entry_id` — koppling till delivery_entries-tabellen

## Ändringar i tasks-tabellen
- Ny kolumn: `event_trigger_description` (text) — vad ska kontrolleras
- Ny kolumn: `event_trigger_user_id` (uuid FK → app_users) — vem bekräftar
- Ny kolumn: `event_triggered_at` (timestamptz) — när bekräftades
- Ny kolumn: `depends_on_task_id` (uuid FK → tasks) — föregående uppgift
- Ny kolumn: `delivery_entry_id` (uuid FK → delivery_entries) — leveransrad

## Ändringar i checklist_templates-tabellen
- Ny kolumn: `event_trigger_description` (text) — händelsevillkor för mall
- Ny kolumn: `is_delivery_task` (boolean) — om mallen genererar leveransuppgifter
- Ny kolumn: `delivery_flow_name` (text) — flödesfilter (Färskt, Torrt, etc.)

## Säkerhet
Inga nya policies behövs — nya kolumner ärver befintliga RLS-policies på tasks 
och checklist_templates.
*/

-- tasks: event trigger fields
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='event_trigger_description') THEN
    ALTER TABLE tasks ADD COLUMN event_trigger_description text;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='event_trigger_user_id') THEN
    ALTER TABLE tasks ADD COLUMN event_trigger_user_id uuid REFERENCES app_users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='event_triggered_at') THEN
    ALTER TABLE tasks ADD COLUMN event_triggered_at timestamptz;
  END IF;
END $$;

-- tasks: chain dependency
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='depends_on_task_id') THEN
    ALTER TABLE tasks ADD COLUMN depends_on_task_id uuid REFERENCES tasks(id) ON DELETE SET NULL;
  END IF;
END $$;

-- tasks: delivery link
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='delivery_entry_id') THEN
    ALTER TABLE tasks ADD COLUMN delivery_entry_id uuid REFERENCES delivery_entries(id) ON DELETE SET NULL;
  END IF;
END $$;

-- checklist_templates: event trigger description
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='event_trigger_description') THEN
    ALTER TABLE checklist_templates ADD COLUMN event_trigger_description text;
  END IF;
END $$;

-- checklist_templates: delivery task flag
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='is_delivery_task') THEN
    ALTER TABLE checklist_templates ADD COLUMN is_delivery_task boolean DEFAULT false;
  END IF;
END $$;

-- checklist_templates: delivery flow filter
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='checklist_templates' AND column_name='delivery_flow_name') THEN
    ALTER TABLE checklist_templates ADD COLUMN delivery_flow_name text;
  END IF;
END $$;

-- Index for event trigger lookups
CREATE INDEX IF NOT EXISTS idx_tasks_event_trigger_user ON tasks(event_trigger_user_id) WHERE event_trigger_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_depends_on ON tasks(depends_on_task_id) WHERE depends_on_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tasks_delivery_entry ON tasks(delivery_entry_id) WHERE delivery_entry_id IS NOT NULL;
