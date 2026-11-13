-- ONE-TIME migration for projects already running the EMAIL login edition.
-- Back up the database, stop student signups, and run in Supabase SQL Editor.
-- Afterwards run scripts/migrate-legacy-accounts.mjs --apply to change the
-- internal auth identifiers while preserving existing users/passwords.
-- NEW projects should run schema.sql instead, NOT this file.

begin;

alter table public.profiles add column if not exists username text;

-- Existing login emails become unique, lower-case usernames. When an old
-- email's local part is invalid/duplicate, a stable student_<id> is assigned.
do $$
declare
  p record;
  candidate text;
  suffix text;
begin
  for p in select id, email, username from public.profiles order by created_at, id loop
    if p.username is null or p.username !~ '^[a-z][a-z0-9_]{2,23}$' then
      candidate := left(lower(regexp_replace(split_part(coalesce(p.email,''),'@',1),'[^a-zA-Z0-9_]','_','g')),24);
      suffix := left(replace(p.id::text,'-',''),12);
      if candidate !~ '^[a-z][a-z0-9_]{2,23}$' then
        candidate := 'student_' || suffix;
      end if;
      if exists(select 1 from public.profiles where username=candidate and id<>p.id) then
        candidate := 'student_' || suffix;
      end if;
      update public.profiles set username=candidate where id=p.id;
    end if;
  end loop;
end $$;

alter table public.profiles alter column username set not null;
create unique index if not exists profiles_username_unique_idx on public.profiles(username);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='profiles_username_format_check' and conrelid='public.profiles'::regclass) then
    alter table public.profiles add constraint profiles_username_format_check
      check (username ~ '^[a-z][a-z0-9_]{2,23}$');
  end if;
end $$;

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

-- Stop keeping historic personal email addresses in public profiles.
-- Supabase Auth's internal email fields will be updated via admin API.
alter table public.profiles drop column if exists email;

commit;
