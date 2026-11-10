-- CreateEnum
CREATE TYPE "TaxRegime" AS ENUM ('SIMPLES_NACIONAL', 'LUCRO_REAL', 'LUCRO_PRESUMIDO', 'NAO_INFORMADO');

-- CreateEnum
CREATE TYPE "BranchType" AS ENUM ('HEADQUARTERS', 'BRANCH', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FilingStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'TRANSMITTED', 'COMPLETED', 'NOT_APPLICABLE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('CONNECTED', 'ATTENTION', 'DISCONNECTED', 'DISABLED', 'NO_STATUS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VALID', 'EXPIRING_SOON', 'EXPIRED', 'REVOKED', 'NO_CERTIFICATE', 'NO_STATUS', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TaskPriority" AS ENUM ('HIGH', 'MEDIUM', 'LOW', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('RECEIVED', 'REVIEWED', 'IMPORTED', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "automationGroup" TEXT,
ADD COLUMN     "branchType" "BranchType" NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN     "certificateSourceStatus" TEXT,
ADD COLUMN     "cnpjDisplay" TEXT,
ADD COLUMN     "inscricaoEstadual" TEXT,
ADD COLUMN     "questorCode" TEXT,
ADD COLUMN     "unecontSourceStatus" TEXT,
ADD COLUMN     "unit" TEXT,
ADD COLUMN     "zenQdriveSourceStatus" TEXT;

-- CreateTable
CREATE TABLE "CompanyGroup" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "importedAt" DATE,
    "closingDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroupMembership" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "validFrom" DATE,
    "validUntil" DATE,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyGroupMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Obligation" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "taxRegime" "TaxRegime",
    "dayOfMonth" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Obligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxFiling" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "competence" DATE NOT NULL,
    "status" "FilingStatus" NOT NULL DEFAULT 'UNKNOWN',
    "dueDate" DATE,
    "sourceRecordId" TEXT,
    "responsibleName" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxFiling_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalCertificate" (
    "id" TEXT NOT NULL,
    "companyId" TEXT,
    "sourceCnpj" TEXT,
    "certificateType" TEXT NOT NULL,
    "holderName" TEXT,
    "issuerName" TEXT,
    "serialNumber" TEXT,
    "validFrom" DATE,
    "validUntil" DATE,
    "status" "CertificateStatus" NOT NULL DEFAULT 'UNKNOWN',
    "statusAsOf" DATE,
    "observations" TEXT,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DigitalCertificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "integrationKey" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'NO_STATUS',
    "sourceStatus" TEXT,
    "lastSynchronizedAt" TIMESTAMP(3),
    "responsibleName" TEXT,
    "metadata" JSONB,
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "companyId" TEXT,
    "filingId" TEXT,
    "assigneeId" TEXT,
    "createdById" TEXT,
    "priority" "TaskPriority" NOT NULL DEFAULT 'UNKNOWN',
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "dueAt" DATE,
    "completedAt" TIMESTAMP(3),
    "sourceRecordId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "companyId" TEXT,
    "action" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "detail" TEXT,
    "beforeData" JSONB,
    "afterData" JSONB,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestId" TEXT,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("userId","roleId")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "AppSetting" (
    "id" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'global',
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportBatch" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSha256" TEXT,
    "sourceSystem" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'RECEIVED',
    "sourceAsOf" DATE,
    "importedById" TEXT,
    "rowCount" INTEGER,
    "errorSummary" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportSourceRecord" (
    "id" TEXT NOT NULL,
    "importBatchId" TEXT NOT NULL,
    "companyId" TEXT,
    "groupId" TEXT,
    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "section" TEXT,
    "rawValues" JSONB NOT NULL,
    "normalizedValues" JSONB,
    "formulas" JSONB,
    "sourceKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportSourceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroup_code_key" ON "CompanyGroup"("code");

-- CreateIndex
CREATE INDEX "CompanyGroup_name_idx" ON "CompanyGroup"("name");

-- CreateIndex
CREATE INDEX "CompanyGroupMembership_companyId_validFrom_idx" ON "CompanyGroupMembership"("companyId", "validFrom");

-- CreateIndex
CREATE INDEX "CompanyGroupMembership_groupId_validFrom_idx" ON "CompanyGroupMembership"("groupId", "validFrom");

-- CreateIndex
CREATE INDEX "CompanyGroupMembership_sourceRecordId_idx" ON "CompanyGroupMembership"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Obligation_code_key" ON "Obligation"("code");

-- CreateIndex
CREATE INDEX "Obligation_taxRegime_active_idx" ON "Obligation"("taxRegime", "active");

-- CreateIndex
CREATE INDEX "Obligation_name_idx" ON "Obligation"("name");

-- CreateIndex
CREATE INDEX "TaxFiling_competence_status_idx" ON "TaxFiling"("competence", "status");

-- CreateIndex
CREATE INDEX "TaxFiling_obligationId_competence_idx" ON "TaxFiling"("obligationId", "competence");

-- CreateIndex
CREATE INDEX "TaxFiling_dueDate_status_idx" ON "TaxFiling"("dueDate", "status");

-- CreateIndex
CREATE INDEX "TaxFiling_responsibleName_status_idx" ON "TaxFiling"("responsibleName", "status");

-- CreateIndex
CREATE INDEX "TaxFiling_sourceRecordId_idx" ON "TaxFiling"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxFiling_companyId_obligationId_competence_key" ON "TaxFiling"("companyId", "obligationId", "competence");

-- CreateIndex
CREATE INDEX "DigitalCertificate_companyId_validUntil_idx" ON "DigitalCertificate"("companyId", "validUntil");

-- CreateIndex
CREATE INDEX "DigitalCertificate_sourceCnpj_idx" ON "DigitalCertificate"("sourceCnpj");

-- CreateIndex
CREATE INDEX "DigitalCertificate_status_validUntil_idx" ON "DigitalCertificate"("status", "validUntil");

-- CreateIndex
CREATE INDEX "DigitalCertificate_sourceRecordId_idx" ON "DigitalCertificate"("sourceRecordId");

-- CreateIndex
CREATE INDEX "Integration_provider_status_idx" ON "Integration"("provider", "status");

-- CreateIndex
CREATE INDEX "Integration_companyId_status_idx" ON "Integration"("companyId", "status");

-- CreateIndex
CREATE INDEX "Integration_sourceRecordId_idx" ON "Integration"("sourceRecordId");

-- CreateIndex
CREATE UNIQUE INDEX "Integration_companyId_integrationKey_key" ON "Integration"("companyId", "integrationKey");

-- CreateIndex
CREATE INDEX "Task_status_dueAt_idx" ON "Task"("status", "dueAt");

-- CreateIndex
CREATE INDEX "Task_assigneeId_status_idx" ON "Task"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "Task_companyId_status_idx" ON "Task"("companyId", "status");

-- CreateIndex
CREATE INDEX "Task_filingId_idx" ON "Task"("filingId");

-- CreateIndex
CREATE INDEX "AuditLog_occurredAt_idx" ON "AuditLog"("occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_occurredAt_idx" ON "AuditLog"("actorId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_companyId_occurredAt_idx" ON "AuditLog"("companyId", "occurredAt");

-- CreateIndex
CREATE INDEX "AuditLog_module_action_occurredAt_idx" ON "AuditLog"("module", "action", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppUser_email_key" ON "AppUser"("email");

-- CreateIndex
CREATE INDEX "AppUser_isActive_name_idx" ON "AppUser"("isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Role_code_key" ON "Role"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_code_key" ON "Permission"("code");

-- CreateIndex
CREATE INDEX "UserRole_roleId_idx" ON "UserRole"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_permissionId_idx" ON "RolePermission"("permissionId");

-- CreateIndex
CREATE INDEX "AppSetting_updatedAt_idx" ON "AppSetting"("updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AppSetting_scope_key_key" ON "AppSetting"("scope", "key");

-- CreateIndex
CREATE INDEX "ImportBatch_fileSha256_idx" ON "ImportBatch"("fileSha256");

-- CreateIndex
CREATE INDEX "ImportBatch_status_createdAt_idx" ON "ImportBatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ImportBatch_sourceAsOf_idx" ON "ImportBatch"("sourceAsOf");

-- CreateIndex
CREATE INDEX "ImportSourceRecord_importBatchId_sheetName_rowNumber_idx" ON "ImportSourceRecord"("importBatchId", "sheetName", "rowNumber");

-- CreateIndex
CREATE INDEX "ImportSourceRecord_sheetName_rowNumber_idx" ON "ImportSourceRecord"("sheetName", "rowNumber");

-- CreateIndex
CREATE INDEX "ImportSourceRecord_companyId_sheetName_idx" ON "ImportSourceRecord"("companyId", "sheetName");

-- CreateIndex
CREATE INDEX "ImportSourceRecord_groupId_idx" ON "ImportSourceRecord"("groupId");

-- CreateIndex
CREATE INDEX "ImportSourceRecord_sourceKey_idx" ON "ImportSourceRecord"("sourceKey");

-- CreateIndex
CREATE INDEX "Company_razaoSocial_idx" ON "Company"("razaoSocial");

-- CreateIndex
CREATE INDEX "Company_regime_status_idx" ON "Company"("regime", "status");

-- CreateIndex
CREATE INDEX "Company_responsavel_idx" ON "Company"("responsavel");

-- CreateIndex
CREATE INDEX "Company_grupo_idx" ON "Company"("grupo");

-- CreateIndex
CREATE INDEX "Company_questorCode_idx" ON "Company"("questorCode");

-- AddForeignKey
ALTER TABLE "CompanyGroupMembership" ADD CONSTRAINT "CompanyGroupMembership_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMembership" ADD CONSTRAINT "CompanyGroupMembership_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompanyGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMembership" ADD CONSTRAINT "CompanyGroupMembership_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ImportSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFiling" ADD CONSTRAINT "TaxFiling_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFiling" ADD CONSTRAINT "TaxFiling_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "Obligation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxFiling" ADD CONSTRAINT "TaxFiling_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ImportSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalCertificate" ADD CONSTRAINT "DigitalCertificate_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalCertificate" ADD CONSTRAINT "DigitalCertificate_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ImportSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Integration" ADD CONSTRAINT "Integration_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ImportSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_filingId_fkey" FOREIGN KEY ("filingId") REFERENCES "TaxFiling"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_sourceRecordId_fkey" FOREIGN KEY ("sourceRecordId") REFERENCES "ImportSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "AppUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "Permission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppSetting" ADD CONSTRAINT "AppSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportBatch" ADD CONSTRAINT "ImportBatch_importedById_fkey" FOREIGN KEY ("importedById") REFERENCES "AppUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSourceRecord" ADD CONSTRAINT "ImportSourceRecord_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSourceRecord" ADD CONSTRAINT "ImportSourceRecord_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportSourceRecord" ADD CONSTRAINT "ImportSourceRecord_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CompanyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
