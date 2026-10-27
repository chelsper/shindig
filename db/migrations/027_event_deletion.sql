BEGIN;

-- Keep publication writes out of the gap between backfill and trigger install.
LOCK TABLE event_publications IN SHARE ROW EXCLUSIVE MODE;

-- Minimal receipts, not retained events: no titles, addresses, guest information,
-- snapshots or image paths. Keep old links from ever pointing to a new gathering.
CREATE TABLE IF NOT EXISTS event_public_link_reservations (
  public_alias text PRIMARY KEY,
  event_id uuid NOT NULL UNIQUE
);
INSERT INTO event_public_link_reservations(public_alias,event_id)
  SELECT public_alias,event_id FROM event_publications WHERE public_alias IS NOT NULL
  ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS event_deletions (
  event_id uuid PRIMARY KEY,
  owner_host_id text REFERENCES host_users(id) ON DELETE SET NULL,
  legacy_workspace boolean NOT NULL,
  public_alias text,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  artwork_cleanup_at timestamptz,
  CHECK (NOT legacy_workspace OR owner_host_id IS NULL)
);
CREATE INDEX IF NOT EXISTS event_deletions_pending_owner ON event_deletions(owner_host_id)
  WHERE artwork_cleanup_at IS NULL;

CREATE OR REPLACE FUNCTION shindig_reserve_event_link() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.public_alias IS NOT NULL THEN
    INSERT INTO event_public_link_reservations(public_alias,event_id)
      VALUES (NEW.public_alias,NEW.event_id) ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM event_public_link_reservations
      WHERE public_alias=NEW.public_alias AND event_id=NEW.event_id) THEN
      RAISE EXCEPTION 'Event link is unavailable' USING ERRCODE='23505', CONSTRAINT='event_publications_public_alias_key';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS event_publications_reserve_link ON event_publications;
CREATE TRIGGER event_publications_reserve_link BEFORE INSERT ON event_publications
  FOR EACH ROW EXECUTE FUNCTION shindig_reserve_event_link();

CREATE OR REPLACE FUNCTION shindig_reject_deleted_event_id() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('shindig-event:' || NEW.id::text,0));
  IF EXISTS (SELECT 1 FROM event_deletions WHERE event_id=NEW.id) THEN
    RAISE EXCEPTION 'Event key is no longer available' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_reject_deleted_id ON events;
CREATE TRIGGER events_reject_deleted_id BEFORE INSERT ON events
  FOR EACH ROW EXECUTE FUNCTION shindig_reject_deleted_event_id();

-- Owner identity comes only from the verified server session. Ordinary invoker
-- privileges, no SECURITY DEFINER, arbitrary table names, or public guest API.
CREATE OR REPLACE FUNCTION shindig_delete_owned_event(
  p_id uuid, p_owner text, p_title text, p_details integer,
  p_artwork integer, p_settings integer, p_publication integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE e events%ROWTYPE; p event_publications%ROWTYPE;
  art_revision integer; settings_revision integer; v_slug text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('shindig-event:' || p_id::text,0));
  SELECT * INTO e FROM events WHERE id=p_id
    AND owner_host_id IS NOT DISTINCT FROM p_owner FOR UPDATE;
  IF NOT FOUND THEN
    IF EXISTS (SELECT 1 FROM event_deletions WHERE event_id=p_id
      AND ((p_owner IS NULL AND legacy_workspace) OR owner_host_id=p_owner)) THEN
      RETURN jsonb_build_object('status','deleted');
    END IF;
    RETURN jsonb_build_object('status','missing');
  END IF;
  v_slug := 'event-' || p_id::text;
  -- Same contact-settings -> publication order as contact mutations.
  PERFORM 1 FROM event_contact_settings WHERE event_slug=v_slug FOR UPDATE;
  SELECT * INTO p FROM event_publications WHERE event_id=p_id FOR UPDATE;
  SELECT revision INTO art_revision FROM event_draft_artwork WHERE event_id=p_id FOR UPDATE;
  SELECT revision INTO settings_revision FROM event_draft_settings WHERE event_id=p_id FOR UPDATE;
  IF e.title IS DISTINCT FROM p_title OR e.revision IS DISTINCT FROM p_details
    OR coalesce(art_revision,0) IS DISTINCT FROM p_artwork
    OR coalesce(settings_revision,0) IS DISTINCT FROM p_settings
    OR coalesce(p.revision,0) IS DISTINCT FROM p_publication THEN
    RETURN jsonb_build_object('status','stale');
  END IF;
  INSERT INTO event_deletions(event_id,owner_host_id,legacy_workspace,public_alias)
    VALUES (p_id,e.owner_host_id,e.owner_host_id IS NULL,p.public_alias);
  -- Foreign keys prevent racing submissions from leaving orphan guest records.
  -- Any error rolls back every deletion and the receipt, leaving the event intact.
  DELETE FROM event_invitees WHERE event_slug=v_slug;
  DELETE FROM rsvps WHERE event_slug=v_slug; -- contacts cascade
  DELETE FROM event_contact_settings WHERE event_slug=v_slug;
  DELETE FROM playlist_suggestions WHERE event_slug=v_slug; -- applause cascades
  DELETE FROM event_questions WHERE event_slug=v_slug;
  DELETE FROM event_updates WHERE event_slug=v_slug;
  DELETE FROM poll_votes WHERE poll_id IN (SELECT id FROM polls WHERE event_slug=v_slug);
  DELETE FROM polls WHERE event_slug=v_slug; -- options cascade
  DELETE FROM potluck_claims WHERE event_slug=v_slug;
  DELETE FROM potluck_items WHERE event_slug=v_slug;
  DELETE FROM event_publications WHERE event_id=p_id;
  DELETE FROM event_draft_artwork WHERE event_id=p_id;
  DELETE FROM event_draft_settings WHERE event_id=p_id;
  DELETE FROM event_duplication_requests WHERE completed_event_id=p_id OR id=p_id;
  DELETE FROM event_data_scopes WHERE event_id=p_id AND event_data_scopes.slug=v_slug;
  DELETE FROM events WHERE id=p_id;
  RETURN jsonb_build_object('status','deleted');
END;
$$;
COMMIT;
