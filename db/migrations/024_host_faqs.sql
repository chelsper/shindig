BEGIN;

-- Existing guest submissions keep their origin, answers and visibility.
-- FAQs share the same public projection/publication gates as guest Q&A.
ALTER TABLE event_questions ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'guest';
ALTER TABLE event_questions ADD COLUMN IF NOT EXISTS faq_revision INTEGER NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'event_questions_source_check' AND conrelid = 'event_questions'::regclass) THEN
    ALTER TABLE event_questions ADD CONSTRAINT event_questions_source_check CHECK (
      source IN ('guest', 'host') AND faq_revision > 0
      AND (source = 'guest' OR (guest_name IS NULL AND answer IS NOT NULL))
    );
  END IF;
END $$;

COMMIT;
