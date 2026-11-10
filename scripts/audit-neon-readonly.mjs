import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma, PrismaClient } from '@prisma/client'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PREVIEW_PATH = path.join(ROOT, 'imports/processed/november-2026.preview.json')
const MAPPING_PATH = path.join(ROOT, 'imports/processed/november-2026.mapping.json')
const AMBIGUOUS_QUESTOR_ROWS = new Set([135, 154, 157, 169, 170, 273, 274, 275, 276])
const COMPANY_FIELDS = [
  'id', 'razaoSocial', 'nomeFantasia', 'cnpj', 'regime', 'status', 'cidade', 'uf',
  'vencimento', 'grupo', 'automationGroup', 'branchType', 'certificateSourceStatus',
  'cnpjDisplay', 'inscricaoEstadual', 'questorCode', 'unecontSourceStatus', 'unit',
  'zenQdriveSourceStatus',
]

export function safeTlsPreflight(databaseUrl) {
  if (!databaseUrl) return { ok: false, reason: 'DATABASE_URL ausente' }
  let url
  try { url = new URL(databaseUrl) } catch { return { ok: false, reason: 'DATABASE_URL inválida' } }
  const params = url.searchParams
  const ok = url.protocol === 'postgresql:' &&
    params.get('sslmode') === 'require' &&
    params.get('sslaccept') === 'strict' &&
    params.get('channel_binding') === 'require' &&
    !/accept_invalid_certs/i.test(databaseUrl)
  return { ok, reason: ok ? null : 'TLS estrito e channel binding obrigatório não comprovados na configuração' }
}

export function loadAuthorizedPreview(preview, mapping) {
  if (preview?.previewOnly !== true || preview?.source?.sheet !== 'SN, LR e LP - 112026' ||
      mapping?.source?.sheetName !== 'SN, LR e LP - 112026' || preview?.records?.length !== 367) {
    throw new Error('Prévia/mapeamento não correspondem ao escopo aprovado')
  }
  const records = preview.records
  const cnpjs = records.map(record => record?.company?.cnpj)
  if (records.some(record => record?.source?.sheetName !== 'SN, LR e LP - 112026' ||
      record?.cnpjValid !== true || !/^\d{14}$/.test(record?.operationalKey?.value ?? '') ||
      record.operationalKey.value !== record.company.cnpj) || new Set(cnpjs).size !== 367) {
    throw new Error('A allowlist de CNPJs é inválida')
  }
  return records
}

export function maskCnpj(cnpj) {
  return `${String(cnpj).slice(0, 2)}.***.***/****-${String(cnpj).slice(-2)}`
}

export function safeErrorMessage(error) {
  const message = String(error?.message ?? '')
  if (message === 'Prévia/mapeamento não correspondem ao escopo aprovado' ||
      message === 'A allowlist de CNPJs é inválida' ||
      message === 'READ ONLY não confirmado; auditoria abortada' ||
      message === 'Privilégios mínimos da credencial não foram atestados; conexão bloqueada' ||
      message === 'DATABASE_URL ausente' || message === 'DATABASE_URL inválida' ||
      message === 'TLS estrito e channel binding obrigatório não comprovados na configuração') return message
  return 'Falha durante a auditoria; detalhe suprimido para proteger dados e credenciais'
}

export async function auditInReadOnlyTransaction(prisma, records) {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SET TRANSACTION READ ONLY`
    const gate = await tx.$queryRaw`SELECT current_setting('transaction_read_only') AS transaction_read_only`
    if (!Array.isArray(gate) || gate.length !== 1 || gate[0]?.transaction_read_only !== 'on') {
      throw new Error('READ ONLY não confirmado; auditoria abortada')
    }

    const cnpjs = records.map(record => record.company.cnpj)
    const found = await tx.$queryRaw(Prisma.sql`
      SELECT "id", "razaoSocial", "nomeFantasia", "cnpj", "regime", "status",
        "cidade", "uf", "vencimento", "grupo", "automationGroup", "branchType",
        "certificateSourceStatus", "cnpjDisplay", "inscricaoEstadual", "questorCode",
        "unecontSourceStatus", "unit", "zenQdriveSourceStatus"
      FROM "Company"
      WHERE "cnpj" IN (${Prisma.join(cnpjs)})
    `)
    const existing = new Map(found.map(row => [row.cnpj, row]))
    const results = records.map(record => {
      const input = { ...record.company }
      if (AMBIGUOUS_QUESTOR_ROWS.has(record.source.rowNumber)) input.questorCode = null
      const current = existing.get(input.cnpj)
      if (!current) return { status: 'INSERT_CANDIDATE', cnpj: maskCnpj(input.cnpj), rowNumber: record.source.rowNumber }
      const mappedFields = Object.keys(input).filter(field => COMPANY_FIELDS.includes(field))
      const differences = mappedFields.filter(field =>
        !(field === 'questorCode' && AMBIGUOUS_QUESTOR_ROWS.has(record.source.rowNumber)) &&
        (current[field] ?? null) !== (input[field] ?? null))
        .map(field => ({ field, existing: current[field] ?? null, source: input[field] ?? null }))
      return differences.length
        ? { status: 'CONFLICT', cnpj: maskCnpj(input.cnpj), rowNumber: record.source.rowNumber, differences }
        : { status: 'IDENTICAL', cnpj: maskCnpj(input.cnpj), rowNumber: record.source.rowNumber }
    })
    return results
  }, { maxWait: 5000, timeout: 120000 })
}

export async function runWithClient(client, records) {
  try {
    return await auditInReadOnlyTransaction(client, records)
  } finally {
    await client.$disconnect().catch(() => {})
  }
}

export async function main() {
  let client
  try {
    const [preview, mapping] = await Promise.all([
      fs.readFile(PREVIEW_PATH, 'utf8').then(JSON.parse),
      fs.readFile(MAPPING_PATH, 'utf8').then(JSON.parse),
    ])
    const records = loadAuthorizedPreview(preview, mapping)
    const tls = safeTlsPreflight(process.env.DATABASE_URL)
    if (!tls.ok) throw new Error(tls.reason)
    if (process.env.NEON_AUDIT_ROLE_ATTESTED !== 'true') {
      throw new Error('Privilégios mínimos da credencial não foram atestados; conexão bloqueada')
    }
    client = new PrismaClient({ log: [] })
    const results = await runWithClient(client, records)
    client = null
    const counts = Object.fromEntries(['INSERT_CANDIDATE', 'IDENTICAL', 'CONFLICT', 'VALIDATION_ERROR']
      .map(status => [status, results.filter(result => result.status === status).length]))
    const conflicts = results.filter(result => result.status === 'CONFLICT')
      .map(({ cnpj, rowNumber, differences }) => ({ cnpj, rowNumber, fields: differences.map(diff => diff.field) }))
    process.stdout.write(`${JSON.stringify({ scopeCount: records.length, counts, conflicts }, null, 2)}\n`)
    if (counts.CONFLICT || counts.VALIDATION_ERROR) process.exitCode = 2
  } catch (error) {
    process.stderr.write(`Auditoria bloqueada/interrompida: ${safeErrorMessage(error)}\n`)
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main()
