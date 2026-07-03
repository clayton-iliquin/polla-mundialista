// Vista de administración: gestión de partidos, pollas y miembros.
// Solo se monta si profile.is_admin (el shell ya lo filtra, pero verificamos igual).
// Contrato: export async function render(el, ctx)
//   ctx = { supabase, user, profile, pool, pools, setPool, refresh }

const FASES = ['Octavos', 'Cuartos', 'Semifinal', 'Tercer puesto', 'Final'];

// Escapa texto para insertarlo en HTML sin riesgo de inyección.
function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Convierte timestamptz de Supabase a valor para <input type="datetime-local">.
function toLocalInput(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (isNaN(d)) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

// Convierte el valor de datetime-local a ISO (con zona local) para Postgres.
function fromLocalInput(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d)) return null;
  return d.toISOString();
}

function fmtKickoff(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export async function render(el, ctx) {
  const { supabase, profile } = ctx;

  if (!profile?.is_admin) {
    el.innerHTML = `<div class="card"><p>No tienes permisos de administrador.</p></div>`;
    return;
  }

  el.innerHTML = `
    <div class="admin-view">
      <div class="tabs" id="admin-tabs">
        <button class="btn tab active" data-tab="partidos">Partidos</button>
        <button class="btn tab" data-tab="pollas">Pollas</button>
        <button class="btn tab" data-tab="miembros">Miembros</button>
      </div>
      <div id="admin-msg"></div>
      <div id="admin-panel"></div>
    </div>
  `;

  const tabsEl = el.querySelector('#admin-tabs');
  const panel = el.querySelector('#admin-panel');
  const msgEl = el.querySelector('#admin-msg');

  function showMsg(text, kind = 'error') {
    if (!text) {
      msgEl.innerHTML = '';
      return;
    }
    msgEl.innerHTML = `<div class="alert alert-${kind}">${esc(text)}</div>`;
  }

  function handleError(e, contexto) {
    console.error(contexto, e);
    showMsg(`${contexto}: ${e?.message || e}`);
  }

  tabsEl.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.tab');
    if (!btn) return;
    tabsEl.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    showMsg('');
    renderTab(btn.dataset.tab);
  });

  function renderTab(tab) {
    if (tab === 'partidos') renderPartidos();
    else if (tab === 'pollas') renderPollas();
    else if (tab === 'miembros') renderMiembros();
  }

  // ------------------------------------------------------------------
  // SECCIÓN 1: PARTIDOS (catálogo global `matches`)
  // ------------------------------------------------------------------
  async function renderPartidos() {
    panel.innerHTML = `<div class="card"><p>Cargando partidos…</p></div>`;
    let matches = [];
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*')
        .order('kickoff', { ascending: true });
      if (error) throw error;
      matches = data || [];
    } catch (e) {
      handleError(e, 'Error al cargar partidos');
      panel.innerHTML = '';
      return;
    }

    const rows = matches
      .map((m) => {
        const marcador =
          m.result_home != null && m.result_away != null
            ? `${m.result_home} - ${m.result_away}${
                m.winner_team ? ` (gana ${esc(m.winner_team)})` : ''
              }`
            : '<span class="muted">sin resultado</span>';
        return `
          <tr>
            <td>${esc(m.phase)}</td>
            <td>${esc(m.home_flag || '')} ${esc(m.home_team)} vs ${esc(
          m.away_team
        )} ${esc(m.away_flag || '')}</td>
            <td>${fmtKickoff(m.kickoff)}</td>
            <td>${marcador}</td>
            <td class="actions">
              <button class="btn btn-sm" data-edit="${m.id}">Editar</button>
              <button class="btn btn-sm" data-result="${m.id}">Resultado</button>
              <button class="btn btn-sm btn-danger" data-del="${m.id}">Eliminar</button>
            </td>
          </tr>`;
      })
      .join('');

    panel.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Partidos del catálogo</h3>
          <button class="btn btn-primary" id="new-match">+ Nuevo partido</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Fase</th><th>Partido</th><th>Inicio</th><th>Resultado</th><th></th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">No hay partidos.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div id="match-form"></div>
    `;

    panel.querySelector('#new-match').onclick = () => matchForm(null, matches);
    panel.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () =>
        matchForm(
          matches.find((m) => String(m.id) === b.dataset.edit),
          matches
        );
    });
    panel.querySelectorAll('[data-result]').forEach((b) => {
      b.onclick = () =>
        resultForm(matches.find((m) => String(m.id) === b.dataset.result));
    });
    panel.querySelectorAll('[data-del]').forEach((b) => {
      b.onclick = () => deleteMatch(b.dataset.del);
    });
  }

  function matchForm(match, allMatches) {
    const isEdit = !!match;
    const m = match || {};
    const formEl = panel.querySelector('#match-form');
    formEl.innerHTML = `
      <div class="card">
        <h3>${isEdit ? 'Editar partido' : 'Nuevo partido'}</h3>
        <div class="form-grid">
          <label>Fase
            <select class="input" id="f-phase">
              ${FASES.map(
                (f) =>
                  `<option value="${esc(f)}" ${
                    m.phase === f ? 'selected' : ''
                  }>${esc(f)}</option>`
              ).join('')}
            </select>
          </label>
          <label>Inicio (kickoff)
            <input class="input" type="datetime-local" id="f-kickoff" value="${toLocalInput(
              m.kickoff
            )}">
          </label>
          <label>Equipo local
            <input class="input" id="f-home" value="${esc(m.home_team || '')}">
          </label>
          <label>Bandera local (emoji)
            <input class="input" id="f-homeflag" value="${esc(
              m.home_flag || ''
            )}" placeholder="🇵🇪">
          </label>
          <label>Equipo visitante
            <input class="input" id="f-away" value="${esc(m.away_team || '')}">
          </label>
          <label>Bandera visitante (emoji)
            <input class="input" id="f-awayflag" value="${esc(
              m.away_flag || ''
            )}" placeholder="🇧🇷">
          </label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-match">Guardar</button>
          <button class="btn" id="cancel-match">Cancelar</button>
        </div>
      </div>
    `;

    formEl.querySelector('#cancel-match').onclick = () => (formEl.innerHTML = '');
    formEl.querySelector('#save-match').onclick = async () => {
      const payload = {
        phase: formEl.querySelector('#f-phase').value,
        home_team: formEl.querySelector('#f-home').value.trim(),
        away_team: formEl.querySelector('#f-away').value.trim(),
        home_flag: formEl.querySelector('#f-homeflag').value.trim() || null,
        away_flag: formEl.querySelector('#f-awayflag').value.trim() || null,
        kickoff: fromLocalInput(formEl.querySelector('#f-kickoff').value),
      };
      if (!payload.home_team || !payload.away_team) {
        showMsg('Debes ingresar ambos equipos.');
        return;
      }
      try {
        if (isEdit) {
          const { error } = await supabase
            .from('matches')
            .update(payload)
            .eq('id', m.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('matches').insert(payload);
          if (error) throw error;
        }
        showMsg('Partido guardado.', 'ok');
        renderPartidos();
      } catch (e) {
        handleError(e, 'Error al guardar partido');
      }
    };
  }

  function resultForm(m) {
    if (!m) return;
    const formEl = panel.querySelector('#match-form');
    const renderWinner = (home, away, show) =>
      show
        ? `<label>Ganador (por penales)
             <select class="input" id="f-winner">
               <option value="">— elegir —</option>
               <option value="${esc(home)}" ${
            m.winner_team === home ? 'selected' : ''
          }>${esc(home)}</option>
               <option value="${esc(away)}" ${
            m.winner_team === away ? 'selected' : ''
          }>${esc(away)}</option>
             </select>
           </label>`
        : '';

    formEl.innerHTML = `
      <div class="card">
        <h3>Resultado: ${esc(m.home_team)} vs ${esc(m.away_team)}</h3>
        <div class="form-grid">
          <label>${esc(m.home_team)}
            <input class="input" type="number" min="0" id="r-home" value="${
              m.result_home ?? ''
            }">
          </label>
          <label>${esc(m.away_team)}
            <input class="input" type="number" min="0" id="r-away" value="${
              m.result_away ?? ''
            }">
          </label>
        </div>
        <div id="winner-wrap">${renderWinner(
          m.home_team,
          m.away_team,
          m.result_home != null &&
            m.result_away != null &&
            m.result_home === m.result_away
        )}</div>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-result">Guardar resultado</button>
          <button class="btn" id="cancel-result">Cancelar</button>
        </div>
      </div>
    `;

    const homeIn = formEl.querySelector('#r-home');
    const awayIn = formEl.querySelector('#r-away');
    const winnerWrap = formEl.querySelector('#winner-wrap');
    const refreshWinner = () => {
      const h = homeIn.value === '' ? null : Number(homeIn.value);
      const a = awayIn.value === '' ? null : Number(awayIn.value);
      winnerWrap.innerHTML = renderWinner(
        m.home_team,
        m.away_team,
        h != null && a != null && h === a
      );
    };
    homeIn.oninput = refreshWinner;
    awayIn.oninput = refreshWinner;

    formEl.querySelector('#cancel-result').onclick = () =>
      (formEl.innerHTML = '');
    formEl.querySelector('#save-result').onclick = async () => {
      const h = homeIn.value === '' ? null : Number(homeIn.value);
      const a = awayIn.value === '' ? null : Number(awayIn.value);
      if (h == null || a == null) {
        showMsg('Ingresa ambos marcadores.');
        return;
      }
      let winner_team = null;
      if (h === a) {
        const sel = formEl.querySelector('#f-winner');
        winner_team = sel ? sel.value || null : null;
        if (!winner_team) {
          showMsg('En caso de empate debes elegir el ganador (penales).');
          return;
        }
      }
      try {
        const { error } = await supabase
          .from('matches')
          .update({ result_home: h, result_away: a, winner_team })
          .eq('id', m.id);
        if (error) throw error;
        showMsg('Resultado guardado.', 'ok');
        renderPartidos();
      } catch (e) {
        handleError(e, 'Error al guardar resultado');
      }
    };
  }

  async function deleteMatch(id) {
    if (!confirm('¿Eliminar este partido? Esta acción no se puede deshacer.'))
      return;
    try {
      const { error } = await supabase.from('matches').delete().eq('id', id);
      if (error) throw error;
      showMsg('Partido eliminado.', 'ok');
      renderPartidos();
    } catch (e) {
      handleError(e, 'Error al eliminar partido');
    }
  }

  // ------------------------------------------------------------------
  // SECCIÓN 2: POLLAS (`pools` + asignación de partidos en `pool_matches`)
  // ------------------------------------------------------------------
  async function renderPollas() {
    panel.innerHTML = `<div class="card"><p>Cargando pollas…</p></div>`;
    let pools = [];
    try {
      const { data, error } = await supabase
        .from('pools')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      pools = data || [];
    } catch (e) {
      handleError(e, 'Error al cargar pollas');
      panel.innerHTML = '';
      return;
    }

    const rows = pools
      .map(
        (p) => `
        <tr>
          <td>${esc(p.name)} ${p.is_default ? '⭐' : ''}</td>
          <td>${esc(p.phase)}</td>
          <td>${fmtKickoff(p.deadline)}</td>
          <td>${p.is_active ? 'Sí' : 'No'}</td>
          <td class="actions">
            <button class="btn btn-sm" data-edit="${p.id}">Editar</button>
            <button class="btn btn-sm" data-matches="${p.id}">Partidos</button>
          </td>
        </tr>`
      )
      .join('');

    panel.innerHTML = `
      <div class="card">
        <div class="card-head">
          <h3>Pollas</h3>
          <button class="btn btn-primary" id="new-pool">+ Nueva polla</button>
        </div>
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr><th>Nombre</th><th>Fase</th><th>Deadline</th><th>Activa</th><th></th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">No hay pollas.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
      <div id="pool-form"></div>
      <div id="pool-matches"></div>
    `;

    panel.querySelector('#new-pool').onclick = () => poolForm(null);
    panel.querySelectorAll('[data-edit]').forEach((b) => {
      b.onclick = () =>
        poolForm(pools.find((p) => String(p.id) === b.dataset.edit));
    });
    panel.querySelectorAll('[data-matches]').forEach((b) => {
      b.onclick = () =>
        poolMatches(pools.find((p) => String(p.id) === b.dataset.matches));
    });
  }

  function poolForm(pool) {
    const isEdit = !!pool;
    const p = pool || {};
    const formEl = panel.querySelector('#pool-form');
    formEl.innerHTML = `
      <div class="card">
        <h3>${isEdit ? 'Editar polla' : 'Nueva polla'}</h3>
        <div class="form-grid">
          <label>Nombre
            <input class="input" id="p-name" value="${esc(p.name || '')}">
          </label>
          <label>Fase
            <select class="input" id="p-phase">
              ${FASES.map(
                (f) =>
                  `<option value="${esc(f)}" ${
                    p.phase === f ? 'selected' : ''
                  }>${esc(f)}</option>`
              ).join('')}
            </select>
          </label>
          <label>Deadline
            <input class="input" type="datetime-local" id="p-deadline" value="${toLocalInput(
              p.deadline
            )}">
          </label>
        </div>
        <div class="form-check">
          <label><input type="checkbox" id="p-active" ${
            p.is_active ?? true ? 'checked' : ''
          }> Activa</label>
          <label><input type="checkbox" id="p-default" ${
            p.is_default ? 'checked' : ''
          }> Predeterminada (default)</label>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" id="save-pool">Guardar</button>
          <button class="btn" id="cancel-pool">Cancelar</button>
        </div>
      </div>
    `;

    formEl.querySelector('#cancel-pool').onclick = () => (formEl.innerHTML = '');
    formEl.querySelector('#save-pool').onclick = async () => {
      const name = formEl.querySelector('#p-name').value.trim();
      if (!name) {
        showMsg('La polla necesita un nombre.');
        return;
      }
      const is_default = formEl.querySelector('#p-default').checked;
      const payload = {
        name,
        phase: formEl.querySelector('#p-phase').value,
        deadline: fromLocalInput(formEl.querySelector('#p-deadline').value),
        is_active: formEl.querySelector('#p-active').checked,
        is_default,
      };
      try {
        // Al marcar default, desmarcamos las demás.
        if (is_default) {
          const { error: clrErr } = await supabase
            .from('pools')
            .update({ is_default: false })
            .neq('id', p.id ?? '00000000-0000-0000-0000-000000000000');
          if (clrErr) throw clrErr;
        }
        if (isEdit) {
          const { error } = await supabase
            .from('pools')
            .update(payload)
            .eq('id', p.id);
          if (error) throw error;
        } else {
          payload.created_by = ctx.user?.id ?? null;
          const { error } = await supabase.from('pools').insert(payload);
          if (error) throw error;
        }
        showMsg('Polla guardada.', 'ok');
        if (ctx.refresh) await ctx.refresh();
        renderPollas();
      } catch (e) {
        handleError(e, 'Error al guardar polla');
      }
    };
  }

  async function poolMatches(pool) {
    if (!pool) return;
    const wrap = panel.querySelector('#pool-matches');
    wrap.innerHTML = `<div class="card"><p>Cargando partidos…</p></div>`;
    let matches = [];
    let assigned = new Set();
    try {
      const [mRes, pmRes] = await Promise.all([
        supabase.from('matches').select('*').order('kickoff', { ascending: true }),
        supabase.from('pool_matches').select('match_id').eq('pool_id', pool.id),
      ]);
      if (mRes.error) throw mRes.error;
      if (pmRes.error) throw pmRes.error;
      matches = mRes.data || [];
      assigned = new Set((pmRes.data || []).map((r) => String(r.match_id)));
    } catch (e) {
      handleError(e, 'Error al cargar partidos de la polla');
      wrap.innerHTML = '';
      return;
    }

    const items = matches
      .map(
        (m) => `
        <label class="check-row">
          <input type="checkbox" data-match="${m.id}" ${
          assigned.has(String(m.id)) ? 'checked' : ''
        }>
          <span>${esc(m.phase)} — ${esc(m.home_flag || '')} ${esc(
          m.home_team
        )} vs ${esc(m.away_team)} ${esc(m.away_flag || '')} · ${fmtKickoff(
          m.kickoff
        )}</span>
        </label>`
      )
      .join('');

    wrap.innerHTML = `
      <div class="card">
        <h3>Partidos de "${esc(pool.name)}"</h3>
        <p class="muted">Marca los partidos que se juegan en esta polla.</p>
        <div class="check-list">${
          items || '<p>No hay partidos en el catálogo.</p>'
        }</div>
      </div>
    `;

    wrap.querySelectorAll('[data-match]').forEach((cb) => {
      cb.onchange = async () => {
        const match_id = cb.dataset.match;
        cb.disabled = true;
        try {
          if (cb.checked) {
            const { error } = await supabase
              .from('pool_matches')
              .insert({ pool_id: pool.id, match_id });
            if (error) throw error;
          } else {
            const { error } = await supabase
              .from('pool_matches')
              .delete()
              .eq('pool_id', pool.id)
              .eq('match_id', match_id);
            if (error) throw error;
          }
          showMsg('Asignación actualizada.', 'ok');
        } catch (e) {
          cb.checked = !cb.checked; // revertir en error
          handleError(e, 'Error al actualizar asignación');
        } finally {
          cb.disabled = false;
        }
      };
    });
  }

  // ------------------------------------------------------------------
  // SECCIÓN 3: MIEMBROS (`pool_members` + join a profiles, toggle has_paid)
  // ------------------------------------------------------------------
  async function renderMiembros() {
    panel.innerHTML = `<div class="card"><p>Cargando pollas…</p></div>`;
    let pools = [];
    try {
      const { data, error } = await supabase
        .from('pools')
        .select('id, name, is_default')
        .order('created_at', { ascending: false });
      if (error) throw error;
      pools = data || [];
    } catch (e) {
      handleError(e, 'Error al cargar pollas');
      panel.innerHTML = '';
      return;
    }

    if (!pools.length) {
      panel.innerHTML = `<div class="card"><p>No hay pollas creadas.</p></div>`;
      return;
    }

    panel.innerHTML = `
      <div class="card">
        <h3>Miembros por polla</h3>
        <label>Polla
          <select class="input" id="mem-pool">
            ${pools
              .map(
                (p) =>
                  `<option value="${p.id}">${esc(p.name)}${
                    p.is_default ? ' ⭐' : ''
                  }</option>`
              )
              .join('')}
          </select>
        </label>
      </div>
      <div id="mem-list"></div>
    `;

    const sel = panel.querySelector('#mem-pool');
    sel.onchange = () => loadMembers(sel.value);
    loadMembers(sel.value);
  }

  async function loadMembers(poolId) {
    const listEl = panel.querySelector('#mem-list');
    listEl.innerHTML = `<div class="card"><p>Cargando miembros…</p></div>`;
    let members = [];
    try {
      const { data, error } = await supabase
        .from('pool_members')
        .select('user_id, has_paid, joined_at, profiles(display_name)')
        .eq('pool_id', poolId)
        .order('joined_at', { ascending: true });
      if (error) throw error;
      members = data || [];
    } catch (e) {
      handleError(e, 'Error al cargar miembros');
      listEl.innerHTML = '';
      return;
    }

    const rows = members
      .map(
        (m) => `
        <tr>
          <td>${esc(m.profiles?.display_name || m.user_id)}</td>
          <td>${fmtKickoff(m.joined_at)}</td>
          <td>
            <label class="switch">
              <input type="checkbox" data-user="${m.user_id}" ${
          m.has_paid ? 'checked' : ''
        }>
              <span>${m.has_paid ? 'Pagó' : 'Pendiente'}</span>
            </label>
          </td>
        </tr>`
      )
      .join('');

    listEl.innerHTML = `
      <div class="card">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Jugador</th><th>Se unió</th><th>Pago</th></tr></thead>
            <tbody>${rows || '<tr><td colspan="3">Sin miembros.</td></tr>'}</tbody>
          </table>
        </div>
      </div>
    `;

    listEl.querySelectorAll('[data-user]').forEach((cb) => {
      cb.onchange = async () => {
        cb.disabled = true;
        try {
          const { error } = await supabase
            .from('pool_members')
            .update({ has_paid: cb.checked })
            .eq('pool_id', poolId)
            .eq('user_id', cb.dataset.user);
          if (error) throw error;
          cb.nextElementSibling.textContent = cb.checked ? 'Pagó' : 'Pendiente';
          showMsg('Estado de pago actualizado.', 'ok');
        } catch (e) {
          cb.checked = !cb.checked;
          handleError(e, 'Error al actualizar pago');
        } finally {
          cb.disabled = false;
        }
      };
    });
  }

  // Render inicial.
  renderTab('partidos');
}
