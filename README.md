# MittShopFlow

MittShopFlow är en lättviktslösning för drift- och avvikelsehantering i detaljhandel. Projektet består av en React/TypeScript-front-end byggd med TanStack React Start och en databasstruktur + migrations i `supabase/migrations`. Auth och datalagring hanteras via Supabase (Postgres + RLS + pgcrypto för bcrypt).

Status
- Frontend: React + Vite + TypeScript.
- Databas/migrationer: i `supabase/migrations` (tabeller, RLS-policys och pgcrypto-funktioner).
- Backend-koden (tidigare i `backend/`) är markerad som oanvänd/arkiverad. Om du vill använda Supabase behöver du inte köra en separat backend — frontend pratar direkt mot Supabase.
- Docker-compose innehåller lokala DB-servicar. Backend-servicen kan tas bort (eller är redan borttagen i main).

Kort översikt
- Frontend använder `@supabase/supabase-js` för att prata mot Supabase (auth, RPC, CRUD).
- Migrationerna skapar tabeller som `app_users`, `app_sessions`, `tasks`, `incidents` m.fl., samt funktioner för hashing/verifiering (`pgcrypto`) och RLS-policys.
- Seed-data finns i migrationsfilerna (ta bort/ändra i produktion).

Kom igång (rekommenderad: använd Supabase-hosting)
1. Skapa ett Supabase-projekt via https://app.supabase.com.
2. Hämta SUPABASE_URL och SUPABASE_ANON_KEY från projektinställningarna.
3. Kör migrationerna mot din Supabase-databas:
   - Antingen via Supabase SQL-editor (kopiera + kör SQL-filerna),
   - Eller via psql:
     PGPASSWORD="YOUR_DB_PASSWORD" psql "host=db.YOURPROJECT.supabase.co port=5432 dbname=postgres user=postgres" -f supabase/migrations/20260514144603_create_app_users_and_core_tables.sql
     PGPASSWORD="YOUR_DB_PASSWORD" psql "host=db.YOURPROJECT.supabase.co port=5432 dbname=postgres user=postgres" -f supabase/migrations/20260514144643_add_password_verification_function.sql
   - Obs: `CREATE EXTENSION pgcrypto` kräver tillräckliga rättigheter — Supabase-hosting stödjer pgcrypto; om du self-hostar Postgres se till att köra som superuser.
4. Lägg till miljövariabler i frontend (Vite kräver oftast prefix `VITE_` för att exponera variabler till klienten):
   - I projektets rot skapa `.env`:
     VITE_SUPABASE_URL=https://your-project.supabase.co
     VITE_SUPABASE_ANON_KEY=your-anon-key
     (om du har servernycklar: SUPABASE_SERVICE_ROLE_KEY — Spara DEN aldrig i klienten)
5. Starta frontend:
   - npm install
   - npm run dev
6. Öppna appen i webbläsaren (vanligtvis http://localhost:5173).

Alternativ: kör lokalt med Supabase-docker eller lokal Postgres
- Om du vill köra en lokal Supabase-stack: installera Supabase CLI och kör `supabase start` (se Supabase-dokumentation).
- Eller kör lokal Postgres via docker-compose (repo innehåller en `docker-compose.yml` med postgres och redis). Applicera migrationerna mot den lokala DB:n.

Säkerhet och produktion
- Byt seed-lösenord (migrationerna uppdaterar admin-lösenord i exempel).
- Undvik att lägga service_role-nycklar i klientkod eller publika repos.
- TLS/HTTPS och riktig secrets-hantering i produktionsmiljö rekommenderas.

Vanliga uppgifter
- Applicera migrationer: kör SQL-filerna i `supabase/migrations`.
- Hitta logik i frontend: sök efter `@supabase/supabase-js` för att se var anrop görs.
- Ta bort backend-kod permanent: `git rm -r backend && git commit -m "Remove backend (archived)"`.

Projektstruktur (viktigt)
- /src — frontend-kod (React, TanStack)
- /supabase/migrations — SQL-migrationer (tabeller, RLS, pgcrypto)
- /docker-compose.yml — lokala service-definitioner (postgres/redis). Backend-service är valfri/kan tas bort.
- /backend — (arkiverad/valfri) Nest/Prisma-projekt (om du tidigare använde eget backend)

Bidra
- Öppna issues eller skicka PR:ar. För större ändringar: skapa en branch, skriv kort beskrivning och skapa PR mot `main`.

Licens
- MIT (se repo-licensfil om finns)

Kontakt
- För frågor: öppna issue i repo:t eller kontakta projektägaren.
