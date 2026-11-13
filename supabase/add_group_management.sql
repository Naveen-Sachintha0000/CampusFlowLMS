-- CampusFlow LMS: allow group creator or LMS admin to rename a group and add members.
-- SAFE FOR EXISTING LIVE DATA. Run ONCE in Supabase > SQL Editor as a project administrator.
-- Does not delete or recreate any chats, members, messages, students, or resources.
-- Group size remains limited to 30. New members can read existing chat history.

begin;

create or replace function public.update_group_details(
  p_chat_id uuid,
  p_title text,
  p_add_member_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_title text := btrim(coalesce(p_title,''));
  v_new_members uuid[];
  v_current_count integer;
  v_new_count integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to manage a group';
  end if;

  -- Lock the group to serialize competing updates. Never permit changes to DMs.
  select c.created_by into v_owner
  from public.chats as c
  where c.id = p_chat_id and c.is_group = true
  for update;

  if v_owner is null then
    raise exception 'Group not found';
  end if;
  if v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'Only the group creator or an administrator can manage this group';
  end if;

  if char_length(v_title) < 2 or char_length(v_title) > 80 then
    raise exception 'Group name must contain between 2 and 80 characters';
  end if;

  select coalesce(array_agg(distinct wanted.id), '{}'::uuid[]) into v_new_members
  from unnest(coalesce(p_add_member_ids, '{}'::uuid[])) as wanted(id)
  where wanted.id is not null;

  if exists (
    select 1 from unnest(v_new_members) as wanted(id)
    left join public.profiles as p on p.id = wanted.id
    where p.id is null
  ) then
    raise exception 'One or more selected students no longer exist';
  end if;

  select count(*) into v_current_count
  from public.chat_members m where m.chat_id = p_chat_id;

  select count(*) into v_new_count
  from unnest(v_new_members) as wanted(id)
  where not exists (
    select 1 from public.chat_members m
    where m.chat_id = p_chat_id and m.user_id = wanted.id
  );

  if v_current_count + v_new_count > 30 then
    raise exception 'Group limit is 30 members';
  end if;

  update public.chats set title = v_title where id = p_chat_id;
  insert into public.chat_members (chat_id, user_id)
  select p_chat_id, wanted.id
  from unnest(v_new_members) as wanted(id)
  on conflict (chat_id,user_id) do nothing;
end;
$$;

-- Do not allow anonymous callers. Direct table writes remain prohibited by RLS/grants.
revoke all on function public.update_group_details(uuid,text,uuid[]) from public;
revoke all on function public.update_group_details(uuid,text,uuid[]) from anon;
grant execute on function public.update_group_details(uuid,text,uuid[]) to authenticated;

-- Realtime already publishes both tables in the original schema. This is
-- idempotent for installations where the publication was not fully configured.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chats'
  ) then
    alter publication supabase_realtime add table public.chats;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='chat_members'
  ) then
    alter publication supabase_realtime add table public.chat_members;
  end if;
end;
$$;

commit;
