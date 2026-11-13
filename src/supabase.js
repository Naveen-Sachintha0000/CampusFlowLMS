import { createClient } from '@supabase/supabase-js';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const ready = !!(url && key && !url.includes('YOUR_PROJECT') && !key.includes('YOUR_'));
export const supabase = ready ? createClient(url, key, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
}) : null;
export { USERNAME_DOMAIN, normalizeUsername, isValidUsername, usernameAuthEmail } from './username-auth.js';
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
export async function api(path, options={}) {
  if (!API_URL) throw new Error('Media API URL is not configured. See README.md.');
  const {data:{session}} = await supabase.auth.getSession();
  if (!session) throw new Error('Your session expired. Please sign in again.');
  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${session.access_token}`, ...(options.headers || {}) }
  });
  if (!response.ok) {
    let msg = `Request failed (${response.status})`;
    try { const detail=await response.json(); msg = detail.error || msg; } catch { /* blob/text error */ }
    throw new Error(msg);
  }
  return response;
}
export async function fileObjectURL(id) {
  const res = await api(`/api/file/${encodeURIComponent(id)}`);
  return URL.createObjectURL(await res.blob());
}
