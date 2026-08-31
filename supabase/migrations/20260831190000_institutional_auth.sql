CREATE TABLE "InstitutionalUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "memberId" TEXT,
    "govbrSubjectHash" TEXT NOT NULL,
    "cpfLast4" TEXT NOT NULL,
    "expectedCnpj" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "InstitutionalUser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstitutionalUser_accessLevel_check" CHECK ("accessLevel" IN ('ADMIN', 'OPERATOR', 'PARTICIPANT'))
);

CREATE TABLE "GovBrAuthAttempt" (
    "stateHash" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "codeVerifier" TEXT NOT NULL,
    "returnPath" TEXT NOT NULL DEFAULT '/',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GovBrAuthAttempt_pkey" PRIMARY KEY ("stateHash")
);

CREATE TABLE "AuthExchangeCode" (
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthExchangeCode_pkey" PRIMARY KEY ("codeHash")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "authMethod" TEXT NOT NULL DEFAULT 'GOVBR_X509_DEVICE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InstitutionalUser_govbrSubjectHash_key" ON "InstitutionalUser"("govbrSubjectHash");
CREATE INDEX "InstitutionalUser_memberId_idx" ON "InstitutionalUser"("memberId");
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

ALTER TABLE "InstitutionalUser" ADD CONSTRAINT "InstitutionalUser_memberId_fkey"
  FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AuthExchangeCode" ADD CONSTRAINT "AuthExchangeCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "InstitutionalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "InstitutionalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

