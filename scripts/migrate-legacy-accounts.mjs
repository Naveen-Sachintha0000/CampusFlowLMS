/**
 * Optional one-time migration of EXISTING Supabase email-based logins into
 * CampusFlow's generated username aliases. DO NOT run for a fresh project.
 *
 * 1. Back up DB/auth users; run supabase/migrate_to_usernames.sql.
 * 2. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in private environment.
 * 3. node scripts/migrate-legacy-accounts.mjs       (DRY RUN)
 * 4. node scripts/migrate-legacy-accounts.mjs --apply
 *
 * Existing passwords and profile IDs stay the same. This requires the legacy
 * service_role JWT key and must only be run from a trusted admin machine.
 */
import { createClient } from '@supabase/supabase-js';

const domain='users.campusflow.example.com';
const url=process.env.SUPABASE_URL;
const serviceKey=process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running this admin-only script.');
  process.exit(1);
}
const client=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
const users=[];
for(let page=1;page<=500;page++) {
  const {data,error}=await client.auth.admin.listUsers({page,perPage:100});
  if(error)throw error;
  const batch=data?.users||[];
  users.push(...batch);
  if(batch.length<100)break;
}
const profiles=[];
for(let offset=0;offset<users.length+1000;offset+=1000) {
  const {data,error}=await client.from('profiles').select('id,username').range(offset,offset+999).order('id');
  if(error)throw error;
  profiles.push(...(data||[]));
  if((data||[]).length<1000)break;
}
const profileById=new Map(profiles.map(p=>[p.id,p]));
const updates=users.map(user=>{
  const profile=profileById.get(user.id);
  if(!profile)throw new Error(`Missing profile for user ${user.id}; complete SQL migration before running this script.`);
  const email=`${profile.username}@${domain}`;
  return {user,email,username:profile.username};
}).filter(x=>x.user.email?.toLowerCase()!==x.email);
console.log(`Auth users: ${users.length}. Users requiring alias conversion: ${updates.length}.`);
console.log('Usernames to convert:',updates.map(x=>x.username).join(', ')||'(none)');
if(!process.argv.includes('--apply')) {
  console.log('DRY RUN: no changes made. Re-run with --apply after reviewing the output.');
  process.exit(0);
}
let changed=0;
for(const {user,email,username} of updates) {
  const {error}=await client.auth.admin.updateUserById(user.id,{email,email_confirm:true});
  if(error){console.error(`FAILED ${username}: ${error.message}`);continue;}
  changed++;
  console.log(`Updated: @${username}`);
}
console.log(`Complete: ${changed}/${updates.length} updated. Re-run to retry any failures. Existing passwords are unchanged.`);
if(changed!==updates.length)process.exitCode=1;
