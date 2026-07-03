// Vista de pollas: lista activas, unirse, seleccionar activa.
export async function render(el, ctx) {
  const { supabase, user, pools, setPool } = ctx;

  el.innerHTML = `<h1 class="section-title">Pollas</h1><div id="poolsList" class="pools"><div class="loading">Cargando…</div></div>`;
  const list = el.querySelector('#poolsList');

  let memberOf = [];
  try {
    const { data, error } = await supabase
      .from('pool_members')
      .select('pool_id, has_paid')
      .eq('user_id', user.id);
    if (error) throw error;
    memberOf = data || [];
  } catch (e) {
    list.innerHTML = `<div class="error">No se pudieron cargar tus membresías. Revisa tu conexión.</div>`;
    return;
  }

  const memberIds = new Set(memberOf.map((m) => m.pool_id));
  const paidMap = new Map(memberOf.map((m) => [m.pool_id, m.has_paid]));

  if (!pools.length) {
    list.innerHTML = `<div class="empty">Aún no hay pollas activas. Vuelve pronto.</div>`;
    return;
  }

  list.innerHTML = pools
    .map((p) => {
      const isMember = memberIds.has(p.id);
      const isActive = p.id === ctx.pool?.id;
      const paid = paidMap.get(p.id);
      const deadline = p.deadline
        ? new Date(p.deadline).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' })
        : '—';
      return `
        <article class="card pool-card ${p.is_default ? 'pool-card--default' : ''} ${isActive ? 'pool-card--active' : ''}" data-id="${p.id}">
          <div class="pool-card__head">
            <h2 class="pool-card__name">${esc(p.name)}</h2>
            ${p.is_default ? '<span class="tag tag--gold">Default</span>' : ''}
            ${isActive ? '<span class="tag tag--green">Activa</span>' : ''}
          </div>
          <div class="pool-card__meta">
            <span>Fase: ${esc(p.phase || '—')}</span>
            <span>Cierre: ${deadline}</span>
          </div>
          <div class="pool-card__foot">
            ${
              isMember
                ? `<span class="chip chip--ok">Perteneces ${paid ? '· ✓ pagado' : '· pago pendiente'}</span>`
                : `<button class="btn btn--primary btn--sm join" data-id="${p.id}">Unirme</button>`
            }
            ${
              isMember && !isActive
                ? `<button class="btn btn--ghost btn--sm setactive" data-id="${p.id}">Usar esta</button>`
                : ''
            }
          </div>
        </article>`;
    })
    .join('');

  list.querySelectorAll('.join').forEach((btn) =>
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = 'Uniéndote…';
      try {
        const id = btn.dataset.id;
        const { error } = await supabase
          .from('pool_members')
          .insert({ pool_id: id, user_id: user.id });
        if (error) throw error;
        setPool(id); // unirse y activarla; setPool re-renderiza
      } catch (e) {
        btn.disabled = false;
        btn.textContent = 'Reintentar';
        alert('No se pudo unir a la polla. Revisa tu conexión e intenta de nuevo.');
      }
    })
  );

  list.querySelectorAll('.setactive').forEach((btn) =>
    btn.addEventListener('click', () => setPool(btn.dataset.id))
  );
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
