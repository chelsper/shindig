BEGIN;

-- No existing RSVPs are merged or changed by installing this migration.
-- These private receipts contain no names, comments or raw bearer tokens.
CREATE TABLE IF NOT EXISTS rsvp_merge_retirements (
  retired_id uuid PRIMARY KEY,
  event_slug text NOT NULL,
  retained_id uuid NOT NULL,
  retired_edit_token_hash text CHECK (retired_edit_token_hash IS NULL OR retired_edit_token_hash ~ '^[a-f0-9]{64}$'),
  merged_at timestamptz NOT NULL DEFAULT now(),
  CHECK (retired_id <> retained_id),
  FOREIGN KEY (event_slug, retained_id) REFERENCES rsvps(event_slug,id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS rsvp_merge_retired_hash ON rsvp_merge_retirements(retired_edit_token_hash) WHERE retired_edit_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS rsvp_merge_retained_idx ON rsvp_merge_retirements(retained_id);
CREATE TABLE IF NOT EXISTS rsvp_duplicate_dismissals (
  event_slug text NOT NULL, first_id uuid NOT NULL, second_id uuid NOT NULL,
  first_version text NOT NULL, second_version text NOT NULL,
  CHECK (first_id < second_id),
  PRIMARY KEY (event_slug,first_id,second_id),
  FOREIGN KEY (event_slug,first_id) REFERENCES rsvps(event_slug,id) ON DELETE CASCADE,
  FOREIGN KEY (event_slug,second_id) REFERENCES rsvps(event_slug,id) ON DELETE CASCADE
);

-- Version includes RSVP, consent and tracker state. MD5 is only an optimistic
-- concurrency checksum; host authorization is enforced independently in the DAL.
CREATE OR REPLACE FUNCTION shindig_rsvp_review_version(p_id uuid) RETURNS text
LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $$
  SELECT md5(to_jsonb(r)::text || coalesce(to_jsonb(c)::text,'null') || coalesce(to_jsonb(i)::text,'null'))
    FROM rsvps r LEFT JOIN rsvp_contact_preferences c ON c.rsvp_id=r.id
    LEFT JOIN event_invitees i ON i.rsvp_id=r.id AND i.event_slug=r.event_slug WHERE r.id=p_id
$$;

-- Retired CREATE retries must not resurrect an older RSVP after a merge.
-- Shared per-ID/token locks also cover the original legacy INSERT path.
CREATE OR REPLACE FUNCTION shindig_reject_retired_rsvp() RETURNS trigger
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('shindig-rsvp-id:' || NEW.id::text,0));
  IF NEW.edit_token_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('shindig-rsvp-hash:' || NEW.edit_token_hash,0));
  END IF;
  IF EXISTS (SELECT 1 FROM rsvp_merge_retirements WHERE retired_id=NEW.id OR retired_edit_token_hash=NEW.edit_token_hash) THEN
    RAISE EXCEPTION 'This RSVP was merged; use the most recent update link' USING ERRCODE='23514',CONSTRAINT='rsvp_retired';
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS rsvps_reject_retired ON rsvps;
CREATE TRIGGER rsvps_reject_retired BEFORE INSERT ON rsvps FOR EACH ROW EXECUTE FUNCTION shindig_reject_retired_rsvp();

CREATE OR REPLACE FUNCTION shindig_review_rsvp_duplicate(
  p_event text,p_older uuid,p_latest uuid,p_older_version text,p_latest_version text,p_action text
) RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE older rsvps%ROWTYPE; latest rsvps%ROWTYPE; old_contact rsvp_contact_preferences%ROWTYPE;
  new_contact rsvp_contact_preferences%ROWTYPE; closed boolean; links integer; v_id uuid;
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('merge','separate') OR p_older IS NULL OR p_latest IS NULL OR p_older=p_latest THEN RETURN 'invalid'; END IF;
  -- Match contact/lifecycle lock order. All capacity-sensitive writes take the
  -- publication lock; a merge can only decrease or preserve saved attendance.
  INSERT INTO event_contact_settings(event_slug) VALUES(p_event) ON CONFLICT DO NOTHING;
  SELECT collection_closed INTO closed FROM event_contact_settings WHERE event_slug=p_event FOR UPDATE;
  IF p_event <> 'oyster-roast-2026' THEN
    PERFORM slug FROM event_publications WHERE slug=p_event FOR UPDATE;
    IF NOT FOUND THEN RETURN 'missing'; END IF;
  END IF;
  FOR v_id IN SELECT unnest(ARRAY[p_older,p_latest]) ORDER BY 1 LOOP
    PERFORM pg_advisory_xact_lock(hashtextextended('shindig-rsvp-id:' || v_id::text,0));
  END LOOP;
  PERFORM id FROM rsvps WHERE event_slug=p_event AND id IN (p_older,p_latest) ORDER BY id FOR UPDATE;
  SELECT * INTO older FROM rsvps WHERE event_slug=p_event AND id=p_older;
  SELECT * INTO latest FROM rsvps WHERE event_slug=p_event AND id=p_latest;
  IF older.id IS NULL OR latest.id IS NULL THEN
    IF p_action='merge' AND EXISTS (SELECT 1 FROM rsvp_merge_retirements WHERE event_slug=p_event AND retired_id=p_older AND retained_id=p_latest) THEN RETURN 'merged'; END IF;
    RETURN 'missing';
  END IF;
  PERFORM id FROM event_invitees WHERE event_slug=p_event AND rsvp_id IN (p_older,p_latest) ORDER BY id FOR UPDATE;
  IF shindig_rsvp_review_version(p_older) IS DISTINCT FROM p_older_version OR shindig_rsvp_review_version(p_latest) IS DISTINCT FROM p_latest_version THEN RETURN 'stale'; END IF;
  IF p_action='separate' THEN
    INSERT INTO rsvp_duplicate_dismissals(event_slug,first_id,second_id,first_version,second_version)
      VALUES(p_event,least(p_older,p_latest),greatest(p_older,p_latest),
        CASE WHEN p_older<p_latest THEN p_older_version ELSE p_latest_version END,
        CASE WHEN p_older<p_latest THEN p_latest_version ELSE p_older_version END)
      ON CONFLICT(event_slug,first_id,second_id) DO UPDATE SET first_version=EXCLUDED.first_version,second_version=EXCLUDED.second_version;
    RETURN 'separate';
  END IF;
  IF (older.updated_at,older.created_at,older.id) > (latest.updated_at,latest.created_at,latest.id) THEN RETURN 'stale'; END IF;
  SELECT count(*) INTO links FROM event_invitees WHERE event_slug=p_event AND rsvp_id IN (p_older,p_latest);
  IF links>1 THEN RETURN 'linked'; END IF;
  IF older.edit_token_hash IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('shindig-rsvp-hash:' || older.edit_token_hash,0));
  END IF;
  SELECT * INTO old_contact FROM rsvp_contact_preferences WHERE rsvp_id=p_older;
  SELECT * INTO new_contact FROM rsvp_contact_preferences WHERE rsvp_id=p_latest;
  -- Never copy an old opt-in forward. If consent changed on the older record
  -- more recently, clear the surviving preferences conservatively. Advance the
  -- revision even when unchanged so open, pre-merge forms cannot replay consent.
  IF closed OR (old_contact.updated_at IS NOT NULL AND (new_contact.updated_at IS NULL OR old_contact.updated_at>new_contact.updated_at)) THEN
    new_contact.email:=NULL; new_contact.phone:=NULL; new_contact.email_consented_at:=NULL; new_contact.text_consented_at:=NULL;
  END IF;
  IF coalesce(new_contact.revision,0)>=2147483647 OR coalesce(old_contact.revision,0)>=2147483647 THEN RETURN 'stale'; END IF;
  INSERT INTO rsvp_contact_preferences(rsvp_id,email,phone,email_consented_at,text_consented_at,revision)
    VALUES(p_latest,new_contact.email,new_contact.phone,new_contact.email_consented_at,new_contact.text_consented_at,
      greatest(coalesce(new_contact.revision,0),coalesce(old_contact.revision,0))+1)
    ON CONFLICT(rsvp_id) DO UPDATE SET email=EXCLUDED.email,phone=EXCLUDED.phone,email_consented_at=EXCLUDED.email_consented_at,
      text_consented_at=EXCLUDED.text_consented_at,revision=EXCLUDED.revision,updated_at=clock_timestamp();
  UPDATE event_invitees SET rsvp_id=p_latest,revision=revision+1,updated_at=clock_timestamp() WHERE event_slug=p_event AND rsvp_id=p_older;
  UPDATE rsvp_merge_retirements SET retained_id=p_latest WHERE event_slug=p_event AND retained_id=p_older;
  INSERT INTO rsvp_merge_retirements(retired_id,event_slug,retained_id,retired_edit_token_hash) VALUES(p_older,p_event,p_latest,older.edit_token_hash);
  DELETE FROM rsvps WHERE event_slug=p_event AND id=p_older;
  UPDATE rsvps SET party_size=CASE WHEN attending THEN party_size ELSE NULL END,
    display_on_guest_list=attending AND display_on_guest_list,updated_at=clock_timestamp() WHERE event_slug=p_event AND id=p_latest;
  RETURN 'merged';
END; $$;
COMMIT;
