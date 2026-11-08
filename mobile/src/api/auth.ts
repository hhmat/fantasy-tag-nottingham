// Auth API — email + Google OAuth via Supabase Auth.
import { Platform } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';
import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

WebBrowser.maybeCompleteAuthSession();

// Where Supabase sends users after OAuth / email confirmation / password
// recovery. On web this MUST include the GitHub Pages subpath (baked in at
// export time as EXPO_PUBLIC_BASE_PATH); on native it is the app deep link.
// Register BOTH in Supabase → Authentication → URL Configuration:
//   https://hhmat.github.io/fantasy-tag-nottingham/auth/callback
//   fantasytag://auth/callback
export const redirectTo =
  Platform.OS === 'web' && typeof window !== 'undefined'
    ? `${window.location.origin}${process.env.EXPO_PUBLIC_BASE_PATH ?? ''}/auth/callback`
    : makeRedirectUri({ scheme: 'fantasytag', path: 'auth/callback' });

export async function signInWithEmail(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signUpWithEmail(email: string, password: string, displayName: string) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  // data.session is present only when email confirmation is disabled —
  // the caller uses it to route straight into onboarding.
  return data;
}

export async function signInWithGoogle() {
  if (Platform.OS === 'web') {
    // Full-window redirect flow; the session is picked up in /auth/callback.
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    });
    if (error) throw error;
    return;
  }

  // Native: in-app browser session, exchange the code inline.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('No OAuth URL returned');

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') throw new Error('Sign-in cancelled');

  const url = new URL(result.url);
  const code = url.searchParams.get('code');
  if (code) {
    const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
    if (exErr) throw exErr;
  }
}

export async function signOut() {
  await supabase.auth.signOut();
}

// 0007 intentionally removes table-wide SELECT so expo_push_token stays
// private. SELECT * would still request that protected column and fail with
// PostgreSQL 42501, so always name the client-readable columns explicitly.
const PROFILE_COLUMNS = 'id, display_name, is_admin, avatar_url, created_at, onboarding_step';

export async function getProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();
  if (error) throw error;
  return data as Profile;
}

export async function resetPassword(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

/** Persist onboarding progress (0–3) or completion (null). */
export async function setOnboardingStep(userId: string, step: number | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ onboarding_step: step })
    .eq('id', userId);
  if (error) throw error;
}

export async function updateProfileDetails(userId: string, displayName: string) {
  const { error } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', userId);
  if (error) throw error;
}

export async function setAvatarUrl(userId: string, avatarUrl: string | null) {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_url: avatarUrl })
    .eq('id', userId);
  if (error) throw error;
}
