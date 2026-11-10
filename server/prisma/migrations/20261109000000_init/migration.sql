-- Initial schema for the fiscal control application.
-- Prepared locally only; this migration has not been applied to any database.
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "razaoSocial" TEXT NOT NULL,
    "nomeFantasia" TEXT,
    "cnpj" TEXT NOT NULL,
    "regime" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "cidade" TEXT,
    "uf" TEXT,
    "responsavel" TEXT,
    "email" TEXT,
    "telefone" TEXT,
    "vencimento" TIMESTAMP(3),
    "grupo" TEXT,
    "observacoes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");
