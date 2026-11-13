/**
 * Username-to-identity mapping for Supabase password auth.
 * No personal email address is requested or stored in public.profiles.
 * The suffix is fixed and reserved/non-deliverable. Do not change after launch.
 */
export const USERNAME_DOMAIN = 'users.campusflow.example.com';
export function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}
export function isValidUsername(value) {
  return /^[a-z][a-z0-9_]{2,23}$/.test(value);
}
export function usernameAuthEmail(value) {
  const name = normalizeUsername(value);
  if (!isValidUsername(name)) throw new Error('Invalid username');
  return `${name}@${USERNAME_DOMAIN}`;
}
