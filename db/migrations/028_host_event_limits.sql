BEGIN;

-- Admission only: no existing events, ownership, receipts or guest data change.
-- Both server-side INSERT paths call this inside the same SQL statement as the
-- insert. The trusted application supplies its configured limit and session
-- owner; this function is not a public API or a replacement for authorization.
CREATE OR REPLACE FUNCTION shindig_check_event_capacity(
  p_owner text, p_event uuid, p_limit integer
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY INVOKER
SET search_path = public, pg_temp AS $$
DECLARE v_count bigint;
BEGIN
  IF p_event IS NULL OR p_limit IS NULL OR p_limit < 1 OR p_limit > 1000 THEN
    RAISE EXCEPTION 'Invalid event admission request' USING ERRCODE = '22023';
  END IF;

  -- Shared by drafts and duplicates, including the separate legacy workspace.
  -- The lock lasts through INSERT/COMMIT, not just through the count. Separate
  -- PL/pgSQL statements take a fresh READ COMMITTED snapshot after a lock wait.
  PERFORM pg_advisory_xact_lock(hashtextextended('shindig-host-capacity:' ||
    CASE WHEN p_owner IS NULL THEN 'legacy' ELSE 'host:' || p_owner END, 0));

  -- An identical creation retry at the limit must still reach ON CONFLICT and
  -- the DAL's owned-record comparison. It cannot overwrite the saved event.
  IF EXISTS (SELECT 1 FROM events WHERE id = p_event
    AND owner_host_id IS NOT DISTINCT FROM p_owner) THEN
    RETURN true;
  END IF;
  SELECT count(*) INTO v_count FROM events
    WHERE owner_host_id IS NOT DISTINCT FROM p_owner;
  -- Count every stored event, regardless of publication or archive status.
  IF v_count >= p_limit THEN
    RAISE EXCEPTION 'Host event limit reached'
      USING ERRCODE = 'P0001', CONSTRAINT = 'shindig_host_event_limit';
  END IF;
  RETURN true;
END;
$$;

COMMIT;
