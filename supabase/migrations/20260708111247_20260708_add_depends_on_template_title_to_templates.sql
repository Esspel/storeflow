/*
# Lägg till kedjeberoende via mallnamn i checklist_templates

## Syfte
Möjliggör uppgiftskedjor (task chains) via CSV-import av mallar.
En mall kan referera till en föregångarmall via namn istället för ID,
vilket är praktiskt vid CSV-import där IDs inte är kända i förväg.

## Ändringar i checklist_templates
- Ny kolumn: `depends_on_template_title` (text) — titel på föregångarmall i kedjan
  Används vid mallapplikation i uppgifter.tsx för att auto-populera depends_on_task_id

## Noteringar
- Befintliga mallar påverkas inte (kolumnen är nullable)
- RLS-policies behöver inte ändras
*/

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'checklist_templates' AND column_name = 'depends_on_template_title'
  ) THEN
    ALTER TABLE checklist_templates ADD COLUMN depends_on_template_title text;
  END IF;
END $$;
