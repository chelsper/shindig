BEGIN;

-- Opt-in contacts are intentionally separate from public RSVP projections.
-- Existing guests are NOT opted in, and no RSVP or event is rewritten.
CREATE TABLE IF NOT EXISTS event_contact_settings (
  event_slug text PRIMARY KEY REFERENCES event_data_scopes(slug),
  collection_closed boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS rsvp_contact_preferences (
  rsvp_id uuid PRIMARY KEY REFERENCES rsvps(id) ON DELETE CASCADE,
  email text,
  phone text,
  email_consented_at timestamptz,
  text_consented_at timestamptz,
  consent_version text NOT NULL DEFAULT 'event-updates-v1' CHECK (consent_version = 'event-updates-v1'),
  revision integer NOT NULL CHECK (revision > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((email IS NULL AND email_consented_at IS NULL) OR
    (email IS NOT NULL AND email_consented_at IS NOT NULL AND char_length(email) BETWEEN 3 AND 254 AND email !~ '[[:space:][:cntrl:]]' AND email LIKE '%@%.%')),
  CHECK ((phone IS NULL AND text_consented_at IS NULL) OR
    (phone IS NOT NULL AND text_consented_at IS NOT NULL AND phone ~ '^\+[1-9][0-9]{7,14}$'))
);

-- Only the server DAL calls these functions. No guest database access, no
-- SECURITY DEFINER. Lock order is contact settings -> publication -> RSVP.
-- Cleanup takes the same settings lock; an in-flight stale form cannot restore
-- contacts after cleanup. Revisions prevent stale tabs undoing a withdrawal.
CREATE OR REPLACE FUNCTION shindig_save_rsvp_contacts(p_event text, p_hash text, p_contacts jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE saved rsvps%ROWTYPE; previous rsvp_contact_preferences%ROWTYPE;
  stopped boolean; next_email text; next_phone text; expected integer; next_revision integer;
BEGIN
  IF p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','missing'); END IF;
  INSERT INTO event_contact_settings(event_slug) VALUES(p_event) ON CONFLICT DO NOTHING;
  SELECT collection_closed INTO stopped FROM event_contact_settings WHERE event_slug=p_event FOR UPDATE;
  IF p_event <> 'oyster-roast-2026' THEN
    PERFORM slug FROM event_publications WHERE slug=p_event AND visibility='published' FOR SHARE;
    IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
  END IF;
  SELECT * INTO saved FROM rsvps WHERE event_slug=p_event AND edit_token_hash=p_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF p_contacts IS NULL OR jsonb_typeof(p_contacts) <> 'object'
    OR jsonb_typeof(p_contacts->'revision') IS DISTINCT FROM 'number'
    OR (p_contacts->>'revision') !~ '^[0-9]{1,10}$'
    OR (p_contacts->>'revision')::bigint > 2147483646
    OR jsonb_typeof(p_contacts->'emailOptIn') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_contacts->'textOptIn') IS DISTINCT FROM 'boolean' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  expected := (p_contacts->>'revision')::integer;
  next_email := CASE WHEN (p_contacts->>'emailOptIn')::boolean THEN p_contacts->>'email' ELSE NULL END;
  next_phone := CASE WHEN (p_contacts->>'textOptIn')::boolean THEN p_contacts->>'phone' ELSE NULL END;
  IF ((p_contacts->>'emailOptIn')::boolean AND (jsonb_typeof(p_contacts->'email') IS DISTINCT FROM 'string' OR next_email IS NULL OR char_length(next_email) NOT BETWEEN 3 AND 254 OR next_email ~ '[[:space:][:cntrl:]]' OR next_email NOT LIKE '%@%.%'))
    OR ((p_contacts->>'textOptIn')::boolean AND (jsonb_typeof(p_contacts->'phone') IS DISTINCT FROM 'string' OR next_phone IS NULL OR next_phone !~ '^\+[1-9][0-9]{7,14}$')) THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  SELECT * INTO previous FROM rsvp_contact_preferences WHERE rsvp_id=saved.id;
  IF stopped THEN
    -- An ordinary RSVP can still save after cleanup if it supplies no contacts.
    IF next_email IS NOT NULL OR next_phone IS NOT NULL THEN RETURN jsonb_build_object('status','contacts-closed'); END IF;
    RETURN jsonb_build_object('status','saved','revision',0,'collectionClosed',true);
  END IF;
  IF expected <> coalesce(previous.revision,0) THEN
    -- A network retry of an already saved identical preference is harmless.
    IF previous.revision = expected + 1 AND previous.email IS NOT DISTINCT FROM next_email AND previous.phone IS NOT DISTINCT FROM next_phone THEN
      RETURN jsonb_build_object('status','saved','revision',previous.revision,'collectionClosed',false);
    END IF;
    RETURN jsonb_build_object('status','contacts-changed');
  END IF;
  next_revision := expected + 1;
  INSERT INTO rsvp_contact_preferences(rsvp_id,email,phone,email_consented_at,text_consented_at,revision)
    VALUES(saved.id,next_email,next_phone,
      CASE WHEN next_email IS NULL THEN NULL WHEN next_email IS NOT DISTINCT FROM previous.email THEN previous.email_consented_at ELSE clock_timestamp() END,
      CASE WHEN next_phone IS NULL THEN NULL WHEN next_phone IS NOT DISTINCT FROM previous.phone THEN previous.text_consented_at ELSE clock_timestamp() END,next_revision)
    ON CONFLICT(rsvp_id) DO UPDATE SET email=EXCLUDED.email,phone=EXCLUDED.phone,email_consented_at=EXCLUDED.email_consented_at,
      text_consented_at=EXCLUDED.text_consented_at,revision=EXCLUDED.revision,updated_at=clock_timestamp();
  RETURN jsonb_build_object('status','saved','revision',next_revision,'collectionClosed',false);
END; $$;

-- Atomic extension of the existing admission rules, not a replacement. A
-- contact conflict raises inside the statement so the RSVP also rolls back.
CREATE OR REPLACE FUNCTION shindig_write_guest_rsvp_with_contacts(
  p_event text,p_operation text,p_id uuid,p_hash text,p_name text,p_attending boolean,
  p_party integer,p_visible boolean,p_comment text,p_contacts jsonb
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE result jsonb; contacts jsonb; saved rsvps%ROWTYPE; outcome text;
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('guest-create','guest-update') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN jsonb_build_object('status','invalid');
  END IF;
  INSERT INTO event_contact_settings(event_slug) VALUES(p_event) ON CONFLICT DO NOTHING;
  PERFORM event_slug FROM event_contact_settings WHERE event_slug=p_event FOR UPDATE;
  IF p_event <> 'oyster-roast-2026' THEN
    result := shindig_write_event_rsvp(p_event,p_operation,p_id,p_hash,p_name,p_attending,p_party,p_visible,p_comment);
  ELSE
    IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_attending IS NULL OR p_visible IS NULL
      OR (p_attending AND (p_party IS NULL OR p_party NOT BETWEEN 1 AND 20)) OR char_length(p_comment)>1000 THEN
      RETURN jsonb_build_object('status','invalid');
    END IF;
    IF NOT p_attending THEN p_party:=NULL; p_visible:=false; END IF;
    IF p_operation='guest-create' THEN
      INSERT INTO rsvps(id,event_slug,guest_name,attending,party_size,display_on_guest_list,comment,edit_token_hash)
        VALUES(p_id,p_event,btrim(p_name),p_attending,p_party,p_visible,p_comment,p_hash)
        ON CONFLICT(id) DO NOTHING RETURNING * INTO saved;
      IF FOUND THEN outcome:='created';
      ELSE
        SELECT * INTO saved FROM rsvps WHERE id=p_id AND event_slug=p_event AND edit_token_hash=p_hash;
        IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
        outcome:='duplicate';
      END IF;
    ELSE
      UPDATE rsvps SET guest_name=btrim(p_name),attending=p_attending,party_size=p_party,display_on_guest_list=p_visible,
        comment=p_comment,updated_at=clock_timestamp() WHERE event_slug=p_event AND edit_token_hash=p_hash RETURNING * INTO saved;
      IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
      outcome:='updated';
    END IF;
    result:=jsonb_build_object('status',outcome,'rsvp',jsonb_build_object('id',saved.id,'guestName',saved.guest_name,
      'attending',saved.attending,'partySize',saved.party_size,'displayOnGuestList',saved.display_on_guest_list,'comment',saved.comment));
  END IF;
  -- Never replay original opt-ins on a duplicate CREATE (including after withdrawal).
  IF result->>'status' NOT IN ('created','updated') THEN RETURN result; END IF;
  contacts:=shindig_save_rsvp_contacts(p_event,p_hash,p_contacts);
  IF contacts->>'status' <> 'saved' THEN
    RAISE EXCEPTION 'Contact preferences could not be saved' USING ERRCODE='P0001', DETAIL=contacts->>'status';
  END IF;
  RETURN result || jsonb_build_object('contactPreferences',jsonb_build_object(
    'emailOptIn',(p_contacts->>'emailOptIn')::boolean,'textOptIn',(p_contacts->>'textOptIn')::boolean,
    'email',CASE WHEN (p_contacts->>'emailOptIn')::boolean THEN p_contacts->>'email' ELSE NULL END,
    'phone',CASE WHEN (p_contacts->>'textOptIn')::boolean THEN p_contacts->>'phone' ELSE NULL END,
    'revision',contacts->'revision','collectionClosed',contacts->'collectionClosed'));
END; $$;

CREATE OR REPLACE FUNCTION shindig_clear_event_contacts(p_event text) RETURNS void
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  INSERT INTO event_contact_settings(event_slug,collection_closed) VALUES(p_event,true)
    ON CONFLICT(event_slug) DO UPDATE SET collection_closed=true;
  DELETE FROM rsvp_contact_preferences WHERE rsvp_id IN (SELECT id FROM rsvps WHERE event_slug=p_event);
END; $$;
COMMIT;
