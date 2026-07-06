-- ============================================================================
-- Polla Mundialista — Avatares de perfil (fotos de Google OAuth)
-- Agrega profiles.avatar_url, la captura en el trigger de nuevos usuarios y
-- hace backfill de los usuarios existentes desde auth.users.
-- Idempotente: corre limpio cuantas veces sea necesario en el SQL Editor.
-- ============================================================================

-- 1) Columna para la URL de la foto.
alter table public.profiles add column if not exists avatar_url text;

-- 2) Trigger: al registrarse un usuario, guardar también su foto.
--    Google puebla raw_user_meta_data con 'avatar_url' (y a veces 'picture').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3) Backfill: llenar la foto de los usuarios que ya existían.
update public.profiles p
set avatar_url = coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture')
from auth.users u
where u.id = p.id
  and coalesce(p.avatar_url, '') = ''
  and coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture') is not null;
