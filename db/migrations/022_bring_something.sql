BEGIN;
-- Additive only: no seeded items, claims, or changes to published feature flags.
ALTER TABLE event_draft_settings DROP CONSTRAINT IF EXISTS event_draft_features_shape;
ALTER TABLE event_draft_settings ADD CONSTRAINT event_draft_features_shape CHECK (
  jsonb_typeof(features) = 'object'
  AND features ?& ARRAY['guestList','playlist','weather','questions','updates','polls','photos','potluck']
  AND features - ARRAY['guestList','playlist','weather','questions','updates','polls','photos','potluck'] = '{}'::jsonb
  AND jsonb_typeof(features->'guestList') = 'boolean' AND jsonb_typeof(features->'playlist') = 'boolean'
  AND jsonb_typeof(features->'weather') = 'boolean' AND jsonb_typeof(features->'questions') = 'boolean'
  AND jsonb_typeof(features->'updates') = 'boolean' AND jsonb_typeof(features->'polls') = 'boolean'
  AND features->'photos' = 'false'::jsonb AND jsonb_typeof(features->'potluck') = 'boolean'
);
CREATE TABLE IF NOT EXISTS potluck_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key uuid NOT NULL UNIQUE,
  event_slug text NOT NULL REFERENCES event_data_scopes(slug),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 100),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 500),
  needed integer NOT NULL CHECK (needed BETWEEN 1 AND 100),
  archived boolean NOT NULL DEFAULT false,
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(id, event_slug)
);
CREATE INDEX IF NOT EXISTS potluck_items_event ON potluck_items(event_slug, created_at);
CREATE TABLE IF NOT EXISTS potluck_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_slug text NOT NULL REFERENCES event_data_scopes(slug), item_id uuid NOT NULL,
  edit_token_hash text NOT NULL CHECK (edit_token_hash ~ '^[a-f0-9]{64}$'),
  requester_hash text NOT NULL CHECK (requester_hash ~ '^[a-f0-9]{64}$'),
  guest_name text NOT NULL CHECK (char_length(btrim(guest_name)) BETWEEN 1 AND 120),
  quantity integer NOT NULL CHECK (quantity BETWEEN 0 AND 20),
  revision integer NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY(item_id, event_slug) REFERENCES potluck_items(id, event_slug),
  UNIQUE(event_slug, edit_token_hash)
);
CREATE INDEX IF NOT EXISTS potluck_claims_item ON potluck_claims(item_id);
CREATE INDEX IF NOT EXISTS potluck_claims_requester ON potluck_claims(event_slug, requester_hash, created_at);

-- All writers lock the SAME publication row before reading totals. VOLATILE
-- statements take a fresh READ COMMITTED snapshot after a concurrent lock wait.
-- Server-only callers supply host operations after session/ownership checks;
-- these functions are SECURITY INVOKER, never a public database authorization API.
CREATE OR REPLACE FUNCTION shindig_save_potluck_item(p_event text, p_key uuid, p_title text, p_note text, p_needed integer, p_archived boolean, p_revision integer)
RETURNS text LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE item potluck_items%ROWTYPE; total bigint;
BEGIN
  PERFORM 1 FROM event_publications WHERE slug=p_event FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF p_key IS NULL OR p_title IS NULL OR char_length(btrim(p_title)) NOT BETWEEN 1 AND 100 OR p_note IS NULL OR char_length(p_note)>500
    OR p_needed IS NULL OR p_needed NOT BETWEEN 1 AND 100 OR p_archived IS NULL OR p_revision IS NULL OR p_revision<0 THEN RETURN 'invalid'; END IF;
  SELECT * INTO item FROM potluck_items WHERE event_slug=p_event AND public_key=p_key;
  IF p_revision=0 AND item.id IS NULL THEN
    IF (SELECT count(*) FROM potluck_items WHERE event_slug=p_event)>=50 THEN RETURN 'limit'; END IF;
    INSERT INTO potluck_items(public_key,event_slug,title,note,needed,archived) VALUES(p_key,p_event,btrim(p_title),btrim(p_note),p_needed,p_archived)
      ON CONFLICT(public_key) DO NOTHING;
    IF NOT FOUND THEN RETURN 'conflict'; END IF;
    RETURN 'saved';
  END IF;
  IF item.id IS NULL THEN RETURN 'missing'; END IF;
  IF item.revision=p_revision+1 AND item.title=btrim(p_title) AND item.note=btrim(p_note) AND item.needed=p_needed AND item.archived=p_archived THEN RETURN 'saved'; END IF;
  IF item.revision<>p_revision THEN RETURN 'conflict'; END IF;
  SELECT coalesce(sum(quantity),0) INTO total FROM potluck_claims WHERE item_id=item.id;
  IF p_needed<total THEN RETURN 'below_claimed'; END IF;
  UPDATE potluck_items SET title=btrim(p_title),note=btrim(p_note),needed=p_needed,archived=p_archived,revision=revision+1,updated_at=clock_timestamp() WHERE id=item.id;
  RETURN 'saved';
END; $$;

CREATE OR REPLACE FUNCTION shindig_claim_potluck(p_event text, p_operation text, p_key uuid, p_hash text, p_requester text, p_name text, p_quantity integer, p_revision integer)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
DECLARE publication event_publications%ROWTYPE; item potluck_items%ROWTYPE; claim potluck_claims%ROWTYPE; total bigint;
BEGIN
  IF p_operation IS NULL OR p_operation NOT IN ('create','update','cancel') OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR p_revision IS NULL OR p_revision<0 THEN RETURN jsonb_build_object('status','invalid'); END IF;
  SELECT * INTO publication FROM event_publications WHERE slug=p_event FOR UPDATE;
  IF NOT FOUND OR publication.visibility<>'published' OR coalesce(publication.snapshot #>> '{settings,features,potluck}','false')<>'true' THEN RETURN jsonb_build_object('status','missing'); END IF;
  SELECT * INTO item FROM potluck_items WHERE event_slug=p_event AND public_key=p_key;
  IF NOT FOUND THEN RETURN jsonb_build_object('status','missing'); END IF;
  SELECT * INTO claim FROM potluck_claims WHERE event_slug=p_event AND edit_token_hash=p_hash;
  IF claim.id IS NOT NULL AND claim.item_id<>item.id THEN RETURN jsonb_build_object('status','conflict'); END IF;
  IF p_operation='cancel' THEN p_quantity:=0; p_name:=claim.guest_name; END IF;
  IF p_name IS NULL OR char_length(btrim(p_name)) NOT BETWEEN 1 AND 120 OR p_quantity IS NULL
    OR (p_operation<>'cancel' AND p_quantity NOT BETWEEN 1 AND 20) THEN RETURN jsonb_build_object('status','invalid'); END IF;
  IF p_operation='create' AND claim.id IS NOT NULL THEN
    IF claim.guest_name<>btrim(p_name) OR claim.quantity<>p_quantity THEN RETURN jsonb_build_object('status','conflict'); END IF;
  ELSIF p_operation<>'create' AND claim.id IS NULL THEN RETURN jsonb_build_object('status','missing');
  ELSIF claim.id IS NOT NULL AND claim.revision=p_revision+1 AND claim.guest_name=btrim(p_name) AND claim.quantity=p_quantity THEN NULL;
  ELSE
    IF (p_operation='create' AND p_revision<>0) OR (claim.id IS NOT NULL AND claim.revision<>p_revision) THEN RETURN jsonb_build_object('status','conflict'); END IF;
    IF item.archived AND p_operation<>'cancel' THEN RETURN jsonb_build_object('status','closed'); END IF;
    SELECT coalesce(sum(quantity),0) INTO total FROM potluck_claims WHERE item_id=item.id;
    IF total-coalesce(claim.quantity,0)+p_quantity>item.needed THEN RETURN jsonb_build_object('status','full'); END IF;
    IF p_operation='create' THEN
      IF p_requester IS NULL OR p_requester !~ '^[a-f0-9]{64}$' THEN RETURN jsonb_build_object('status','invalid'); END IF;
      IF (SELECT count(*) FROM potluck_claims WHERE event_slug=p_event AND requester_hash=p_requester AND created_at>clock_timestamp()-interval '60 seconds')>=10 THEN RETURN jsonb_build_object('status','throttled'); END IF;
      INSERT INTO potluck_claims(event_slug,item_id,edit_token_hash,requester_hash,guest_name,quantity) VALUES(p_event,item.id,p_hash,p_requester,btrim(p_name),p_quantity) RETURNING * INTO claim;
    ELSE
      UPDATE potluck_claims SET guest_name=btrim(p_name),quantity=p_quantity,revision=revision+1,updated_at=clock_timestamp() WHERE id=claim.id RETURNING * INTO claim;
    END IF;
  END IF;
  RETURN jsonb_build_object('status','saved','claim',jsonb_build_object('itemKey',item.public_key,'title',item.title,'guestName',claim.guest_name,'quantity',claim.quantity,'revision',claim.revision,'archived',item.archived));
END; $$;

CREATE OR REPLACE FUNCTION shindig_release_potluck_claim(p_event text, p_id uuid) RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM event_publications WHERE slug=p_event FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE potluck_claims SET quantity=0,revision=revision+1,updated_at=clock_timestamp() WHERE event_slug=p_event AND id=p_id AND quantity>0;
  RETURN true;
END; $$;
COMMIT;
