-- CampusFlow LMS: Semester organization for existing live databases.
-- Run ONCE in Supabase SQL Editor before deploying the updated frontend.
-- Safe to rerun. Preserves module IDs, resources, chats, and dashboard order.
-- Existing modules start with semester = NULL (shown under "Unassigned modules")
-- so an administrator can assign them correctly without guessing.

begin;

alter table public.modules add column if not exists semester integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.modules'::regclass
      and conname = 'modules_semester_range'
  ) then
    alter table public.modules
      add constraint modules_semester_range
      check (semester between 1 and 8);
  end if;
end $$;

create index if not exists idx_modules_semester
  on public.modules (semester, created_at desc);

commit;

-- Invalidate PostgREST schema cache so new inserts/updates can use semester.
notify pgrst, 'reload schema';

-- Optional: Show module assignments after migration.
select title, semester from public.modules order by created_at desc;
