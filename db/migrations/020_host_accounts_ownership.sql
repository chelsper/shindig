BEGIN;

-- Better Auth core schema, namespaced away from event/guest data. No seeded
-- identities, automatic claims, or changes to the existing Oyster Roast.
CREATE TABLE IF NOT EXISTS host_users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  "emailVerified" boolean NOT NULL DEFAULT false,
  image text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS host_sessions (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES host_users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  "expiresAt" timestamptz NOT NULL,
  "ipAddress" text,
  "userAgent" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_sessions_user_idx ON host_sessions ("userId");
CREATE INDEX IF NOT EXISTS host_sessions_expiry_idx ON host_sessions ("expiresAt");
CREATE TABLE IF NOT EXISTS host_accounts (
  id text PRIMARY KEY,
  "userId" text NOT NULL REFERENCES host_users(id) ON DELETE CASCADE,
  "accountId" text NOT NULL,
  "providerId" text NOT NULL,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("providerId", "accountId")
);
CREATE INDEX IF NOT EXISTS host_accounts_user_idx ON host_accounts ("userId");
CREATE TABLE IF NOT EXISTS host_verifications (
  id text PRIMARY KEY,
  identifier text NOT NULL,
  value text NOT NULL,
  "expiresAt" timestamptz NOT NULL,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS host_verifications_identifier_idx ON host_verifications (identifier);
CREATE TABLE IF NOT EXISTS host_auth_rate_limits (
  id text PRIMARY KEY,
  key text NOT NULL UNIQUE,
  count integer NOT NULL,
  "lastRequest" bigint NOT NULL
);

-- NULL means the existing password-protected workspace, never "claimable".
-- Ownership is bound by the server on creation, and immutable afterward.
ALTER TABLE events ADD COLUMN IF NOT EXISTS owner_host_id text REFERENCES host_users(id) ON DELETE RESTRICT;
ALTER TABLE event_duplication_requests ADD COLUMN IF NOT EXISTS owner_host_id text REFERENCES host_users(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS events_owner_updated_idx ON events (owner_host_id, updated_at DESC, id);
CREATE INDEX IF NOT EXISTS event_duplication_owner_idx ON event_duplication_requests (owner_host_id);

CREATE OR REPLACE FUNCTION shindig_keep_event_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.owner_host_id IS DISTINCT FROM NEW.owner_host_id THEN
    RAISE EXCEPTION 'Event ownership cannot be changed.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS events_owner_immutable ON events;
CREATE TRIGGER events_owner_immutable BEFORE UPDATE OF owner_host_id ON events
  FOR EACH ROW EXECUTE FUNCTION shindig_keep_event_owner();
DROP TRIGGER IF EXISTS duplication_owner_immutable ON event_duplication_requests;
CREATE TRIGGER duplication_owner_immutable BEFORE UPDATE OF owner_host_id ON event_duplication_requests
  FOR EACH ROW EXECUTE FUNCTION shindig_keep_event_owner();
COMMIT;
