
-- CampusFlow LMS: Intake Year Migration
-- Designed for the supplied username/password schema.
-- Preserve existing student accounts and data.

BEGIN;

-- 1. Add intake year to student profiles.
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS intake_year INTEGER;

-- Existing accounts remain unassigned until an admin sets their year.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_intake_year_range'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_intake_year_range
    CHECK (intake_year BETWEEN 2000 AND 2100);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_intake_year
ON public.profiles(intake_year);

-- 2. Save intake year when an account is created.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    username,
    full_name,
    intake_year
  )
  VALUES (
    NEW.id,
    lower(coalesce(
      nullif(NEW.raw_user_meta_data->>'username', ''),
      split_part(coalesce(NEW.email, ''), '@', 1)
    )),
    coalesce(
      nullif(NEW.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(NEW.email, ''), '@', 1)
    ),
    nullif(NEW.raw_user_meta_data->>'intake_year', '')::integer
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- The existing on_auth_user_created trigger already calls this function.

-- 3. Look up the signed-in user's intake year.
CREATE OR REPLACE FUNCTION public.current_intake_year()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.intake_year
  FROM public.profiles p
  WHERE p.id = auth.uid()
$$;

REVOKE ALL ON FUNCTION public.current_intake_year()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.current_intake_year()
TO authenticated;

-- 4. Replace the policy that currently exposes all students.
DROP POLICY IF EXISTS "Members can view profiles"
ON public.profiles;

DROP POLICY IF EXISTS "Intake restricted profiles"
ON public.profiles;

CREATE POLICY "Intake restricted profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = (SELECT auth.uid())

  OR (SELECT public.is_admin())

  OR (
    role = 'student'
    AND intake_year IS NOT NULL
    AND intake_year = (SELECT public.current_intake_year())
  )
);

-- 5. Allow only an administrator to change a student's intake.
CREATE OR REPLACE FUNCTION public.assign_student_intake(
  p_student_id uuid,
  p_intake_year integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required';
  END IF;

  IF p_intake_year IS NULL
     OR p_intake_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'Invalid intake year';
  END IF;

  UPDATE public.profiles
  SET intake_year = p_intake_year
  WHERE id = p_student_id
    AND role = 'student';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Student not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION
public.assign_student_intake(uuid, integer)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
public.assign_student_intake(uuid, integer)
TO authenticated;

-- 6. Prevent students from adding members from other intakes.
-- Applies to new conversations and the existing group-management RPC.
CREATE OR REPLACE FUNCTION public.guard_chat_member_intake()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_creator_id uuid;
  v_creator_year integer;
  v_member_year integer;
BEGIN
  -- Trusted database maintenance and LMS admins may manage any intake.
  IF auth.uid() IS NULL OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT c.created_by
  INTO v_creator_id
  FROM public.chats c
  WHERE c.id = NEW.chat_id;

  SELECT p.intake_year
  INTO v_creator_year
  FROM public.profiles p
  WHERE p.id = v_creator_id;

  SELECT p.intake_year
  INTO v_member_year
  FROM public.profiles p
  WHERE p.id = NEW.user_id;

  IF v_creator_year IS NULL
     OR v_member_year IS DISTINCT FROM v_creator_year THEN
    RAISE EXCEPTION
      'You can only invite students from the same intake year';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS check_chat_member_intake
ON public.chat_members;

CREATE TRIGGER check_chat_member_intake
BEFORE INSERT ON public.chat_members
FOR EACH ROW
EXECUTE FUNCTION public.guard_chat_member_intake();

-- 7. Protect direct-chat creation, including reuse of existing chats.
CREATE OR REPLACE FUNCTION public.create_conversation(
  p_is_group boolean,
  p_title text,
  p_member_ids uuid[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  creator uuid := auth.uid();
  new_chat uuid;
  members uuid[];
  existing_chat uuid;
  creator_year integer;
BEGIN
  IF creator IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT array_agg(DISTINCT x)
  INTO members
  FROM unnest(
    array_append(coalesce(p_member_ids, '{}'::uuid[]), creator)
  ) AS x
  WHERE x IS NOT NULL;

  IF cardinality(members) < 2 THEN
    RAISE EXCEPTION 'Choose at least one other student';
  END IF;

  IF cardinality(members) > 30 THEN
    RAISE EXCEPTION 'Group limit is 30 members';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(members) AS m(user_id)
    LEFT JOIN public.profiles p ON p.id = m.user_id
    WHERE p.id IS NULL
  ) THEN
    RAISE EXCEPTION 'One or more selected users do not exist';
  END IF;

  IF NOT public.is_admin() THEN
    SELECT p.intake_year
    INTO creator_year
    FROM public.profiles p
    WHERE p.id = creator;

    IF creator_year IS NULL OR EXISTS (
      SELECT 1
      FROM unnest(members) AS m(user_id)
      JOIN public.profiles p ON p.id = m.user_id
      WHERE p.role <> 'student'
         OR p.intake_year IS DISTINCT FROM creator_year
    ) THEN
      RAISE EXCEPTION
        'You can only chat with students from your intake year';
    END IF;
  END IF;

  IF NOT p_is_group AND cardinality(members) <> 2 THEN
    RAISE EXCEPTION 'Direct chat must have two members';
  END IF;

  IF p_is_group AND (
    char_length(trim(coalesce(p_title, ''))) < 2
    OR char_length(trim(coalesce(p_title, ''))) > 80
  ) THEN
    RAISE EXCEPTION 'Group name must contain 2 to 80 characters';
  END IF;

  IF NOT p_is_group THEN
    SELECT c.id
    INTO existing_chat
    FROM public.chats c
    JOIN public.chat_members m ON m.chat_id = c.id
    WHERE c.is_group = false
    GROUP BY c.id
    HAVING count(*) = 2
       AND array_agg(m.user_id) @> members
       AND members @> array_agg(m.user_id)
    LIMIT 1;

    IF existing_chat IS NOT NULL THEN
      RETURN existing_chat;
    END IF;
  END IF;

  INSERT INTO public.chats(is_group, title, created_by)
  VALUES (
    p_is_group,
    CASE WHEN p_is_group THEN trim(p_title) ELSE '' END,
    creator
  )
  RETURNING id INTO new_chat;

  INSERT INTO public.chat_members(chat_id, user_id)
  SELECT new_chat, unnest(members);

  RETURN new_chat;
END;
$$;

REVOKE ALL ON FUNCTION
public.create_conversation(boolean, text, uuid[])
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
public.create_conversation(boolean, text, uuid[])
TO authenticated;

COMMIT;

-- Refresh Supabase API schema information.
NOTIFY pgrst, 'reload schema';
