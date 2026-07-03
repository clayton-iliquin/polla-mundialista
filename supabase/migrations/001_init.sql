-- ============================================================================
-- Polla Mundialista — Migración inicial
-- Tablas, función is_admin(), políticas RLS, vista standings, trigger de
-- creación de perfiles y activación de Realtime.
-- Corre limpio de una sola pasada en el editor SQL de Supabase.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Tabla profiles: 1:1 con auth.users. display_name para mostrar en tablas.
-- is_admin solo editable vía SQL/admin (protegido por RLS más abajo).
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  is_admin     boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla matches: catálogo GLOBAL de partidos del mundial. Solo admin escribe.
-- result_* y winner_team se llenan cuando el partido termina.
-- winner_team define al ganador para el punto simple (útil en empates a 90').
-- ----------------------------------------------------------------------------
create table if not exists public.matches (
  id          uuid primary key default gen_random_uuid(),
  phase       text not null,
  home_team   text not null,
  away_team   text not null,
  home_flag   text,
  away_flag   text,
  kickoff     timestamptz not null,
  result_home int,
  result_away int,
  winner_team text,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla pools: pollas por fase. "Vertix" es la default. Solo admin escribe.
-- ----------------------------------------------------------------------------
create table if not exists public.pools (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phase      text not null,
  deadline   timestamptz not null,
  is_active  boolean not null default true,
  is_default boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,  -- nullable (seed sin usuario)
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Tabla pool_matches: qué partidos juega cada polla (gestionado por admin).
-- PK compuesta. Cascade al borrar polla o partido.
-- ----------------------------------------------------------------------------
create table if not exists public.pool_matches (
  pool_id  uuid not null references public.pools(id) on delete cascade,
  match_id uuid not null references public.matches(id) on delete cascade,
  primary key (pool_id, match_id)
);

-- ----------------------------------------------------------------------------
-- Tabla pool_members: usuarios inscritos en cada polla. has_paid lo edita admin.
-- PK compuesta. Cascade al borrar polla o usuario.
-- ----------------------------------------------------------------------------
create table if not exists public.pool_members (
  pool_id   uuid not null references public.pools(id) on delete cascade,
  -- referencia a profiles (no auth.users) para permitir el join automático
  -- profiles(display_name) desde el cliente (PostgREST embed requiere FK directa)
  user_id   uuid not null references public.profiles(id) on delete cascade,
  has_paid  boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (pool_id, user_id)
);

-- ----------------------------------------------------------------------------
-- Tabla predictions: predicción de un usuario para un partido dentro de una polla.
-- pred_winner cubre empates predichos en eliminatorias. UNIQUE evita duplicados.
-- ----------------------------------------------------------------------------
create table if not exists public.predictions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  pool_id     uuid not null references public.pools(id) on delete cascade,
  match_id    uuid not null references public.matches(id) on delete cascade,
  pred_home   int not null,
  pred_away   int not null,
  pred_winner text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, pool_id, match_id)
);

-- ============================================================================
-- Función is_admin(): security definer + stable para usar en policies sin
-- recursión de RLS (lee profiles con privilegios del owner).
-- ============================================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select p.is_admin from public.profiles p where p.id = auth.uid()),
    false
  );
$$;

-- ============================================================================
-- Trigger: crear profiles automáticamente al registrarse un usuario.
-- display_name se toma de raw_user_meta_data->>'full_name'.
-- ============================================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- Habilitar RLS en todas las tablas.
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.matches      enable row level security;
alter table public.pools        enable row level security;
alter table public.pool_matches enable row level security;
alter table public.pool_members enable row level security;
alter table public.predictions  enable row level security;

-- ============================================================================
-- Políticas RLS: profiles
-- Todos los autenticados leen (para mostrar nombres). Cada uno edita el suyo.
-- No se permite cambiar is_admin desde el cliente (solo vía SQL/service role).
-- ============================================================================
create policy "profiles_select_all"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ============================================================================
-- Políticas RLS: matches
-- SELECT para autenticados; escritura solo admin.
-- ============================================================================
create policy "matches_select_auth"
  on public.matches for select
  to authenticated
  using (true);

create policy "matches_write_admin"
  on public.matches for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Políticas RLS: pools
-- SELECT para autenticados; escritura solo admin.
-- ============================================================================
create policy "pools_select_auth"
  on public.pools for select
  to authenticated
  using (true);

create policy "pools_write_admin"
  on public.pools for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Políticas RLS: pool_matches
-- SELECT para autenticados; escritura solo admin.
-- ============================================================================
create policy "pool_matches_select_auth"
  on public.pool_matches for select
  to authenticated
  using (true);

create policy "pool_matches_write_admin"
  on public.pool_matches for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ============================================================================
-- Políticas RLS: pool_members
-- SELECT para autenticados. El usuario se inserta a sí mismo (unirse).
-- has_paid solo lo edita admin. Borrado: el propio usuario o admin.
-- ============================================================================
create policy "pool_members_select_auth"
  on public.pool_members for select
  to authenticated
  using (true);

create policy "pool_members_insert_self"
  on public.pool_members for insert
  to authenticated
  with check (user_id = auth.uid());

-- Solo admin actualiza (has_paid). Los usuarios no editan su membresía.
create policy "pool_members_update_admin"
  on public.pool_members for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "pool_members_delete_self_or_admin"
  on public.pool_members for delete
  to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ============================================================================
-- Políticas RLS: predictions
-- SELECT: las propias siempre; ajenas solo si el kickoff del match ya pasó.
-- INSERT/UPDATE: solo propias, siendo miembro del pool, y con deadline del
-- pool y kickoff del match aún en el futuro (validado con WITH CHECK).
-- DELETE: solo las propias.
-- ============================================================================

-- SELECT: propias siempre; ajenas solo tras el kickoff.
create policy "predictions_select"
  on public.predictions for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and now() >= m.kickoff
    )
  );

-- INSERT: propia + miembro del pool + antes de deadline y kickoff.
create policy "predictions_insert"
  on public.predictions for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.pool_members pm
      where pm.pool_id = predictions.pool_id
        and pm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.pools p
      where p.id = predictions.pool_id
        and now() < p.deadline
    )
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and now() < m.kickoff
    )
  );

-- UPDATE: mismas validaciones en USING (fila existente) y WITH CHECK (fila nueva).
create policy "predictions_update"
  on public.predictions for update
  to authenticated
  using (
    user_id = auth.uid()
    and exists (
      select 1 from public.pool_members pm
      where pm.pool_id = predictions.pool_id
        and pm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.pools p
      where p.id = predictions.pool_id
        and now() < p.deadline
    )
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and now() < m.kickoff
    )
  )
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.pool_members pm
      where pm.pool_id = predictions.pool_id
        and pm.user_id = auth.uid()
    )
    and exists (
      select 1 from public.pools p
      where p.id = predictions.pool_id
        and now() < p.deadline
    )
    and exists (
      select 1 from public.matches m
      where m.id = predictions.match_id
        and now() < m.kickoff
    )
  );

-- DELETE: solo las propias.
create policy "predictions_delete_own"
  on public.predictions for delete
  to authenticated
  using (user_id = auth.uid());

-- ============================================================================
-- Vista standings: puntos por (pool_id, user_id).
-- Reglas: 3 pts si marcador exacto Y mismo ganador; 1 pt si solo acierta ganador.
-- El "ganador real" del partido = winner_team si está definido (p.ej. penales),
-- si no, se deriva del marcador (o 'DRAW' si empate y sin winner_team).
-- El "ganador predicho" = pred_winner si el usuario lo puso, si no se deriva
-- de pred_home/pred_away (o 'DRAW' si empate predicho).
-- Solo cuentan partidos con resultado cargado (result_home/away no nulos).
-- ============================================================================
create or replace view public.standings
with (security_invoker = true) as
with scored as (
  select
    pr.pool_id,
    pr.user_id,
    -- ganador real del partido
    case
      when m.winner_team is not null then m.winner_team
      when m.result_home > m.result_away then m.home_team
      when m.result_home < m.result_away then m.away_team
      else 'DRAW'
    end as real_winner,
    -- ganador predicho por el usuario
    case
      when pr.pred_winner is not null then pr.pred_winner
      when pr.pred_home > pr.pred_away then m.home_team
      when pr.pred_home < pr.pred_away then m.away_team
      else 'DRAW'
    end as pred_winner_calc,
    -- marcador exacto acertado
    (pr.pred_home = m.result_home and pr.pred_away = m.result_away) as exact_score
  from public.predictions pr
  join public.matches m
    on m.id = pr.match_id
   and m.result_home is not null
   and m.result_away is not null
),
points as (
  select
    pool_id,
    user_id,
    case
      -- 3 pts: marcador exacto y además mismo ganador
      when exact_score and real_winner = pred_winner_calc then 3
      -- 1 pt: solo acierta el ganador
      when real_winner = pred_winner_calc then 1
      else 0
    end as pts,
    (exact_score and real_winner = pred_winner_calc) as is_exact_hit
  from scored
)
select
  pt.pool_id,
  pt.user_id,
  pf.display_name,
  coalesce(sum(pt.pts), 0)::int as points,
  coalesce(sum(case when pt.is_exact_hit then 1 else 0 end), 0)::int as exact_hits,
  count(*)::int as predictions_count
from points pt
left join public.profiles pf on pf.id = pt.user_id
group by pt.pool_id, pt.user_id, pf.display_name;

-- ============================================================================
-- Realtime: publicar cambios de matches, predictions y pool_members.
-- ============================================================================
alter publication supabase_realtime add table public.matches;
alter publication supabase_realtime add table public.predictions;
alter publication supabase_realtime add table public.pool_members;
