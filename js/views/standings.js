// Tabla de posiciones del pool activo, en vivo.
let channel = null;

export async function render(el, ctx) {
  const { supabase, pool, refresh } = ctx;

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
            <tr class="${r.user_id === user.id ? 'is-me' : ''}">
              <td class="pos">${medal(i)}</td>
              <td class="pname">${esc(r.display_name)}${r.user_id === user.id ? ' <span class="you">(tú)</span>' : ''}</td>
              <td class="num strong">${r.points ?? 0}</td>
              <td class="num">${r.exact_hits ?? 0}</td>
              <td class="paid">${paid.get(r.user_id) ? '✓' : '—'}</td>
            </tr>`
            )
            .join('')}
        </tbody>
      </table>`;
  } catch (e) {
    bodyEl.innerHTML = `<div class="error">No se pudo cargar la tabla. Revisa tu conexión.</div>`;
  }
}

function medal(i) {
  return i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
