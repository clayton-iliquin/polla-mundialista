// Vista de predicciones del pool activo.
import { flagHtml } from '../flags.js';
export async function render(el, ctx) {
  const { supabase, user, pool } = ctx;

  if (!pool) {
    el.innerHTML = `<h1 class="section-title">Mis predicciones</h1><div class="empty">Selecciona una polla primero (pestaña Pollas).</div>`;
    return;
  }

  el.innerHTML = `<h1 class="section-title">Mis predicciones · ${esc(pool.name)}</h1><div id="predBody"><div class="loading">Cargando partidos…</div></div>`;
  const body = el.querySelector('#predBody');

  // ¿Soy miembro?
  let isMember = false;
  try {
    const { data } = await supabase
      .from('pool_members')
      .select('user_id')
      .eq('pool_id', pool.id)
      .eq('user_id', user.id)
      .maybeSingle();
    isMember = !!data;
  } catch {}

  if (!isMember) {
    body.innerHTML = `<div class="empty">No perteneces a esta polla. Ve a <a href="#/pools">Pollas</a> para unirte.</div>`;
    return;
  }

  // Partidos del pool (pool_matches → matches) ordenados por kickoff.
  let matches = [];
  try {
    const { data, error } = await supabase
      .from('pool_matches')
      .select('match:matches(*)')
      .eq('pool_id', pool.id);
    if (error) throw error;
    matches = (data || []).map((r) => r.match).filter(Boolean);
    matches.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  } catch (e) {
    body.innerHTML = `<div class="error">No se pudieron cargar los partidos. Revisa tu conexión.</div>`;
    return;
  }

  if (!matches.length) {
    body.innerHTML = `<div class="empty">Esta polla aún no tiene partidos asignados.</div>`;
    return;
  }

  // Mis predicciones.
  let preds = new Map();
  try {
    const { data } = await supabase
      .from('predictions')
      .select('*')
      .eq('pool_id', pool.id)
      .eq('user_id', user.id);
    (data || []).forEach((p) => preds.set(p.match_id, p));
  } catch {}

  const now = Date.now();
  const deadlinePassed = pool.deadline && new Date(pool.deadline).getTime() <= now;

  body.innerHTML = `
    ${deadlinePassed ? '<div class="notice">El cierre de la polla ya pasó. Las predicciones están bloqueadas.</div>' : ''}
    <div class="matches">
      ${matches.map((m) => matchCard(m, preds.get(m.id), deadlinePassed, now)).join('')}
    </div>
  `;

  wire(body, ctx);
}

function matchCard(m, pred, deadlinePassed, now) {
  const kickoff = new Date(m.kickoff).getTime();
  const started = kickoff <= now;
  const locked = deadlinePassed || started;
  const hasResult = m.result_home != null && m.result_away != null;

  const ph = pred?.pred_home ?? '';
  const pa = pred?.pred_away ?? '';
  const pw = pred?.pred_winner ?? '';

  const isDrawPred = ph !== '' && pa !== '' && Number(ph) === Number(pa);

  const pts = hasResult && pred ? pointsFor(pred, m) : null;

  const kickoffStr = new Date(m.kickoff).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

  return `
    <article class="match ${locked ? 'match--locked' : ''}" data-match="${m.id}"
             data-home="${esc(m.home_team)}" data-away="${esc(m.away_team)}">
      <div class="match__phase">${esc(m.phase || '')} · ${kickoffStr} ${started ? '· 🔒 iniciado' : ''}</div>
      <div class="match__row">
        <div class="team team--home">
          ${flagHtml(m.home_flag)}
          <span class="team__name">${esc(m.home_team)}</span>
        </div>
        <div class="score">
          <input type="number" min="0" max="99" class="score__in in-home" value="${ph}" ${locked ? 'disabled' : ''} inputmode="numeric" />
          <span class="score__sep">-</span>
          <input type="number" min="0" max="99" class="score__in in-away" value="${pa}" ${locked ? 'disabled' : ''} inputmode="numeric" />
        </div>
        <div class="team team--away">
          ${flagHtml(m.away_flag)}
          <span class="team__name">${esc(m.away_team)}</span>
        </div>
      </div>

      <div class="winner-sel ${isDrawPred ? '' : 'hidden'}">
        <label>Empate: ¿quién pasa?</label>
        <select class="in-winner" ${locked ? 'disabled' : ''}>
          <option value="">—</option>
          <option value="${esc(m.home_team)}" ${pw === m.home_team ? 'selected' : ''}>${esc(m.home_team)}</option>
          <option value="${esc(m.away_team)}" ${pw === m.away_team ? 'selected' : ''}>${esc(m.away_team)}</option>
        </select>
      </div>

      <div class="match__foot">
        ${
          hasResult
            ? `<span class="result">Resultado: ${m.result_home}-${m.result_away}${m.winner_team ? ' (pasa ' + esc(m.winner_team) + ')' : ''}</span>
               <span class="pts-earned pts--${pts}">${pts != null ? pts + ' pts' : ''}</span>`
            : locked
            ? '<span class="muted">Bloqueado</span>'
            : `<button class="btn btn--primary btn--sm save">Guardar</button><span class="save-msg"></span>`
        }
      </div>
    </article>`;
}

// Puntos (cliente): 3 exacto+ganador, 1 solo ganador.
function pointsFor(pred, m) {
  if (m.result_home == null || m.result_away == null) return null;
  if (pred.pred_home == null || pred.pred_away == null) return 0;

  const exact = Number(pred.pred_home) === m.result_home && Number(pred.pred_away) === m.result_away;

  const predWinner = winnerOf(Number(pred.pred_home), Number(pred.pred_away), pred.pred_winner);
  const realWinner = winnerOf(m.result_home, m.result_away, m.winner_team);

  if (exact && predWinner === realWinner) return 3;
  if (predWinner && realWinner && predWinner === realWinner) return 1;
  return 0;
}

// Ganador según marcador; si empate usa el campo tiebreak (pred_winner / winner_team).
function winnerOf(h, a, tiebreak) {
  if (h > a) return 'HOME';
  if (a > h) return 'AWAY';
  return tiebreak ? 'TIE:' + tiebreak : null;
}

function wire(body, ctx) {
  const { supabase, user, pool } = ctx;

  body.querySelectorAll('.match').forEach((card) => {
    const home = card.querySelector('.in-home');
    const away = card.querySelector('.in-away');
    const winnerWrap = card.querySelector('.winner-sel');

    function toggleWinner() {
      if (!home || !away || !winnerWrap) return;
      const h = home.value, a = away.value;
      const draw = h !== '' && a !== '' && Number(h) === Number(a);
      winnerWrap.classList.toggle('hidden', !draw);
    }
    if (home) home.addEventListener('input', toggleWinner);
    if (away) away.addEventListener('input', toggleWinner);

    const saveBtn = card.querySelector('.save');
    if (!saveBtn) return;
    saveBtn.addEventListener('click', async () => {
      const msg = card.querySelector('.save-msg');
      const h = home.value, a = away.value;
      if (h === '' || a === '') {
        msg.textContent = 'Completa el marcador'; msg.className = 'save-msg save-msg--err';
        return;
      }
      const draw = Number(h) === Number(a);
      const winner = draw ? card.querySelector('.in-winner').value : null;
      if (draw && !winner) {
        msg.textContent = 'Elige quién pasa'; msg.className = 'save-msg save-msg--err';
        return;
      }
      saveBtn.disabled = true;
      msg.textContent = 'Guardando…'; msg.className = 'save-msg';
      try {
        const { error } = await supabase.from('predictions').upsert(
          {
            user_id: user.id,
            pool_id: pool.id,
            match_id: card.dataset.match,
            pred_home: Number(h),
            pred_away: Number(a),
            pred_winner: winner,
          },
          { onConflict: 'user_id,pool_id,match_id' }
        );
        if (error) throw error;
        msg.textContent = '✓ Guardado'; msg.className = 'save-msg save-msg--ok';
      } catch (e) {
        msg.textContent = 'Error al guardar'; msg.className = 'save-msg save-msg--err';
      } finally {
        saveBtn.disabled = false;
      }
    });
  });
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
