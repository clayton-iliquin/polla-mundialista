// Vista de login (Google OAuth).
import { signInWithGoogle } from '../supabase.js';

export async function render(el, ctx) {
  el.innerHTML = `
    <section class="login">
      <div class="login__card">
        <div class="login__badge">⚽</div>
        <h1 class="login__title">Polla Mundialista</h1>
        <p class="login__sub">Predice los partidos de las eliminatorias del Mundial 2026 y compite con tu grupo.</p>
        <button id="btnGoogle" class="btn btn--primary btn--lg">
          <span class="g-icon">G</span> Entrar con Google
        </button>
        <p id="loginErr" class="login__err" hidden></p>
        <a href="#/reglas" class="login__link">Ver las reglas</a>
      </div>
    </section>
  `;

  el.querySelector('#btnGoogle').addEventListener('click', async () => {
    const err = el.querySelector('#loginErr');
    err.hidden = true;
    try {
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (e) {
      err.hidden = false;
      err.textContent = 'No se pudo iniciar sesión. Revisa tu conexión e intenta de nuevo.';
    }
  });
}
