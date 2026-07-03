// Llave del mundial: catálogo global de partidos agrupado por fase.
const PHASE_ORDER = ['Octavos', 'Cuartos', 'Semifinal', 'Tercer puesto', 'Final'];

export async function render(el, ctx) {
  const { supabase } = ctx;
  el.innerHTML = `<h1 class="section-title">Llave del Mundial</h1><div id="brk"><div class="loading">Cargando…</div></div>`;
  const box = el.querySelector('#brk');

  let matches = [];
  try {
    const { data, error } = await supabase
      .from('matches')
      .select('*')
      .order('kickoff', { ascending: true });
    if (error) throw error;
    matches = data || [];
  } catch (e) {
    box.innerHTML = `<div class="error">No se pudo cargar la llave. Revisa tu conexión.</div>`;
    return;
  }

  if (!matches.length) {
    box.innerHTML = `<div class="empty">Aún no hay partidos en el catálogo.</div>`;
    return;
  }

  // Agrupar por fase.
  const groups = {};
  matches.forEach((m) => {
    const ph = m.phase || 'Otros';
    (groups[ph] ||= []).push(m);
  });

  const phases = Object.keys(groups).sort((a, b) => {
    const ia = PHASE_ORDER.indexOf(a), ib = PHASE_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });

  box.innerHTML = phases
    .map(
      (ph) => `
      <section class="phase">
        <h2 class="phase__title">${esc(ph)}</h2>
        <div class="bracket">
          ${groups[ph].map(brkCard).join('')}
        </div>
      </section>`
    )
    .join('');
}

function brkCard(m) {
  const has = m.result_home != null && m.result_away != null;
  const homeWin = has && (m.winner_team ? m.winner_team === m.home_team : m.result_home > m.result_away);
  const awayWin = has && (m.winner_team ? m.winner_team === m.away_team : m.result_away > m.result_home);
  const kickoff = new Date(m.kickoff).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });

  return `
    <article class="brk-card">
      <div class="brk-card__date">${kickoff}</div>
      <div class="brk-row ${homeWin ? 'is-winner' : ''}">
        <span class="flag">${m.home_flag || '🏳️'}</span>
        <span class="brk-team">${esc(m.home_team)}</span>
        <span class="brk-score">${has ? m.result_home : '·'}</span>
      </div>
      <div class="brk-row ${awayWin ? 'is-winner' : ''}">
        <span class="flag">${m.away_flag || '🏳️'}</span>
        <span class="brk-team">${esc(m.away_team)}</span>
        <span class="brk-score">${has ? m.result_away : '·'}</span>
      </div>
      ${m.winner_team && has && m.result_home === m.result_away ? `<div class="brk-pen">Pasa por penales: ${esc(m.winner_team)}</div>` : ''}
    </article>`;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
