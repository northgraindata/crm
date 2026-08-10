INSERT INTO "fieldDefinition" ("id", "entity", "key", "label", "type", "agentFilled", "agentBrief", "position", "updatedAt")
VALUES
  ('system-contact-linkedin-headline', 'CONTACT', 'linkedin_headline', 'LinkedIn headline', 'TEXT', false, 'Preserve the public headline captured from the LinkedIn profile.', 106, NOW()),
  ('system-contact-linkedin-location', 'CONTACT', 'linkedin_location', 'LinkedIn location', 'TEXT', false, 'Preserve the public location captured from the LinkedIn profile.', 107, NOW())
ON CONFLICT ("entity", "key") DO NOTHING;
