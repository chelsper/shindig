BEGIN;

ALTER TABLE event_draft_settings ADD COLUMN IF NOT EXISTS rsvp_deadline timestamptz;
ALTER TABLE event_draft_settings ADD COLUMN IF NOT EXISTS guest_capacity integer;
ALTER TABLE event_draft_settings DROP CONSTRAINT IF EXISTS event_draft_rsvp_deadline_check;
ALTER TABLE event_draft_settings ADD CONSTRAINT event_draft_rsvp_deadline_check CHECK
  (rsvp_deadline IS NULL OR (rsvp_deadline >= '2000-01-01Z'::timestamptz AND rsvp_deadline < '2100-01-01Z'::timestamptz AND date_trunc('minute', rsvp_deadline) = rsvp_deadline));
ALTER TABLE event_draft_settings DROP CONSTRAINT IF EXISTS event_draft_guest_capacity_check;
ALTER TABLE event_draft_settings ADD CONSTRAINT event_draft_guest_capacity_check CHECK (guest_capacity IS NULL OR guest_capacity BETWEEN 1 AND 10000);

-- Publication already takes a row lock. Guest and host RSVP writes take that
-- SAME lock before counting or changing attendance. The trigger runs AFTER the
-- publication write/lock, never in a pre-lock INSERT..ON CONFLICT check.
CREATE OR REPLACE FUNCTION shindig_check_published_rsvp_limits() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE cap integer; deadline timestamptz; total bigint;
BEGIN
  IF NEW.snapshot #>> '{settings,rsvp,capacity}' IS NOT NULL THEN
    IF jsonb_typeof(NEW.snapshot #> '{settings,rsvp,capacity}') <> 'number'
      OR (NEW.snapshot #>> '{settings,rsvp,capacity}') !~ '^[0-9]{1,5}$' THEN
      RAISE EXCEPTION 'Invalid RSVP capacity' USING ERRCODE = '23514', CONSTRAINT = 'event_capacity_invalid';
    END IF;
    cap := (NEW.snapshot #>> '{settings,rsvp,capacity}')::integer;
    IF cap NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Invalid RSVP capacity' USING ERRCODE = '23514', CONSTRAINT = 'event_capacity_invalid'; END IF;
    SELECT coalesce(sum(party_size) FILTER (WHERE attending), 0) INTO total FROM rsvps WHERE event_slug = NEW.slug;
    IF total > cap THEN RAISE EXCEPTION 'Capacity is below saved attendance' USING ERRCODE = '23514', CONSTRAINT = 'event_capacity_below_attendance'; END IF;
  END IF;
  IF NEW.snapshot #>> '{settings,rsvp,deadlineAtUtc}' IS NOT NULL THEN
    IF jsonb_typeof(NEW.snapshot #> '{settings,rsvp,deadlineAtUtc}') <> 'string'
      OR (NEW.snapshot #>> '{settings,rsvp,deadlineAtUtc}') !~ '^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:00\.000Z$' THEN
      RAISE EXCEPTION 'Invalid RSVP deadline' USING ERRCODE = '23514', CONSTRAINT = 'event_deadline_invalid';
    END IF;
    deadline := (NEW.snapshot #>> '{settings,rsvp,deadlineAtUtc}')::timestamptz;
    IF deadline > (NEW.snapshot #>> '{details,startsAtUtc}')::timestamptz THEN
      RAISE EXCEPTION 'Deadline is after the event start' USING ERRCODE = '23514', CONSTRAINT = 'event_deadline_after_start';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS event_publications_rsvp_limits ON event_publications;
CREATE TRIGGER event_publications_rsvp_limits AFTER INSERT OR UPDATE OF snapshot ON event_publications
  FOR EACH ROW EXECUTE FUNCTION shindig_check_published_rsvp_limits();

-- Called only through Shindig's server-only DAL. Guest clients have no database
-- access and cannot choose host operations. This is NOT a SECURITY DEFINER API.
-- VOLATILE statements obtain fresh READ COMMITTED snapshots after the lock wait;
-- do not replace this with a single CTE containing a pre-wait SUM snapshot.
CREATE OR REPLACE FUNCTION shindig_write_event_rsvp(
  p_event text, p_operation text, p_id uuid, p_edit_hash text,
  p_name text, p_attending boolean, p_party integer, p_visible boolean, p_comment text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE publication event_publications%ROWTYPE; saved rsvps%ROWTYPE;
  guest boolean; creating boolean; cap integer; deadline timestamptz;
  total bigint; previous_size integer := 0; next_size integer; outcome text;
BEGIN
  IF p_operation NOT IN ('guest-create','guest-update','host-create','host-update','host-delete') OR p_operation IS NULL
    OR p_event = 'oyster-roast-2026' THEN RETURN jsonb_build_object('status','invalid'); END IF;
  guest := p_operation LIKE 'guest-%'; creating := p_operation IN ('guest-create','host-create');
  SELECT * INTO publication FROM event_publications WHERE slug = p_event FOR UPDATE;
  IF NOT FOUND OR (guest AND publication.visibility <> 'published') THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF guest AND (p_edit_hash IS NULL OR p_edit_hash !~ '^[a-f0-9]{64}$') THEN RETURN jsonb_build_object('status','invalid'); END IF;

  IF p_operation = 'guest-update' THEN
    SELECT * INTO saved FROM rsvps WHERE event_slug = p_event AND edit_token_hash = p_edit_hash;
  ELSE
    SELECT * INTO saved FROM rsvps WHERE event_slug = p_event AND id = p_id;
  END IF;
  -- A same-key retry confirms the original write, even at capacity/after cutoff.
  -- It never rewrites the RSVP. Cross-event or differently owned keys fail closed.
  IF creating AND saved.id IS NOT NULL THEN
    IF (guest AND saved.edit_token_hash = p_edit_hash) OR
      (NOT guest AND saved.edit_token_hash IS NULL AND saved.guest_name = p_name AND saved.attending = p_attending
        AND saved.party_size IS NOT DISTINCT FROM p_party AND saved.display_on_guest_list = p_visible AND saved.comment IS NOT DISTINCT FROM p_comment) THEN
      outcome := 'duplicate';
    ELSE RETURN jsonb_build_object('status','conflict'); END IF;
  ELSIF NOT creating AND saved.id IS NULL THEN RETURN jsonb_build_object('status','missing');
  END IF;

  IF outcome IS NULL THEN
    IF p_operation = 'host-delete' THEN
      DELETE FROM rsvps WHERE id = saved.id AND event_slug = p_event;
      RETURN jsonb_build_object('status','deleted');
    END IF;
    IF guest THEN
      IF NOT publication.rsvps_open THEN RETURN jsonb_build_object('status','closed'); END IF;
      deadline := (publication.snapshot #>> '{settings,rsvp,deadlineAtUtc}')::timestamptz;
      IF deadline IS NOT NULL AND clock_timestamp() >= deadline THEN RETURN jsonb_build_object('status','deadline'); END IF;
    END IF;
    IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_attending IS NULL OR p_visible IS NULL
      OR (p_comment IS NOT NULL AND char_length(p_comment) > 1000)
      OR (p_attending AND (p_party IS NULL OR p_party NOT BETWEEN 1 AND 20 OR p_party > (publication.snapshot #>> '{settings,rsvp,maxPartySize}')::integer)) THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    IF NOT p_attending THEN p_party := NULL; p_visible := false; END IF;
    IF guest AND NOT (publication.snapshot #>> '{settings,rsvp,allowComments}')::boolean THEN p_comment := NULL; END IF;
    IF guest AND NOT (publication.snapshot #>> '{settings,features,guestList}')::boolean THEN p_visible := false; END IF;
    next_size := CASE WHEN p_attending THEN p_party ELSE 0 END;
    previous_size := CASE WHEN saved.attending THEN saved.party_size ELSE 0 END;
    cap := (publication.snapshot #>> '{settings,rsvp,capacity}')::integer;
    IF cap IS NOT NULL AND next_size > previous_size THEN
      SELECT coalesce(sum(party_size) FILTER (WHERE attending),0) INTO total FROM rsvps WHERE event_slug = p_event;
      IF total - previous_size + next_size > cap THEN RETURN jsonb_build_object('status','full'); END IF;
    END IF;
    IF creating THEN
      INSERT INTO rsvps (id,event_slug,guest_name,attending,party_size,display_on_guest_list,comment,edit_token_hash)
        VALUES (p_id,p_event,btrim(p_name),p_attending,p_party,p_visible,p_comment,CASE WHEN guest THEN p_edit_hash ELSE NULL END)
        ON CONFLICT (id) DO NOTHING RETURNING * INTO saved;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','conflict'); END IF;
      outcome := 'created';
    ELSE
      UPDATE rsvps SET guest_name=btrim(p_name), attending=p_attending, party_size=p_party, display_on_guest_list=p_visible,
        comment=p_comment, updated_at=clock_timestamp() WHERE id=saved.id AND event_slug=p_event RETURNING * INTO saved;
      outcome := 'updated';
    END IF;
  END IF;
  RETURN jsonb_build_object('status',outcome,'rsvp',jsonb_build_object('id',saved.id,'guestName',saved.guest_name,
    'attending',saved.attending,'partySize',saved.party_size,'displayOnGuestList',saved.display_on_guest_list,'comment',saved.comment));
END; $$;

-- No changes to legacy settings, snapshots, RSVP data, dates or capacity defaults.
COMMIT;
