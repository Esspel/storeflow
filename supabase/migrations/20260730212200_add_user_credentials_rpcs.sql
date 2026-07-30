-- Säkerställ att pgcrypto är aktiverat för crypt() och gen_salt()
create extension if not exists pgcrypto schema extensions;

create or replace function public.change_user_password(
  p_user_id uuid,
  p_new_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_is_admin boolean;
  v_hashed_pw text;
begin
  -- 1. Identifiera vem som anropar funktionen via Supabase auth context
  v_caller_id := auth.uid();
  
  if v_caller_id is null then
    raise exception 'Ej autentiserad användare.';
  end if;

  -- 2. Kontrollera om anroparen är admin
  select (role = 'admin') into v_is_admin
  from public.app_users
  where id = v_caller_id;

  -- 3. Säkerhetskontroll: Användaren får bara ändra sitt eget lösenord, om den inte är admin
  if v_caller_id != p_user_id and coalesce(v_is_admin, false) = false then
    raise exception 'Behörighet saknas för att ändra denna användares lösenord.';
  end if;

  -- 4. Validera lösenordskrav (t.ex. minst 12 tecken)
  if length(p_new_password) < 12 then
    raise exception 'Lösenordet måste vara minst 12 tecken långt.';
  end if;

  -- 5. Haspa lösenordet säkert på servern via pgcrypto (bcrypt)
  v_hashed_pw := crypt(p_new_password, gen_salt('bf', 10));

  -- 6. Uppdatera app_users
  update public.app_users
  set 
    password_hash = v_hashed_pw,
    must_change_password = false
  where id = p_user_id;

  return true;
end;
$$;

-- Ge exekveringsrättighet till autentiserade användare
revoke execute on function public.change_user_password(uuid, text) from public, anon;
grant execute on function public.change_user_password(uuid, text) to authenticated;

create or replace function public.update_user_credentials(
  p_user_id uuid,
  p_quick_pin text default null,
  p_barcode_id text default null,
  p_clear_pin boolean default false,
  p_clear_barcode boolean default false
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_caller_id uuid;
  v_is_admin boolean;
  v_pin_hash text := null;
begin
  v_caller_id := auth.uid();

  if v_caller_id is null then
    raise exception 'Ej autentiserad användare.';
  end if;

  select (role = 'admin') into v_is_admin
  from public.app_users
  where id = v_caller_id;

  if v_caller_id != p_user_id and coalesce(v_is_admin, false) = false then
    raise exception 'Behörighet saknas för att uppdatera dessa uppgifter.';
  end if;

  -- Beräkna PIN-hash om PIN skickats med
  if p_quick_pin is not null and length(p_quick_pin) > 0 then
    v_pin_hash := crypt(p_quick_pin, gen_salt('bf', 8));
  end if;

  -- Uppdatera app_users dynamiskt baserat på vad som skickats in
  update public.app_users
  set
    quick_pin_hash = case 
      when p_clear_pin then null 
      when v_pin_hash is not null then v_pin_hash 
      else quick_pin_hash 
    end,
    barcode_id = case 
      when p_clear_barcode then null 
      when p_barcode_id is not null then p_barcode_id 
      else barcode_id 
    end
  where id = p_user_id;

  return true;
end;
$$;

revoke execute on function public.update_user_credentials(uuid, text, text, boolean, boolean) from public, anon;
grant execute on function public.update_user_credentials(uuid, text, text, boolean, boolean) to authenticated;
