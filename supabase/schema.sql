-- CampusFlow LMS database (USERNAME + PASSWORD edition). Run in Supabase > SQL Editor.
-- Student emails are never collected; Supabase Auth uses a generated, reserved email alias internally.
-- Disable Confirm email under Authentication -> Providers -> Email before signing up.
-- For a database created with the older email-based schema, see supabase/migrate_to_usernames.sql first.
-- All file bytes live in Google Drive. Supabase stores ONLY metadata, users and chat text.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z][a-z0-9_]{2,23}$'),
  full_name text not null default '',
  role text not null default 'student' check (role in ('student','admin')),
  avatar_file_id text,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id,username,full_name)
  values (new.id, lower(coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(coalesce(new.email,''),'@',1))), coalesce(nullif(new.raw_user_meta_data->>'full_name',''), split_part(coalesce(new.email,''),'@',1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Adds profiles for Auth users created before the schema was installed.
insert into public.profiles(id,username,full_name)
select id, lower(coalesce(nullif(raw_user_meta_data->>'username',''),split_part(coalesce(email,''),'@',1))), coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(coalesce(email,''),'@',1))
from auth.users on conflict (id) do nothing;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.profiles where id=auth.uid() and role='admin') $$;

create table if not exists public.modules (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null default '',
  category text not null default 'General',
  color text not null default 'violet',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.resources (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.modules(id) on delete cascade,
  uploader_id uuid not null references public.profiles(id),
  title text not null check (char_length(title) between 2 and 180),
  description text not null default '',
  file_id text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  is_group boolean not null default false,
  title text not null default '',
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table if not exists public.chat_members (
  chat_id uuid not null references public.chats(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key(chat_id,user_id)
);
create or replace function public.is_chat_member(target_chat uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists(select 1 from public.chat_members where chat_id=target_chat and user_id=auth.uid()) $$;

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats(id) on delete cascade,
  sender_id uuid not null references public.profiles(id),
  body text not null default '',
  file_id text unique,
  file_name text,
  mime_type text,
  created_at timestamptz not null default now(),
  constraint text_or_attachment check (nullif(btrim(body),'') is not null or file_id is not null),
  constraint file_metadata check ((file_id is null and file_name is null and mime_type is null) or (file_id is not null and file_name is not null and mime_type is not null))
);

create index if not exists idx_resources_module on public.resources(module_id,created_at desc);
create index if not exists idx_messages_chat on public.messages(chat_id,created_at);
create index if not exists idx_members_user on public.chat_members(user_id);

alter table public.profiles enable row level security;
alter table public.modules enable row level security;
alter table public.resources enable row level security;
alter table public.chats enable row level security;
alter table public.chat_members enable row level security;
alter table public.messages enable row level security;

-- Read profiles within the LMS; users can only modify their own display name directly.
create policy "Members can view profiles" on public.profiles for select to authenticated using (true);
create policy "Edit own name" on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

create policy "Members see modules" on public.modules for select to authenticated using (true);
create policy "Admins create modules" on public.modules for insert to authenticated with check (public.is_admin() and created_by=auth.uid());
create policy "Admins update modules" on public.modules for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "Members see resources" on public.resources for select to authenticated using (true);
-- Inserts to resources and attachment messages MUST go via the trusted Worker using the service-role key.
-- This ensures nobody can invent a file reference to bypass the Drive download permission check.

create policy "Members see their chats" on public.chats for select to authenticated using (public.is_chat_member(id));
create policy "Members see chat membership" on public.chat_members for select to authenticated using (public.is_chat_member(chat_id));
create policy "Members see their messages" on public.messages for select to authenticated using (public.is_chat_member(chat_id));
create policy "Members send text messages" on public.messages for insert to authenticated
  with check (sender_id=auth.uid() and public.is_chat_member(chat_id) and file_id is null);

-- Prevent client-side privilege escalation, chat membership changes, or forged file metadata.
revoke all on public.profiles from anon;
revoke insert,delete,update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update(full_name) on public.profiles to authenticated;
revoke all on public.resources from anon;
revoke insert,update,delete on public.resources from authenticated;
grant select on public.resources to authenticated;
revoke all on public.chats from anon;
revoke insert,update,delete on public.chats from authenticated;
grant select on public.chats to authenticated;
revoke all on public.chat_members from anon;
revoke insert,update,delete on public.chat_members from authenticated;
grant select on public.chat_members to authenticated;
revoke all on public.messages from anon;
revoke update,delete on public.messages from authenticated;
grant select,insert on public.messages to authenticated;
revoke all on public.modules from anon;
grant select,insert,update on public.modules to authenticated;

-- Create group/direct chats using a single authorized, transaction-safe function.
create or replace function public.create_conversation(p_is_group boolean, p_title text, p_member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public
as $$
declare
  creator uuid := auth.uid();
  new_chat uuid;
  members uuid[];
  existing_chat uuid;
begin
  if creator is null then raise exception 'Not signed in'; end if;
  select array_agg(distinct x) into members from unnest(array_append(coalesce(p_member_ids,'{}'::uuid[]),creator)) x where x is not null;
  if cardinality(members) < 2 then raise exception 'Choose at least one other student'; end if;
  if cardinality(members) > 30 then raise exception 'Group limit is 30 members'; end if;
  if exists(select 1 from unnest(members) x left join public.profiles p on p.id=x where p.id is null) then
    raise exception 'One or more selected users do not exist';
  end if;
  if not p_is_group and cardinality(members) <> 2 then raise exception 'Direct chat must have two members'; end if;
  if p_is_group and length(trim(coalesce(p_title,''))) < 2 then raise exception 'Enter a group name'; end if;

  -- Reuse an existing direct message thread when possible.
  if not p_is_group then
    select c.id into existing_chat from public.chats c
      join public.chat_members m on m.chat_id=c.id
      where c.is_group=false
      group by c.id
      having count(*)=2 and array_agg(m.user_id) @> members and members @> array_agg(m.user_id)
      limit 1;
    if existing_chat is not null then return existing_chat; end if;
  end if;
  insert into public.chats(is_group,title,created_by) values(p_is_group,case when p_is_group then trim(p_title) else '' end,creator)
  returning id into new_chat;
  insert into public.chat_members(chat_id,user_id) select new_chat, unnest(members);
  return new_chat;
end;
$$;
revoke all on function public.create_conversation(boolean,text,uuid[]) from public;
grant execute on function public.create_conversation(boolean,text,uuid[]) to authenticated;

-- Supabase Realtime: new chat messages and uploads appear without manual refresh.
do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='resources') then
    alter publication supabase_realtime add table public.resources;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chats') then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='chat_members') then
    alter publication supabase_realtime add table public.chat_members;
  end if;
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='modules') then
    alter publication supabase_realtime add table public.modules;
  end if;
end $$;

-- IMPORTANT: AFTER a trusted admin registers, run this separately in SQL Editor:
-- update public.profiles set role='admin' where username='your_admin_username';
