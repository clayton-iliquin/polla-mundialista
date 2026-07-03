# Polla Mundialista

Web para jugar la "polla mundialista" (pool de predicciones, tradición peruana) por fases eliminatorias del Mundial 2026. En producción y funcionando con la polla default **"Vertix"** (octavos de final, julio 2026).

- **Producción**: https://clayton-iliquin.github.io/polla-mundialista/
- **Repo**: https://github.com/clayton-iliquin/polla-mundialista
- **Diseño completo**: ver `ARCHITECTURE.md` (modelo de datos, RLS, pantallas, reglas de puntaje)

## Stack y restricciones

- **Frontend**: HTML + CSS + JavaScript vanilla con ES modules. **Sin build step y sin Node** — la máquina de desarrollo NO tiene Node/npm instalado. No introducir bundlers ni dependencias npm. `@supabase/supabase-js` se importa desde `https://esm.sh/@supabase/supabase-js@2`.
- **Backend**: Supabase (Postgres + Google OAuth + Realtime + RLS). Las claves en `js/config.js` son públicas por diseño; la seguridad vive en las políticas RLS.
- **Deploy**: push a `main` → GitHub Actions publica a Pages sin build (`.github/workflows/deploy.yml`). No hay entorno de staging.
- UI en **español**. Tema oscuro deportivo, mobile-first, acento verde/dorado.

## Convenciones clave

- **Contrato de vistas**: cada archivo en `js/views/` exporta `export async function render(el, ctx)` con `ctx = { supabase, user, profile, pool, pools, setPool, refresh }`. El router por hash vive en `js/app.js`; el tab Admin solo se muestra si `profile.is_admin`.
- **Banderas**: la BD guarda emojis, pero Windows no los renderiza — `js/flags.js` los convierte a imágenes de flagcdn.com (`flagHtml()`). Usar ese helper en toda vista que muestre banderas. Caso especial: Inglaterra → `gb-eng`.
- **Puntaje**: 1 pt acierta ganador, 3 pts ganador + marcador exacto. Se calcula en la vista SQL `standings` (nunca se persiste). En eliminatorias, empate en 90' + `winner_team` (penales) define al ganador; las predicciones de empate usan `pred_winner`.
- **Multi-polla**: `matches` es catálogo global; `pools` + `pool_matches` definen qué partidos juega cada polla; `predictions` es única por (user, pool, match). Para una nueva fase (cuartos, semis) NO se toca código: el admin crea los partidos y una nueva polla desde el panel Admin.
- La llave (`js/views/bracket.js`) genera rondas futuras como placeholders a partir de pares adyacentes ordenados por kickoff; los ganadores avanzan solos al ingresar resultados.

## Trampas conocidas (no repetir)

- **Deadlock de supabase-js**: NUNCA hacer `await` de queries dentro del callback de `onAuthStateChange` — la librería mantiene un lock de auth y las queries se cuelgan para siempre. Diferir con `setTimeout(0)` (ya implementado en `js/app.js`).
- **Joins automáticos (PostgREST)**: `select('..., profiles(display_name)')` requiere FK directa a `profiles`. Por eso `pool_members.user_id` y `predictions.user_id` referencian `public.profiles(id)`, no `auth.users`.
- Los SQL de `supabase/` se corren **a mano** en el SQL Editor de Supabase (no hay CLI configurada). Son idempotentes; mantenerlos así.

## Cómo probar localmente

```
python -m http.server 8765
```
y abrir http://localhost:8765. Para revisar vistas visualmente sin login, se puede crear una página temporal que importe la vista con un `ctx.supabase` falso (ver historial: `test-llave.html`, no commiteada) y capturar con Edge headless:
`msedge --headless=new --screenshot=out.png --window-size=1400,1700 <url>`.

## Estado actual (3 jul 2026)

- Polla "Vertix" activa con los 8 octavos reales cargados (`supabase/seed_octavos_real.sql`, ya ejecutado). Deadline: sáb 4 jul 12:00 (hora Perú).
- El cruce **Suiza vs Colombia es provisional** (dependía de Colombia vs Ghana en 32avos) — si cambia, el admin lo corrige desde el panel.
- Usuario admin: Clayton (`is_admin=true` vía SQL). El costo de entrada (S/. 10) se controla con `has_paid` en `pool_members`, marcado por el admin.
- Pendiente natural cuando avance el torneo: ingresar resultados de octavos desde Admin, luego crear partidos + polla de cuartos.
