// Router por hash + estado global (usuario, perfil, pollas, pool activo).
import { supabase, signOut, getOrCreateProfile } from './supabase.js';

const APP_NAME = 'Polla Mundialista';
const POOL_KEY = 'pm_active_pool';

// Estado global de la app.
const state = {
  user: null,
  profile: null,
  pools: [],      // pollas activas visibles
  memberOf: [],   // ids de pollas a las que pertenezco
  poolId: null,   // polla activa
};

// Definición de tabs. `auth` = requiere sesión. `admin` = requiere is_admin.
const TABS = [
  { hash: '#/pools', label: 'Pollas', view: () => import('./views/pools.js'), auth: true },
  { hash: '#/predicciones', label: 'Predicciones', view: () => import('./views/predictions.js'), auth: true },
  { hash: '#/tabla', label: 'Tabla', view: () => import('./views/standings.js'), auth: true },
  { hash: '#/llave', label: 'Llave', view: () => import('./views/bracket.js'), auth: true },
  { hash: '#/reglas', label: 'Reglas', view: () => import('./views/rules.js'), auth: false },
  { hash: '#/admin', label: 'Admin', view: () => import('./views/admin.js'), auth: true, admin: true },
];

const $app = document.getElementById('app');

function activePool() {
  return state.pools.find((p) => p.id === state.poolId) || null;
}

function setPool(id) {
  state.poolId = id;
  try { localStorage.setItem(POOL_KEY, id); } catch {}
  renderChrome();
  route();
}

// ctx que reciben todas las vistas (contrato compartido con admin.js).
function makeCtx() {
  return {
    supabase,
    user: state.user,
    profile: state.profile,
    pool: activePool(),
    pools: state.pools,
    setPool,
    refresh: route,
  };
}

// Carga pollas activas y membresías del usuario.
async function loadPools() {
  state.pools = [];
  state.memberOf = [];
  if (!state.user) return;
  try {
    const { data: pools, error } = await supabase
      .from('pools')
      .select('*')
      .eq('is_active', true)
      .order('is_default', { ascending: false })
      .order('name');
    if (error) throw error;
    state.pools = pools || [];

    const { data: members } = await supabase
      .from('pool_members')
      .select('pool_id')
      .eq('user_id', state.user.id);
    state.memberOf = (members || []).map((m) => m.pool_id);

    // Elegir pool activo: localStorage → default → primera.
    let saved = null;
    try { saved = localStorage.getItem(POOL_KEY); } catch {}
    const exists = (id) => state.pools.some((p) => p.id === id);
    if (saved && exists(saved)) {
      state.poolId = saved;
    } else {
      const def = state.pools.find((p) => p.is_default) || state.pools[0];
      state.poolId = def ? def.id : null;
    }
  } catch (e) {
    console.error('Error cargando pollas', e);
  }
}

// ---- Render del "chrome" (header + nav) ----
function renderChrome() {
  const logged = !!state.user;
  const isAdmin = !!state.profile?.is_admin;
  const currentHash = location.hash || (logged ? '#/pools' : '#/reglas');

  const tabs = TABS.filter((t) => {
    if (t.admin && !isAdmin) return false;
    if (t.auth && !logged) return false;
    return true;
  });

  const poolOptions = state.pools
    .map(
      (p) =>
        `<option value="${p.id}" ${p.id === state.poolId ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    )
    .join('');

  const selector =
    logged && state.pools.length
      ? `<label class="pool-select">
           <span class="pool-select__label">Polla</span>
           <select id="poolSelect">${poolOptions}</select>
         </label>`
      : '';

  const userBox = logged
    ? `<div class="userbox">
         <span class="userbox__name">${escapeHtml(state.profile?.display_name || 'Jugador')}</span>
         <button id="btnLogout" class="btn btn--ghost">Salir</button>
       </div>`
    : '';

  const nav = tabs
    .map(
      (t) =>
        `<a href="${t.hash}" class="nav__link ${t.hash === currentHash ? 'is-active' : ''}">${t.label}</a>`
    )
    .join('');

  $app.innerHTML = `
    <header class="header">
      <div class="header__top">
        <div class="brand"><span class="brand__ball">⚽</span> ${APP_NAME}</div>
        <div class="header__right">${selector}${userBox}</div>
      </div>
      <nav class="nav">${nav}</nav>
    </header>
    <main id="viewRoot" class="view"></main>
    <footer class="footer">Polla Mundialista · Mundial 2026 · Hecho con ⚽ y ganas</footer>
  `;

  const logout = document.getElementById('btnLogout');
  if (logout) logout.addEventListener('click', async () => { await signOut(); });

  const sel = document.getElementById('poolSelect');
  if (sel) sel.addEventListener('change', (e) => setPool(e.target.value));
}

// ---- Router ----
let routing = false;
async function route() {
  const logged = !!state.user;
  const isAdmin = !!state.profile?.is_admin;

  // No logueado: solo login y reglas.
  if (!logged) {
    const mod = await import('./views/login.js');
    renderChrome();
    const root = document.getElementById('viewRoot');
    const hash = location.hash;
    if (hash === '#/reglas') {
      const rules = await import('./views/rules.js');
      await rules.render(root, makeCtx());
    } else {
      await mod.render(root, makeCtx());
    }
    return;
  }

  let hash = location.hash;
  if (!hash || hash === '#/' || hash === '#') hash = '#/pools';

  let tab = TABS.find((t) => t.hash === hash);
  if (!tab || (tab.admin && !isAdmin)) {
    hash = '#/pools';
    tab = TABS.find((t) => t.hash === hash);
  }

  renderChrome();
  const root = document.getElementById('viewRoot');
  root.innerHTML = '<div class="loading">Cargando…</div>';
  try {
    const mod = await tab.view();
    await mod.render(root, makeCtx());
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="error">No se pudo cargar esta sección. Revisa tu conexión.<br><small>${escapeHtml(String(e.message || e))}</small></div>`;
  }
}

window.addEventListener('hashchange', () => { if (!routing) route(); });

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

// ---- Arranque + auth ----
async function boot(session) {
  routing = true;
  state.user = session?.user || null;
  state.profile = null;
  if (state.user) {
    try {
      state.profile = await getOrCreateProfile(state.user);
    } catch (e) {
      console.error('Error de perfil', e);
    }
    await loadPools();
  }
  routing = false;
  route();
}

let started = false;
supabase.auth.onAuthStateChange(async (_event, session) => {
  await boot(session);
  started = true;
});

// Fallback por si onAuthStateChange no dispara al inicio.
setTimeout(async () => {
  if (started) return;
  const { data } = await supabase.auth.getSession();
  boot(data.session);
}, 800);
