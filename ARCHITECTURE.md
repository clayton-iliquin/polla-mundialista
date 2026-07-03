# Polla Mundialista — Arquitectura

Web para jugar la "polla mundialista" (tradición peruana) por fases eliminatorias del Mundial 2026, empezando por octavos de final.

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla con ES modules. **Sin build step** (no hay Node en la máquina del dev). `@supabase/supabase-js` se importa desde CDN (`https://esm.sh/@supabase/supabase-js@2`).
- **Backend**: Supabase (Postgres + Auth con Google OAuth + Realtime + RLS).
- **Hosting**: GitHub Pages (deploy directo del directorio raíz vía GitHub Actions, sin build).
- Idioma de la UI: **español**.

## Reglas de puntaje

- Acertar al ganador del partido: **1 punto**.
- Acertar ganador Y marcador exacto: **3 puntos**.
- En eliminatorias, "ganador" = quién gana el partido; si hay empate en 90' se registra el marcador y el campo `winner_team` (definido por penales) determina al ganador para el punto simple.

## Modelo de datos (Postgres / Supabase)

```
profiles        (id uuid PK = auth.users.id, display_name text, is_admin bool default false)
matches         (id, phase text, home_team text, away_team text, home_flag text, away_flag text,
                 kickoff timestamptz, result_home int null, result_away int null,
                 winner_team text null)          -- catálogo GLOBAL de partidos, solo admin escribe
pools           (id, name text, phase text, deadline timestamptz, is_active bool,
                 is_default bool, created_by uuid)  -- "Vertix" es la default
pool_matches    (pool_id FK, match_id FK, PK compuesta)  -- qué partidos juega cada polla (admin)
pool_members    (pool_id FK, user_id FK, has_paid bool default false, joined_at, PK compuesta)
predictions     (user_id, pool_id, match_id, pred_home int, pred_away int,
                 pred_winner text null,  -- para empates predichos en eliminatorias
                 UNIQUE(user_id, pool_id, match_id))
```

**Vista `standings`**: puntos por (pool_id, user_id) calculados comparando predictions vs matches con resultado. 3 pts marcador exacto (y mismo ganador), 1 pt solo ganador. Incluye columnas: pool_id, user_id, display_name, points, exact_hits (para desempate), predictions_count.

## RLS

- `profiles`: cada usuario lee todos (para mostrar nombres), edita solo el suyo; `is_admin` solo editable vía SQL/admin.
- `matches`, `pools`, `pool_matches`: SELECT para autenticados; INSERT/UPDATE/DELETE solo si `profiles.is_admin`.
- `pool_members`: el usuario se inserta a sí mismo (unirse a una polla); `has_paid` solo lo edita admin; SELECT autenticados.
- `predictions`: el usuario hace CRUD solo de las suyas, solo si es miembro del pool, y solo si `now() < pools.deadline` y `now() < matches.kickoff`. SELECT de predicciones ajenas solo si `now() >= matches.kickoff` (antes del kickoff solo ves las tuyas).

Helper: función SQL `is_admin()` (security definer) para usar en policies sin recursión.

## Realtime

Suscripción a cambios en `matches` (resultados) y `predictions` → refrescar tabla de posiciones y bracket en vivo.

## Estructura de archivos

```
index.html                  -- SPA shell (una sola página, navegación por tabs/hash)
css/styles.css
js/config.js                -- SUPABASE_URL y SUPABASE_ANON_KEY (públicas, seguridad = RLS)
js/supabase.js              -- cliente + helpers auth
js/app.js                   -- router por hash, estado global (usuario, pool activo)
js/views/login.js
js/views/pools.js           -- lista de pollas, unirse, selector de polla activa (default: Vertix)
js/views/predictions.js     -- formulario de predicciones de los partidos del pool activo
js/views/standings.js       -- tabla de posiciones en tiempo real (desempate: exact_hits)
js/views/bracket.js         -- llave del mundial (partidos con resultados reales, por fase)
js/views/rules.js           -- reglas y costo (S/. 10.00)
js/views/admin.js           -- solo visible a admin: CRUD partidos/resultados, CRUD pollas,
                               asignar partidos a polla (checkboxes), miembros/pagos
supabase/migrations/001_init.sql   -- tablas, RLS, vista standings, función is_admin
supabase/seed.sql           -- polla "Vertix" (octavos) + 8 partidos de octavos placeholder
.github/workflows/deploy.yml       -- deploy a GitHub Pages (actions/deploy-pages, sin build)
README.md                   -- setup: crear proyecto Supabase, Google OAuth, correr migraciones,
                               configurar config.js, activar Pages, cómo hacerse admin
```

## Pantallas / flujo

1. **Login** con Google (Supabase OAuth; redirect a la URL de Pages).
2. **Pollas**: lista de pollas activas; "Vertix" destacada como default; botón unirse; selector de polla activa persistido en localStorage.
3. **Mis predicciones**: partidos del pool activo, inputs de marcador, editable hasta deadline/kickoff; muestra puntos obtenidos por partido cuando hay resultado.
4. **Tabla**: posiciones del pool activo, en vivo, indicador de pago.
5. **Llave**: bracket por fase con resultados reales.
6. **Admin**: gestión completa (ver arriba).

## Diseño visual

Tema oscuro tipo deportivo, acento verde/dorado, responsive mobile-first (la mayoría jugará desde el celular). Banderas con emoji.

## Reutilización por fases

Para cuartos/semis/final: el admin agrega los partidos al catálogo y crea una nueva polla seleccionando esos partidos. Cero cambios de código.
