# Polla Mundialista ⚽

Web para jugar la **polla mundialista** (tradición peruana) por fases eliminatorias del Mundial 2026, empezando por los octavos de final. Cada jugador predice los marcadores de los partidos de la fase y suma puntos según sus aciertos. El grupo comparte una "polla" (por ejemplo **Vertix**) y compite en una tabla de posiciones en vivo.

## Reglas de puntaje

- Acertar al **ganador** del partido: **1 punto**.
- Acertar ganador **y** marcador exacto: **3 puntos**.
- En eliminatorias "ganador" = quién gana el partido. Si hay empate en los 90', se registra el marcador y el campo `winner_team` (definido por penales) determina al ganador para el punto simple.
- **Desempate** en la tabla: mayor cantidad de marcadores exactos (`exact_hits`).
- Costo de participación: **S/ 10.00** por polla (informativo).

## Stack

- **Frontend**: HTML + CSS + JavaScript vanilla con ES modules. **Sin build step** (no requiere Node). `@supabase/supabase-js` se importa desde CDN.
- **Backend**: Supabase (Postgres + Auth con Google OAuth + Realtime + RLS).
- **Hosting**: GitHub Pages, desplegado directo del directorio raíz vía GitHub Actions (sin build).
- **Idioma**: español.

## Estructura

```
index.html                       SPA shell (navegación por tabs/hash)
css/styles.css
js/config.js                     SUPABASE_URL y SUPABASE_ANON_KEY (públicas; seguridad = RLS)
js/supabase.js                   cliente + helpers de auth
js/app.js                        router y estado global
js/views/*.js                    login, pools, predictions, standings, bracket, rules, admin
supabase/migrations/001_init.sql tablas, RLS, vista standings, función is_admin
supabase/seed.sql                polla "Vertix" (octavos) + 8 partidos placeholder
.github/workflows/deploy.yml     deploy a GitHub Pages
```

---

## Guía de configuración paso a paso

### 1. Crear el proyecto en Supabase

1. Entra a [supabase.com](https://supabase.com) e inicia sesión.
2. **New project** → elige nombre, contraseña de base de datos y región (la más cercana, ej. South America).
3. Espera a que el proyecto termine de aprovisionarse.

### 2. Correr las migraciones y el seed

1. En el panel de Supabase abre **SQL Editor**.
2. Abre `supabase/migrations/001_init.sql` de este repo, copia todo su contenido, pégalo en un nuevo query y ejecútalo (**Run**). Esto crea las tablas, políticas RLS, la vista `standings` y la función `is_admin()`.
3. Repite con `supabase/seed.sql` para cargar la polla **Vertix** (octavos) y 8 partidos placeholder.

### 3. Configurar Google OAuth

**En Google Cloud Console** ([console.cloud.google.com](https://console.cloud.google.com)):

1. Crea (o elige) un proyecto.
2. **APIs y servicios → Pantalla de consentimiento OAuth**: configúrala (tipo *External*), agrega tu correo como usuario de prueba si sigue en modo testing.
3. **APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth** → tipo **Aplicación web**.
4. En **URIs de redireccionamiento autorizados** agrega la *callback URL* de Supabase:
   `https://<TU-REF-PROYECTO>.supabase.co/auth/v1/callback`
   (la encuentras en Supabase → **Authentication → Providers → Google**).
5. Copia el **Client ID** y **Client Secret**.

**En Supabase → Authentication → Providers → Google**:

1. Activa Google y pega el **Client ID** y **Client Secret**. Guarda.

**En Supabase → Authentication → URL Configuration**:

1. **Site URL**: la URL de tu sitio en GitHub Pages, ej. `https://<usuario>.github.io/<repo>/`.
2. **Redirect URLs**: agrega la misma URL de Pages (y `http://localhost:8000/` si vas a probar en local).

### 4. Editar `js/config.js`

En Supabase → **Project Settings → API** copia la **Project URL** y la **anon public key**, y reemplaza los placeholders:

```js
export const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
export const SUPABASE_ANON_KEY = 'tu-anon-key';
```

Estas claves son públicas por diseño: la seguridad real vive en las políticas **RLS**.

### 5. Crear el repo, hacer push y activar Pages

1. Crea un repositorio en GitHub y sube el código:
   ```bash
   git init
   git add .
   git commit -m "Polla mundialista inicial"
   git branch -M main
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```
2. En el repo → **Settings → Pages → Build and deployment → Source**: elige **GitHub Actions**.
3. El workflow `.github/workflows/deploy.yml` se ejecuta en cada push a `main` y publica el sitio. Revisa la pestaña **Actions** para ver el progreso y la URL final.

### 6. Hacerte administrador

La primera vez inicia sesión con Google en el sitio para que se cree tu `profile`. Luego, en el **SQL Editor** de Supabase, ejecuta (reemplaza el UUID por el tuyo — lo ves en **Authentication → Users**):

```sql
update profiles set is_admin = true where id = '<uuid>';
```

Recarga la web y aparecerá la pestaña **Admin**.

### 7. Crear una nueva fase (ej. cuartos) reutilizando todo

No requiere cambios de código:

1. Entra a **Admin → Partidos** y agrega los partidos de la nueva fase (elige la fase *Cuartos*, equipos, banderas emoji y kickoff).
2. Ve a **Admin → Pollas** y crea una nueva polla (ej. "Vertix — Cuartos"), marca *Activa* y, si corresponde, *Predeterminada*.
3. En esa polla, botón **Partidos**, marca los checkboxes de los partidos de cuartos para asignarlos.
4. Los jugadores se unen a la nueva polla y predicen. Todo lo demás (tabla, bracket, puntaje) funciona igual.

---

## Probar localmente

Como no hay build step, basta con servir el directorio como archivos estáticos (los ES modules no cargan desde `file://`):

```bash
# Python 3
python -m http.server 8000

# o con Node, si lo tienes
npx serve .
```

Luego abre `http://localhost:8000/`. Recuerda agregar `http://localhost:8000/` en las **Redirect URLs** de Supabase para que el login con Google funcione en local.
