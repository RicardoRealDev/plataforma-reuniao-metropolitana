CREATE TABLE "InstitutionalUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "function" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'PARTICIPANT',
    "memberId" TEXT,
    "certificateFingerprintHash" TEXT,
    "certificateFingerprintLast8" TEXT,
    "usernameHash" TEXT,
    "usernameDisplay" TEXT,
    "passwordSalt" TEXT,
    "passwordHash" TEXT,
    "passwordIterations" INTEGER,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "InstitutionalUser_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "InstitutionalUser_accessLevel_check" CHECK ("accessLevel" IN ('ADMIN', 'OPERATOR', 'PARTICIPANT'))
);

CREATE TABLE "MtlsGatewayRequest" (
    "requestId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MtlsGatewayRequest_pkey" PRIMARY KEY ("requestId")
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
    "authMethod" TEXT NOT NULL DEFAULT 'ICPBRASIL_MTLS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PasswordLoginGuard" (
    "usernameHash" TEXT NOT NULL,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PasswordLoginGuard_pkey" PRIMARY KEY ("usernameHash")
);

CREATE UNIQUE INDEX "InstitutionalUser_certificateFingerprintHash_key" ON "InstitutionalUser"("certificateFingerprintHash");
CREATE UNIQUE INDEX "InstitutionalUser_usernameHash_key" ON "InstitutionalUser"("usernameHash");
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
