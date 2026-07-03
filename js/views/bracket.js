// Llave del mundial: bracket horizontal por rondas (estilo Google).
// Las rondas sin partidos en el catálogo se generan como placeholders
import { flagHtml } from '../flags.js';
// a partir de los ganadores de la ronda anterior (pares adyacentes por kickoff).
const ROUNDS = [
  { key: 'octavos', label: 'Octavos', size: 8 },
  { key: 'cuartos', label: 'Cuartos', size: 4 },
  { key: 'semifinal', label: 'Semifinales', size: 2 },
  { key: 'final', label: 'Final', size: 1 },
];
const EXTRA_PHASES = ['tercer puesto'];

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

  const byPhase = (key) =>
    matches.filter((m) => (m.phase || '').toLowerCase() === key);

  // Construir columnas hasta la Final. Cada ronda usa partidos reales si
  // existen; si no, se generan cruces "por definir" a partir de la ronda
  // anterior (pares adyacentes) — aunque esa ronda también sea placeholder,
  // para que el bracket siempre se dibuje completo.
  // Entrada = partido real (con .id) o placeholder {sides: [ladoA, ladoB]}.
  const columns = [];
  let prev = null;
  for (const r of ROUNDS) {
    const real = byPhase(r.key);
    let entries;
    if (real.length) {
      entries = real;
    } else if (prev && prev.length > 1) {
      entries = [];
      for (let i = 0; i < prev.length; i += 2) {
        entries.push({ sides: [sideFrom(prev[i]), sideFrom(prev[i + 1])] });
      }
    } else {
      entries = [];
    }
    if (entries.length) {
      columns.push({
        label: r.label,
        cards: entries.map((e) => (e.sides ? placeholderCard(e.sides) : realCard(e))),
      });
    }
    prev = entries;
  }

  const extras = matches.filter((m) =>
    EXTRA_PHASES.includes((m.phase || '').toLowerCase())
  );
  const others = matches.filter((m) => {
    const ph = (m.phase || '').toLowerCase();
    return !ROUNDS.some((r) => r.key === ph) && !EXTRA_PHASES.includes(ph);
  });

  box.innerHTML = `
    <div class="brk-scroll">
      <div class="brk-grid" style="--cols:${columns.length}">
        ${columns
          .map(
            (c, ci) => `
          <div class="brk-col ${ci > 0 ? 'brk-col--joined' : ''}">
            <div class="brk-col__title">${esc(c.label)}</div>
            <div class="brk-col__cards">
              ${c.cards.map((html) => `<div class="brk-slot">${html}</div>`).join('')}
            </div>
          </div>`
          )
          .join('')}
      </div>
    </div>
    ${extras.length ? `<section class="phase"><h2 class="phase__title">Tercer puesto</h2><div class="bracket">${extras.map(realCard).join('')}</div></section>` : ''}
    ${others.length ? `<section class="phase"><h2 class="phase__title">Otros partidos</h2><div class="bracket">${others.map(realCard).join('')}</div></section>` : ''}
  `;
}

function winnerOf(m) {
  const has = m.result_home != null && m.result_away != null;
  if (!has) return null;
  if (m.winner_team) return m.winner_team;
  if (m.result_home > m.result_away) return m.home_team;
  if (m.result_away > m.result_home) return m.away_team;
  return null;
}

function realCard(m) {
  const has = m.result_home != null && m.result_away != null;
  const win = winnerOf(m);
  const kickoff = new Date(m.kickoff).toLocaleString('es-PE', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
  const row = (team, flag, score, isWin) => `
    <div class="brk-row ${isWin ? 'is-winner' : ''}">
      ${flagHtml(flag, 'flag flag--sm')}
      <span class="brk-team">${esc(team)}</span>
      <span class="brk-score">${has ? score : ''}</span>
    </div>`;
  return `
    <article class="brk-card">
      <div class="brk-card__date">${kickoff}</div>
      ${row(m.home_team, m.home_flag, m.result_home, win === m.home_team)}
      ${row(m.away_team, m.away_flag, m.result_away, win === m.away_team)}
      ${m.winner_team && has && m.result_home === m.result_away ? `<div class="brk-pen">Penales: pasa ${esc(m.winner_team)}</div>` : ''}
    </article>`;
}

// Lado de un cruce futuro a partir de una entrada de la ronda anterior:
// ganador conocido → nombre y bandera; partido real sin resultado →
// "Ganador A/B"; placeholder → "Por definir".
function sideFrom(entry) {
  if (!entry) return { name: 'Por definir', flag: '⏳', known: false };
  if (entry.sides) return { name: 'Por definir', flag: '⏳', known: false };
  const w = winnerOf(entry);
  if (w) {
    return {
      name: w,
      flag: w === entry.home_team ? entry.home_flag : entry.away_flag,
      known: true,
    };
  }
  return {
    name: `Ganador ${shortName(entry.home_team)}/${shortName(entry.away_team)}`,
    flag: '⏳',
    known: false,
  };
}

function placeholderCard(sides) {
  const row = (s) => `
    <div class="brk-row ${s.known ? '' : 'is-tbd'}">
      ${flagHtml(s.flag, 'flag flag--sm')}
      <span class="brk-team">${esc(s.name)}</span>
      <span class="brk-score"></span>
    </div>`;
  return `
    <article class="brk-card brk-card--tbd">
      <div class="brk-card__date">Por definir</div>
      ${row(sides[0])}
      ${row(sides[1])}
    </article>`;
}

function shortName(name) {
  const n = String(name || '');
  return n.length > 10 ? n.slice(0, 9) + '…' : n;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
