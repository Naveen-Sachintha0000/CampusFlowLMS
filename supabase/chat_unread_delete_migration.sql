
-- CampusFlow LMS: Unread messages and message deletion
-- Preserves existing conversations and messages.

BEGIN;

-- 1. Store each user's private read/hidden state.
CREATE TABLE IF NOT EXISTS public.chat_user_state (
    chat_id uuid NOT NULL
      REFERENCES public.chats(id) ON DELETE CASCADE,
    user_id uuid NOT NULL
      REFERENCES public.profiles(id) ON DELETE CASCADE,
    last_read_at timestamptz,
    hidden_at timestamptz,
    PRIMARY KEY (chat_id, user_id)
);

ALTER TABLE public.chat_user_state
ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own chat state"
ON public.chat_user_state;

CREATE POLICY "Users read own chat state"
ON public.chat_user_state
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.chat_user_state FROM anon;
REVOKE ALL ON public.chat_user_state FROM authenticated;
GRANT SELECT ON public.chat_user_state TO authenticated;

-- 2. Add message deletion fields.
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS deleted_by uuid;

-- 3. Calculate unread messages using database records.
CREATE OR REPLACE FUNCTION public.get_unread_chat_counts()
RETURNS TABLE(chat_id uuid, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT
        m.chat_id,
        count(*)::bigint AS unread_count
    FROM public.chat_members cm
    JOIN public.messages m
        ON m.chat_id = cm.chat_id
    LEFT JOIN public.chat_user_state s
        ON s.chat_id = cm.chat_id
       AND s.user_id = cm.user_id
    WHERE cm.user_id = auth.uid()
      AND m.sender_id <> cm.user_id
      AND m.deleted_at IS NULL
      AND m.created_at > GREATEST(
          cm.joined_at,
          COALESCE(s.last_read_at, cm.joined_at)
      )
    GROUP BY m.chat_id;
$$;

REVOKE ALL ON FUNCTION public.get_unread_chat_counts()
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_unread_chat_counts()
TO authenticated;

-- 4. Mark a conversation as seen.
CREATE OR REPLACE FUNCTION public.mark_chat_read(
    p_chat_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.is_chat_member(p_chat_id) THEN
        RAISE EXCEPTION 'Chat access denied';
    END IF;

    INSERT INTO public.chat_user_state (
        chat_id,
        user_id,
        last_read_at,
        hidden_at
    )
    VALUES (
        p_chat_id,
        auth.uid(),
        clock_timestamp(),
        NULL
    )
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET
        last_read_at = GREATEST(
            public.chat_user_state.last_read_at,
            EXCLUDED.last_read_at
        ),
        hidden_at = NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_read(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.mark_chat_read(uuid)
TO authenticated;

-- 5. Hide a chat for one user only.
CREATE OR REPLACE FUNCTION public.hide_chat_for_me(
    p_chat_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_now timestamptz := clock_timestamp();
BEGIN
    IF auth.uid() IS NULL
       OR NOT public.is_chat_member(p_chat_id) THEN
        RAISE EXCEPTION 'Chat access denied';
    END IF;

    INSERT INTO public.chat_user_state (
        chat_id,
        user_id,
        last_read_at,
        hidden_at
    )
    VALUES (
        p_chat_id,
        auth.uid(),
        v_now,
        v_now
    )
    ON CONFLICT (chat_id, user_id)
    DO UPDATE SET
        last_read_at = GREATEST(
            public.chat_user_state.last_read_at,
            EXCLUDED.last_read_at
        ),
        hidden_at = EXCLUDED.hidden_at;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_chat_for_me(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.hide_chat_for_me(uuid)
TO authenticated;

-- 6. Delete a message for every participant.
-- Keep a visible tombstone, but remove the original content.
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(
    p_message_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_chat_id uuid;
    v_sender_id uuid;
    v_deleted_at timestamptz;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Sign in required';
    END IF;

    SELECT m.chat_id, m.sender_id, m.deleted_at
    INTO v_chat_id, v_sender_id, v_deleted_at
    FROM public.messages m
    WHERE m.id = p_message_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Message not found';
    END IF;

    IF v_sender_id <> auth.uid()
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION
          'Only the sender or an administrator can delete this message';
    END IF;

    IF NOT public.is_chat_member(v_chat_id)
       AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Chat access denied';
    END IF;

    -- Already deleted: no further action needed.
    IF v_deleted_at IS NOT NULL THEN
        RETURN;
    END IF;

    UPDATE public.messages
    SET
        body = 'This message was deleted',
        file_id = NULL,
        file_name = NULL,
        mime_type = NULL,
        deleted_at = clock_timestamp(),
        deleted_by = auth.uid()
    WHERE id = p_message_id;
END;
$$;

REVOKE ALL ON FUNCTION
public.delete_message_for_everyone(uuid)
FROM PUBLIC;

GRANT EXECUTE ON FUNCTION
public.delete_message_for_everyone(uuid)
TO authenticated;

-- 7. Sync read status across devices.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'chat_user_state'
    ) THEN
        ALTER PUBLICATION supabase_realtime
        ADD TABLE public.chat_user_state;
    END IF;
END;
$$;

COMMIT;

NOTIFY pgrst, 'reload schema';
