// Vista de reglas y costo.
import { COSTO_POLLA } from '../config.js';

export async function render(el, ctx) {
  const pool = ctx.pool;
  const deadline = pool?.deadline
    ? new Date(pool.deadline).toLocaleString('es-PE', { dateStyle: 'full', timeStyle: 'short' })
    : null;

  el.innerHTML = `
    <section class="rules">
      <h1 class="section-title">Reglas del juego</h1>

      <div class="card rules__points">
        <h2>Puntaje</h2>
        <ul class="rules__list">
          <li><span class="pts pts--3">3 pts</span> Aciertas el <strong>ganador y el marcador exacto</strong>.</li>
          <li><span class="pts pts--1">1 pt</span> Aciertas solo <strong>quién gana</strong> el partido.</li>
          <li><span class="pts pts--0">0 pts</span> No aciertas al ganador.</li>
        </ul>
        <p class="rules__note">
          En eliminatorias, si hay empate en los 90', el ganador lo define quién avanza
          (penales). Por eso al predecir un empate debes elegir qué equipo pasa.
        </p>
      </div>

      <div class="card rules__cost">
        <h2>Costo</h2>
        <p class="cost-amount">S/. ${COSTO_POLLA.toFixed(2)}</p>
        <p class="rules__note">Costo de participación por polla. El pago lo confirma el administrador.</p>
      </div>

      <div class="card rules__deadline">
        <h2>Cierre de predicciones</h2>
        ${
          deadline
            ? `<p>Para la polla <strong>${escape(pool.name)}</strong> el cierre es:</p>
               <p class="deadline-date">${deadline}</p>`
            : `<p class="rules__note">Cada polla tiene su fecha de cierre. Además, cada partido se bloquea al iniciar (kickoff).</p>`
        }
        <p class="rules__note">No podrás editar tus predicciones después del cierre de la polla ni después del inicio de cada partido.</p>
      </div>

      <div class="card">
        <h2>¿Cómo se desempata?</h2>
        <p class="rules__note">Si dos jugadores tienen los mismos puntos, gana quien tenga más <strong>marcadores exactos</strong>.</p>
      </div>
    </section>
  `;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}
