ALTER TABLE "InstitutionalUser"
  ADD COLUMN "emailNormalized" TEXT,
  ADD COLUMN "emailDisplay" TEXT;

ALTER TABLE "InstitutionalUser"
  ADD CONSTRAINT "InstitutionalUser_emailNormalized_check"
  CHECK ("emailNormalized" IS NULL OR "emailNormalized" = lower("emailNormalized"));

CREATE UNIQUE INDEX "InstitutionalUser_emailNormalized_key"
  ON "InstitutionalUser"("emailNormalized");

-- Reaproveita contas antigas cujo nome de usuário já era um endereço de e-mail.
UPDATE "InstitutionalUser"
SET "emailNormalized" = lower(trim("usernameDisplay")),
    "emailDisplay" = trim("usernameDisplay")
WHERE "emailNormalized" IS NULL
  AND "usernameDisplay" ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$';
