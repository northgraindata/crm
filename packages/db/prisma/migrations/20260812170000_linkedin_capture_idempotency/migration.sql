DO $$
DECLARE
  duplicate_keys INTEGER;
  duplicate_profiles TEXT;
BEGIN
  SELECT COUNT(*), STRING_AGG(profile_key || ' (' || occurrences || ')', ', ' ORDER BY profile_key)
  INTO duplicate_keys, duplicate_profiles
  FROM (
    SELECT
      LOWER(SUBSTRING("linkedinUrl" FROM '^https?://(?:www\.)?linkedin\.com/in/([^/?#]+)')) AS profile_key,
      COUNT(*) AS occurrences
    FROM "contact"
    WHERE "linkedinUrl" ~* '^https?://(?:www\.)?linkedin\.com/in/[^/?#]+'
    GROUP BY profile_key
    HAVING COUNT(*) > 1
  ) duplicates;

  IF duplicate_keys > 0 THEN
    RAISE EXCEPTION 'LinkedIn capture migration blocked: % duplicate canonical profile keys require manual CRM cleanup: %', duplicate_keys, duplicate_profiles;
  END IF;
END $$;

ALTER TABLE "contact" ADD COLUMN "linkedinKey" TEXT;

UPDATE "contact"
SET "linkedinKey" = LOWER(
  SUBSTRING("linkedinUrl" FROM '^https?://(?:www\.)?linkedin\.com/in/([^/?#]+)')
)
WHERE "linkedinUrl" ~* '^https?://(?:www\.)?linkedin\.com/in/[^/?#]+';

CREATE UNIQUE INDEX "contact_linkedinKey_key" ON "contact"("linkedinKey");
