ALTER TABLE "InstitutionalUser"
  ADD COLUMN "cpfHash" TEXT,
  ADD COLUMN "certificateIdentityName" TEXT,
  ADD COLUMN "identityVerifiedAt" TIMESTAMP(3);

CREATE INDEX "InstitutionalUser_cpfHash_idx" ON "InstitutionalUser"("cpfHash");

CREATE TABLE "CertificateCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "fingerprintLast8" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "cpfHash" TEXT,
    "certificateType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "issuerName" TEXT NOT NULL,
    "serialLast8" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "CertificateCredential_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CertificateCredential_type_check" CHECK ("certificateType" IN ('PF', 'PJ', 'UNKNOWN')),
    CONSTRAINT "CertificateCredential_status_check" CHECK ("status" IN ('ACTIVE', 'REVOKED'))
);

CREATE UNIQUE INDEX "CertificateCredential_fingerprintHash_key" ON "CertificateCredential"("fingerprintHash");
CREATE INDEX "CertificateCredential_userId_idx" ON "CertificateCredential"("userId");
CREATE INDEX "CertificateCredential_cpfHash_idx" ON "CertificateCredential"("cpfHash");

ALTER TABLE "CertificateCredential" ADD CONSTRAINT "CertificateCredential_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "InstitutionalUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mantém compatibilidade com certificados cadastrados antes desta migração.
INSERT INTO "CertificateCredential"
  ("id", "userId", "fingerprintHash", "fingerprintLast8", "subjectName", "certificateType",
   "issuerName", "serialLast8", "status", "createdAt", "lastUsedAt")
SELECT
  concat(id, ':legacy-certificate'), id, "certificateFingerprintHash",
  coalesce("certificateFingerprintLast8", 'LEGACY'), name, 'UNKNOWN',
  'Cadastro anterior', coalesce("certificateFingerprintLast8", 'LEGACY'), 'ACTIVE',
  "createdAt", "lastLoginAt"
FROM "InstitutionalUser"
WHERE "certificateFingerprintHash" IS NOT NULL
ON CONFLICT ("fingerprintHash") DO NOTHING;

CREATE TABLE "CertificateEnrollment" (
    "id" TEXT NOT NULL,
    "publicCodeHash" TEXT NOT NULL,
    "fingerprintHash" TEXT NOT NULL,
    "fingerprintLast8" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "cpfHash" TEXT,
    "documentLast2" TEXT,
    "certificateType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "legalEntityName" TEXT,
    "issuerName" TEXT NOT NULL,
    "serialLast8" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "linkedUserId" TEXT,
    CONSTRAINT "CertificateEnrollment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CertificateEnrollment_type_check" CHECK ("certificateType" IN ('PF', 'PJ', 'UNKNOWN')),
    CONSTRAINT "CertificateEnrollment_status_check" CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED'))
);

CREATE UNIQUE INDEX "CertificateEnrollment_publicCodeHash_key" ON "CertificateEnrollment"("publicCodeHash");
CREATE UNIQUE INDEX "CertificateEnrollment_fingerprintHash_key" ON "CertificateEnrollment"("fingerprintHash");
CREATE INDEX "CertificateEnrollment_status_createdAt_idx" ON "CertificateEnrollment"("status", "createdAt");

ALTER TABLE "CertificateEnrollment" ADD CONSTRAINT "CertificateEnrollment_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "InstitutionalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CertificateEnrollment" ADD CONSTRAINT "CertificateEnrollment_linkedUserId_fkey"
  FOREIGN KEY ("linkedUserId") REFERENCES "InstitutionalUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

