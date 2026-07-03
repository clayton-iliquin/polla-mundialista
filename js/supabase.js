// Cliente Supabase + helpers de autenticación.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Login con Google. redirectTo debe volver a esta misma página.
export async function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: location.origin + location.pathname },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Obtiene (o crea) el perfil del usuario logueado.
export async function getOrCreateProfile(user) {
  if (!user) return null;
  let { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;

  if (!profile) {
    const display_name =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      user.email?.split('@')[0] ||
      'Jugador';
    const { data: created, error: insErr } = await supabase
      .from('profiles')
      .insert({ id: user.id, display_name })
      .select('*')
      .single();
    if (insErr) throw insErr;
    profile = created;
  }
  return profile;
}
