// Tabla de posiciones del pool activo, en vivo.
// Cada fila se expande para ver el detalle de predicciones del jugador
// (la RLS solo expone predicciones ajenas de partidos ya iniciados).
import { flagHtml } from '../flags.js';

let channel = null;

export async function render(el, ctx) {
  const { supabase, pool } = ctx;

  if (!pool) {
    el.innerHTML = `<h1 class="section-title">Tabla</h1><div class="empty">Selecciona una polla primero.</div>`;
    return;
  }

  el.innerHTML = `<h1 class="section-title">Tabla · ${esc(pool.name)}</h1>
    <div class="live-badge">● En vivo</div>
    <div id="tblBody"><div class="loading">Cargando…</div></div>`;
  const bodyEl = el.querySelector('#tblBody');

  await load(bodyEl, ctx);

  // Realtime: refrescar al cambiar matches o predictions.
  cleanup(supabase);
  channel = supabase
    .channel('standings-live-' + pool.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, () => {
      if (location.hash === '#/tabla') load(bodyEl, ctx);
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, () => {
      if (location.hash === '#/tabla') load(bodyEl, ctx);
    })
    .subscribe();

  // Limpiar al salir de la vista.
  window.addEventListener('hashchange', () => cleanup(supabase), { once: true });
}

function cleanup(supabase) {
  if (channel) {
    try { supabase.removeChannel(channel); } catch {}
    channel = null;
  }
}

async function load(bodyEl, ctx) {
  const { supabase, pool, user } = ctx;
  try {
    const { data: rows, error } = await supabase
      .from('standings')
      .select('*')
      .eq('pool_id', pool.id)
      .order('points', { ascending: false })
      .order('exact_hits', { ascending: false });
    if (error) throw error;

    // Pagos (join manual con pool_members).
    const { data: members } = await supabase
      .from('pool_members')
      .select('user_id, has_paid')
      .eq('pool_id', pool.id);
    const paid = new Map((members || []).map((m) => [m.user_id, m.has_paid]));

    // Fotos de perfil (de Google OAuth). Query aparte y no-fatal: si la columna
    // aún no existe en la BD, la tabla igual carga con iniciales de fallback.
    const ids = rows.map((r) => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('id, avatar_url').in('id', ids);
    const avatar = new Map((profs || []).map((p) => [p.id, p.avatar_url]));

    if (!rows || !rows.length) {
      bodyEl.innerHTML = `<div class="empty">Aún no hay posiciones. Se calculan cuando haya predicciones y resultados.</div>`;
      return;
    }

    bodyEl.innerHTML = `
      <table class="standings">
        <thead>
          <tr><th>#</th><th>Jugador</th><th class="num">Pts</th><th class="num">Exactos</th><th>Pago</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r, i) => `
            <tr class="standings__row ${r.user_id === user.id ? 'is-me' : ''}" data-user="${r.user_id}" title="Ver detalle">
              <td class="pos">${medal(i)}</td>
              <td class="pname">${avatarHtml(avatar.get(r.user_id), r.display_name)}<span class="pname__name">${esc(r.display_name)}${r.user_id === user.id ? ' <span class="you">(tú)</span>' : ''}</span> <span class="chev">▸</span></td>
              <td class="num strong">${r.points ?? 0}</td>
              <td class="num">${r.exact_hits ?? 0}</td>
              <td class="paid">${paid.get(r.user_id) ? '✓' : '—'}</td>
            </tr>
            <tr class="standings__detail hidden" data-detail="${r.user_id}">
              <td colspan="5"><div class="detail-box"></div></td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;

    wireDetails(bodyEl, ctx);
  } catch (e) {
    bodyEl.innerHTML = `<div class="error">No se pudo cargar la tabla. Revisa tu conexión.</div>`;
  }
}

function wireDetails(bodyEl, ctx) {
  bodyEl.querySelectorAll('.standings__row').forEach((row) => {
    row.style.cursor = 'pointer';
    row.addEventListener('click', async () => {
      const userId = row.dataset.user;
      const detailRow = bodyEl.querySelector(`[data-detail="${userId}"]`);
      if (!detailRow) return;
      const chev = row.querySelector('.chev');

      const isOpen = !detailRow.classList.contains('hidden');
      if (isOpen) {
        detailRow.classList.add('hidden');
        if (chev) chev.textContent = '▸';
        return;
      }
      detailRow.classList.remove('hidden');
      if (chev) chev.textContent = '▾';

      const box = detailRow.querySelector('.detail-box');
      if (box.dataset.loaded) return; // ya cargado en esta vista
      box.innerHTML = `<div class="loading">Cargando detalle…</div>`;
      try {
        box.innerHTML = await detailHtml(ctx, userId);
        box.dataset.loaded = '1';
      } catch {
        box.innerHTML = `<div class="error">No se pudo cargar el detalle.</div>`;
      }
    });
  });
}

async function detailHtml(ctx, userId) {
  const { supabase, pool, user } = ctx;

  const [pmRes, predRes] = await Promise.all([
    supabase.from('pool_matches').select('match:matches(*)').eq('pool_id', pool.id),
    supabase
      .from('predictions')
      .select('*')
      .eq('pool_id', pool.id)
      .eq('user_id', userId),
  ]);
  if (pmRes.error) throw pmRes.error;
  if (predRes.error) throw predRes.error;

  const matches = (pmRes.data || []).map((r) => r.match).filter(Boolean);
  matches.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  const preds = new Map((predRes.data || []).map((p) => [p.match_id, p]));

  const now = Date.now();
  const isOwn = userId === user.id;

  const rows = matches
    .map((m) => {
      const started = new Date(m.kickoff).getTime() <= now;
      const pred = preds.get(m.id);
      const hasResult = m.result_home != null && m.result_away != null;

      // La RLS oculta predicciones ajenas hasta el kickoff; lo explicamos en la UI.
      let predCell;
      if (!isOwn && !started) {
        predCell = '<span class="muted">🔒 oculta hasta el inicio</span>';
      } else if (!pred) {
        predCell = '<span class="muted">sin predicción</span>';
      } else {
        predCell = `${pred.pred_home} - ${pred.pred_away}${
          pred.pred_winner ? ` <span class="muted">(pasa ${esc(pred.pred_winner)})</span>` : ''
        }`;
      }

      const resultCell = hasResult
        ? `${m.result_home} - ${m.result_away}${
            m.winner_team ? ` <span class="muted">(pasó ${esc(m.winner_team)})</span>` : ''
          }`
        : '<span class="muted">—</span>';

      const pts = hasResult && pred ? pointsFor(pred, m) : null;
      const ptsCell = pts != null ? `<span class="pts-earned pts--${pts}">${pts} pts</span>` : '—';

      return `
        <tr>
          <td>${flagHtml(m.home_flag)} ${esc(m.home_team)} vs ${esc(m.away_team)} ${flagHtml(m.away_flag)}</td>
          <td class="num">${predCell}</td>
          <td class="num">${resultCell}</td>
          <td class="num">${ptsCell}</td>
        </tr>`;
    })
    .join('');

  return `
    <table class="standings standings--detail">
      <thead>
        <tr><th>Partido</th><th class="num">Predicción</th><th class="num">Resultado</th><th class="num">Pts</th></tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="4" class="muted">Sin partidos.</td></tr>'}</tbody>
    </table>`;
}

// Puntos (cliente): 3 exacto+ganador, 1 solo ganador.
// DEBE reflejar exactamente la vista SQL `standings`: el ganador se compara
// por NOMBRE de equipo (winner_team/pred_winner si existen, si no se deriva del
// marcador, 'DRAW' si empate sin ganador definido). Comparar por HOME/AWAY
// rompía las predicciones de empate con equipo que pasa (p.ej. "1-1 pasa X").
function pointsFor(pred, m) {
  if (m.result_home == null || m.result_away == null) return null;
  if (pred.pred_home == null || pred.pred_away == null) return 0;

  const exact = Number(pred.pred_home) === m.result_home && Number(pred.pred_away) === m.result_away;

  const realWinner = winnerName(m.result_home, m.result_away, m.winner_team, m);
  const predWinner = winnerName(Number(pred.pred_home), Number(pred.pred_away), pred.pred_winner, m);

  if (exact && realWinner === predWinner) return 3;
  if (realWinner === predWinner) return 1;
  return 0;
}

// Ganador por nombre de equipo (misma lógica que la vista SQL standings).
function winnerName(h, a, explicit, m) {
  if (explicit) return explicit;
  if (h > a) return m.home_team;
  if (a > h) return m.away_team;
  return 'DRAW';
}

function medal(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
}

// Foto de perfil: las iniciales son el fallback (van como contenido del span) y
// la <img> las cubre por encima. Si la imagen falla al cargar se elimina y
// quedan las iniciales. referrerpolicy=no-referrer evita bloqueos de Google.
function avatarHtml(url, name) {
  const img = url
    ? `<img src="${esc(url)}" alt="" referrerpolicy="no-referrer" loading="lazy" onerror="this.remove()">`
    : '';
  return `<span class="avatar" aria-hidden="true">${esc(initials(name))}${img}</span>`;
}

function initials(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
