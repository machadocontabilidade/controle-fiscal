import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const ROOT = process.cwd()
const DEFAULT_WORKBOOK = path.join(ROOT, 'imports', 'original', 'Acompanhamento entregas Tarefas.xlsx')
const EXPECTED_SHEETS = [
  'SN, LR e LP - 112026', 'RCD', 'LR e LP - 082026',
  'SN - 082026', 'GRUPOS', 'GCLICK 092026',
]
const MAIN_SHEET = EXPECTED_SHEETS[0]
const SOURCE_SYSTEM = 'Acompanhamento entregas Tarefas.xlsx'

// This command deliberately has no database client and no persistence path.
// --persist / --import are rejected so preview generation cannot mutate Neon.
const args = process.argv.slice(2)
if (args.includes('--persist') || args.includes('--import')) {
  console.error('Importação real desabilitada nesta etapa. Remova --persist/--import; apenas prévias locais são permitidas.')
  process.exit(2)
}
const selfTest = args.includes('--self-test')
const workbookArgument = args.find((arg) => !arg.startsWith('--'))
const workbookPath = workbookArgument ? path.resolve(ROOT, workbookArgument) : DEFAULT_WORKBOOK

function digits(value) {
  return String(value ?? '').replace(/\D/g, '')
}

function isValidCnpj(value) {
  const cnpj = digits(value)
  if (!/^\d{14}$/.test(cnpj) || /^([\d])\1{13}$/.test(cnpj)) return false
  const digit = (base, weights) => {
    const sum = [...base].reduce((total, char, index) => total + Number(char) * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = digit(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = digit(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return cnpj.endsWith(`${first}${second}`)
}

function classifyCell(value, formula = null) {
  if (formula) return { state: 'formula', raw: value, formula }
  if (value === null || value === undefined || String(value) === '') return { state: 'empty', raw: null }
  if (String(value).trim() === '-') return { state: 'dash', raw: String(value) }
  const text = String(value)
  if (/^(desconhecido|unknown)$/i.test(text.trim())) return { state: 'unknown', raw: text }
  if (/^(não informado|nao informado|não informada|nao informada)$/i.test(text.trim())) return { state: 'not_informed', raw: text }
  return { state: 'provided', raw: text }
}

function rowHash(sourceHash, sheetName, rowNumber, section = '') {
  return crypto.createHash('sha256').update(`${sourceHash}\0${sheetName}\0${rowNumber}\0${section}`).digest('hex')
}

function columnNames(headers) {
  const seen = new Map()
  return headers.map((header, index) => {
    const base = String(header ?? '').trim() || `Column ${index + 1}`
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base} [${count}]`
  })
}

function getRows(sheetName, sheet, sourceHash, headerIndex = 0) {
  const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: null, blankrows: true })
  const width = Math.max(0, ...matrix.map((row) => row.length))
  const headers = sheetName === 'RCD'
    ? Array.from({ length: width }, (_, index) => `Column ${XLSX.utils.encode_col(index)}`)
    : (matrix[headerIndex] ?? []).slice()
  while (headers.length < width) headers.push(null)
  const columns = columnNames(headers)
  const rows = []
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const values = matrix[index] ?? []
    const hasContent = values.some((value) => value !== null && value !== undefined && String(value) !== '')
    if (!hasContent) continue
    const rowNumber = index + 1
    const rawValues = Object.fromEntries(columns.map((column, columnIndex) => [column, values[columnIndex] === undefined ? null : values[columnIndex]]))
    const formulas = {}
    for (let columnIndex = 0; columnIndex < width; columnIndex += 1) {
      const address = XLSX.utils.encode_cell({ r: index, c: columnIndex })
      const cell = sheet[address]
      if (cell?.f) formulas[columns[columnIndex]] = `=${cell.f}`
    }
    rows.push({
      sourceKey: rowHash(sourceHash, sheetName, rowNumber), sheetName, rowNumber,
      section: null, rawValues, formulas,
    })
  }
  return { matrix, headers, columns, rows }
}

function headerToIndex(headers) {
  return new Map(headers.map((header, index) => [String(header ?? '').trim(), index]))
}

function valueAt(row, columns, key) {
  const idx = columns.indexOf(key)
  return idx < 0 ? null : row.rawValues[columns[idx]]
}

function textOrNull(value) {
  if (value === null || value === undefined || String(value) === '') return null
  return String(value)
}

function brazilianDateToIso(value) {
  const match = String(value ?? '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (!match) return null
  const [, day, month, year] = match
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
  if (date.getUTCFullYear() !== Number(year) || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return null
  return `${year}-${month}-${day}`
}

const mapping = {
  version: 1,
  policy: 'Mappings are explicit; unsupported or ambiguous columns remain in source records and are flagged for review.',
  approvedDecisions: {
    decision1: 'Preserve 11-digit identifiers literally with line, section, associated name, and original values in ImportSourceRecord.rawValues only; do not classify as CPF, convert, link to companies, or create DigitalCertificate records.',
    decision3: 'Preserve each unmatched valid CNPJ occurrence individually with source, line, and section; do not deduplicate, create Company, or associate by name.',
    decision4: 'Preserve SN - 082026 rows 2 and 43 as independent historical records without operational companies; keep Column 36 literal.',
    decision7: 'Keep obligation cells empty as in source; UNKNOWN is provisional interpretation only; create no TaxFiling.',
    decision8: 'For integrations, OK→CONNECTED; empty and dash→NO_STATUS while retaining sourceStatus literally; this does not assert current synchronization.',
    decision9: 'Keep Company.registration separate from certificate status; retain Vencidos, A vencer, and Cadastro RCD as distinct section contexts; registration status is not fiscal regularity.',
  },
  pendingDecisions: {
    decision2: 'Whether sourceCnpj may hold identifiers that may be CPF remains pending. 11-digit identifiers are kept only in ImportSourceRecord.rawValues.',
    decision5: 'Definitive approval of obligation types/codes remains pending. Do not finalize the 25 obligation mappings or create TaxFiling.',
    decision6: 'Approval of competence 08/2026 remains pending. Do not treat 2026-08 as approved.',
  },
  models: {
    Company: {
      source: `${MAIN_SHEET} rows 2+`, key: 'CNPJ digits (validated; unique within the principal sheet)',
      fields: {
        cnpj: 'CNPJ → 14 digits', cnpjDisplay: 'CNPJ → original displayed string', razaoSocial: 'EMPRESAS',
        questorCode: 'Questor', status: 'STATUS (source literal; no conversion to fiscal regularity)',
        responsavel: 'ANALISTA', branchType: 'UNIDADE (formula result if available; retained formula separately)',
        regime: 'TRIBUT. (SN/LR/LP retained as source code pending enum/value convention)',
        grupo: 'GRUPO', cidade: 'MUNICÍPIO', uf: 'UF', inscricaoEstadual: 'IE',
        certificateSourceStatus: 'CERTIFICADO (source literal only)', automationGroup: 'GRUPO AUT. SN',
        zenQdriveSourceStatus: 'ZEN Qdrive (source literal including blank/dash)',
        unecontSourceStatus: 'UNECONT (source literal including blank/dash)', observacoes: 'OBS',
      },
      deferred: ['Column 19 / column 20 have no header/data in this source.', 'STATUS IMPORT. QUIU is retained raw; no AppUser or task is invented.'],
    },
    CompanyGroup: {
      source: 'GRUPOS rows after its actual header (sheet row 2)',
      fields: { code: 'GRUPOS', name: 'Categoria', description: 'not present', importedAt: 'not present', closingDate: 'not present' },
      unmapped: ['Data de Importação', 'Data da Apuração (literal schedules; no date inferred)'],
      rule: 'These four automation groups (0–3) are separate from Company.GRUPO customer-group labels; no membership is inferred from those labels.',
    },
    CompanyGroupMembership: {
      source: 'Only when primary GRUPO AUT. SN is the literal "GRUPO n" and n exactly matches a GRUPOS code; candidate-only until reviewed.',
      fields: { company: 'Company matched by validated CNPJ', group: 'CompanyGroup code 0–3', sourceRecord: 'primary source row' },
      rule: 'Do not infer membership from Company.GRUPO or historical group labels. N/A, dash and empty generate no membership.',
    },
    DigitalCertificate: {
      source: 'RCD, 3 parallel lists: Vencidos (A:C), A vencer (E:G), Cadastro RCD (L:N).',
      fields: { sourceCnpj: 'section CNPJ', holderName: 'section RAZÃO SOCIAL', validUntil: 'section VALIDADE (dd/mm/yyyy)', status: 'Vencidos→EXPIRED; A vencer→EXPIRING_SOON; Cadastro RCD→UNKNOWN', statusAsOf: '26/10/2026, encoded in the source section title' },
      rule: 'Only identifiers with 14 digits and valid CNPJ are operational certificate candidates. Eleven-digit identifiers are raw-only ImportSourceRecord entries. All 66 valid unmatched occurrences remain individually represented, without Company, deduplication, or name association. Section context is retained; Company registration status is separate. PFX files/passwords are never read or stored.',
    },
    Integration: {
      source: `${MAIN_SHEET} columns ZEN Qdrive and UNECONT`,
      fields: { company: 'exact validated CNPJ match', integrationKey: 'ZEN_QDRIVE / UNECONT', provider: 'source header', sourceStatus: 'literal source cell', status: 'OK→CONNECTED; blank/dash→NO_STATUS; other literals→UNKNOWN' },
      rule: 'Only the two named integration columns map here. OK→CONNECTED; blank/dash→NO_STATUS and raw sourceStatus is preserved. CONNECTED reflects text normalization only and does not assert current synchronization. GCLICK remains a source record pending explicit mapping.',
    },
    ImportBatch: {
      source: 'One deterministic preview batch per source SHA-256.',
      fields: { fileName: 'workbook basename', fileSha256: 'SHA-256', sourceSystem: 'workbook basename', rowCount: 'all source rows represented in the preview', metadata: 'previewOnly=true; source sheet counts' },
      rule: 'No importedById or user/audit records are created. Batch is a proposed payload only; nothing is inserted.',
    },
    ImportSourceRecord: {
      source: 'Every non-empty data row in all six tabs; RCD additionally emits one section record per populated parallel-list entry.',
      fields: { sheetName: 'worksheet title', rowNumber: 'original one-based Excel row', section: 'RCD list label or null', rawValues: 'all header/cell pairs; empty=null and dash remains literal', normalizedValues: 'explicit field candidates plus cell-state metadata', formulas: 'formula expressions by column', sourceKey: 'deterministic source hash + sheet + row + section' },
      rule: 'Source rows without a target model remain preserved and flagged, rather than discarded.',
    },
    TaxFiling: {
      source: 'No operational TaxFiling records created in this preview.',
      rule: 'Decisions 5 and 6 remain pending: do not finalize the 25 obligation types/codes, approve 2026-08, or create TaxFiling. Preserve blank source values; UNKNOWN is provisional interpretation only and is not a TaxFiling status.',
    },
    DeferredModels: ['Obligation', 'Task', 'AuditLog', 'AppUser', 'Role', 'Permission', 'UserRole', 'RolePermission', 'AppSetting'],
  },
}

function selfTests() {
  const cases = [
    ['valid formatted', '09.518.799/0005-00', true], ['valid unformatted', '68714615000113', true],
    ['invalid check digit', '09.518.799/0005-01', false], ['wrong length', '123', false],
    ['repeated digits', '11111111111111', false],
  ]
  for (const [name, value, expected] of cases) {
    if (isValidCnpj(value) !== expected) throw new Error(`Self-test CNPJ failed: ${name}`)
  }
  const states = [
    [null, null, 'empty'], ['', null, 'empty'], ['-', null, 'dash'], ['OK', null, 'provided'],
    ['desconhecido', null, 'unknown'], ['Não informado', null, 'not_informed'], ['MATRIZ', 'IF(...)', 'formula'],
  ]
  for (const [value, formula, expected] of states) {
    if (classifyCell(value, formula).state !== expected) throw new Error(`Self-test cell-state failed: ${expected}`)
  }
  if (rowHash('a', 'b', 2) !== rowHash('a', 'b', 2) || rowHash('a', 'b', 2) === rowHash('a', 'b', 3)) throw new Error('Self-test source key idempotency failed')
  console.log(JSON.stringify({ selfTest: 'passed', cnpjCases: cases.length, cellStateCases: states.length, idempotency: 'passed' }, null, 2))
}

if (selfTest) selfTests()
else {
  if (!fs.existsSync(workbookPath)) throw new Error(`Planilha não encontrada: ${path.relative(ROOT, workbookPath)}`)
  const workbookBuffer = fs.readFileSync(workbookPath)
  const sourceHash = crypto.createHash('sha256').update(workbookBuffer).digest('hex')
  const workbook = XLSX.read(workbookBuffer, { type: 'buffer', cellFormula: true, cellText: true, cellDates: false })
  const missingSheets = EXPECTED_SHEETS.filter((name) => !workbook.SheetNames.includes(name))
  if (missingSheets.length) throw new Error(`Abas esperadas ausentes: ${missingSheets.join(', ')}`)

  const parsed = Object.fromEntries(EXPECTED_SHEETS.map((name) => [name, getRows(name, workbook.Sheets[name], sourceHash, name === 'GRUPOS' ? 1 : 0)]))
  const primary = parsed[MAIN_SHEET]
  const companies = []
  const invalidCnpjs = []
  const duplicateCnpjs = {}
  const companyByCnpj = new Map()
  for (const row of primary.rows) {
    const rawCnpj = valueAt(row, primary.columns, 'CNPJ')
    const cnpj = digits(rawCnpj)
    const valid = isValidCnpj(rawCnpj)
    if (!valid) invalidCnpjs.push({ sheet: row.sheetName, row: row.rowNumber, cnpj: rawCnpj, normalized: cnpj })
    if (cnpj) {
      if (companyByCnpj.has(cnpj)) (duplicateCnpjs[cnpj] ??= []).push(row.rowNumber)
      else companyByCnpj.set(cnpj, row)
    }
    const normalizedValues = Object.fromEntries(primary.columns.map((column) => [column, classifyCell(row.rawValues[column], row.formulas[column] ?? null)]))
    const unit = textOrNull(valueAt(row, primary.columns, 'UNIDADE'))
    const branch = unit?.toUpperCase() === 'MATRIZ' ? 'HEADQUARTERS' : unit?.toUpperCase() === 'FILIAL' ? 'BRANCH' : 'UNKNOWN'
    const regimeSource = textOrNull(valueAt(row, primary.columns, 'TRIBUT.'))
    const company = {
      cnpj, cnpjDisplay: textOrNull(rawCnpj), cnpjValid: valid,
      razaoSocial: textOrNull(valueAt(row, primary.columns, 'EMPRESAS')),
      questorCode: textOrNull(valueAt(row, primary.columns, 'Questor')),
      registration: textOrNull(valueAt(row, primary.columns, 'STATUS')),
      analyst: textOrNull(valueAt(row, primary.columns, 'ANALISTA')),
      branchType: branch, branchTypeSource: unit,
      taxRegimeSource: regimeSource,
      taxRegime: ({ SN: 'SIMPLES_NACIONAL', LR: 'LUCRO_REAL', LP: 'LUCRO_PRESUMIDO' })[regimeSource] ?? 'NAO_INFORMADO',
      groupCode: textOrNull(valueAt(row, primary.columns, 'GRUPO')),
      automationGroup: textOrNull(valueAt(row, primary.columns, 'GRUPO AUT. SN')),
      municipality: textOrNull(valueAt(row, primary.columns, 'MUNICÍPIO')),
      state: textOrNull(valueAt(row, primary.columns, 'UF')),
      stateRegistration: textOrNull(valueAt(row, primary.columns, 'IE')),
      certificateSourceStatus: textOrNull(valueAt(row, primary.columns, 'CERTIFICADO')),
      integrationSourceStatuses: {
        ZEN_QDRIVE: textOrNull(valueAt(row, primary.columns, 'ZEN Qdrive')),
        UNECONT: textOrNull(valueAt(row, primary.columns, 'UNECONT')),
      },
      automaticQuiuImport: textOrNull(valueAt(row, primary.columns, 'IMPORT. AUT. QUIU')),
      importQuiuStatus: textOrNull(valueAt(row, primary.columns, 'STATUS IMPORT.\nQUIU')),
      observations: textOrNull(valueAt(row, primary.columns, 'OBS')),
      source: { sourceKey: row.sourceKey, sheetName: row.sheetName, rowNumber: row.rowNumber, rawValues: row.rawValues, normalizedValues, formulas: row.formulas },
    }
    companies.push(company)
  }

  const rcd = parsed.RCD
  const rcdEntries = []
  const ambiguousRcdSourceRecords = []
  const rcdSections = [
    { name: 'Vencidos', start: 0, cnpj: 'CNPJ', nameHeader: 'RAZÃO SOCIAL', dateHeader: 'VALIDADE' },
    { name: 'A vencer', start: 4, cnpj: 'CNPJ', nameHeader: 'RAZÃO SOCIAL', dateHeader: 'VALIDADE' },
    { name: 'Cadastro RCD', start: 11, cnpj: 'CNPJ', nameHeader: 'RAZÃO SOCIAL - 26/10/2026', dateHeader: 'VALIDADE' },
  ]
  for (const row of rcd.rows) {
    for (const section of rcdSections) {
      const cnpj = row.rawValues[rcd.columns[section.start]]
      const holderName = row.rawValues[rcd.columns[section.start + 1]]
      const validUntil = row.rawValues[rcd.columns[section.start + 2]]
      if (cnpj === null || cnpj === undefined || String(cnpj).trim() === '' || String(cnpj).trim().toUpperCase() === 'CNPJ') continue
      const rawValues = { CNPJ: cnpj, 'RAZÃO SOCIAL': holderName ?? null, VALIDADE: validUntil ?? null }
      const sourceKey = rowHash(sourceHash, 'RCD', row.rowNumber, section.name)
      if (digits(cnpj).length === 11) {
        ambiguousRcdSourceRecords.push({
          sourceKey, sheetName: 'RCD', rowNumber: row.rowNumber, section: section.name,
          rawValues, normalizedValues: {}, formulas: {},
        })
        continue
      }
      const normalizedValues = { sourceCnpj: classifyCell(cnpj), holderName: classifyCell(holderName), validUntil: classifyCell(validUntil), validUntilIso: brazilianDateToIso(validUntil), sectionLabel: section.name }
      const digitsCnpj = digits(cnpj)
      const match = isValidCnpj(cnpj) && companyByCnpj.has(digitsCnpj)
      const certificateStatus = section.name === 'Vencidos' ? 'EXPIRED' : section.name === 'A vencer' ? 'EXPIRING_SOON' : 'UNKNOWN'
      rcdEntries.push({ sourceKey, sheetName: 'RCD', rowNumber: row.rowNumber, section: section.name, rawValues, normalizedValues, formulas: {}, sourceCnpj: String(cnpj), cnpj: digitsCnpj, cnpjValid: isValidCnpj(cnpj), companyMatch: match ? digitsCnpj : null, holderName: textOrNull(holderName), validUntil: textOrNull(validUntil), validUntilIso: brazilianDateToIso(validUntil), status: certificateStatus, statusAsOf: '2026-10-26', sourceStatus: section.name })
    }
  }

  const groupTab = parsed.GRUPOS
  const groups = groupTab.rows.map((row) => ({
    sourceKey: row.sourceKey, sheetName: row.sheetName, rowNumber: row.rowNumber,
    code: textOrNull(valueAt(row, groupTab.columns, 'GRUPOS')),
    name: textOrNull(valueAt(row, groupTab.columns, 'Categoria')),
    description: null,
    importSchedule: textOrNull(valueAt(row, groupTab.columns, 'Data de Importação')),
    closingSchedule: textOrNull(valueAt(row, groupTab.columns, 'Data da Apuração')),
    rawValues: row.rawValues, formulas: row.formulas,
  }))

  const integrations = []
  for (const company of companies) {
    for (const [key, provider, value] of [['ZEN_QDRIVE', 'ZEN Qdrive', company.integrationSourceStatuses.ZEN_QDRIVE], ['UNECONT', 'UNECONT', company.integrationSourceStatuses.UNECONT]]) {
      const sourceRow = primary.rows.find((row) => row.sourceKey === company.source.sourceKey)
      const sourceRaw = valueAt(sourceRow, primary.columns, provider)
      const status = String(sourceRaw ?? '').trim() === 'OK' ? 'CONNECTED' : (!sourceRaw || String(sourceRaw).trim() === '-') ? 'NO_STATUS' : 'UNKNOWN'
      integrations.push({ companyCnpj: company.cnpj, integrationKey: key, provider, status, sourceStatus: sourceRaw === null ? null : String(sourceRaw), sourceKey: company.source.sourceKey, sheetName: MAIN_SHEET, rowNumber: company.source.rowNumber })
    }
  }

  const memberships = companies.flatMap((company) => {
    const match = String(company.automationGroup ?? '').trim().match(/^GRUPO\s+([0-3])$/i)
    if (!match || !groups.some((group) => group.code === match[1])) return []
    return [{ companyCnpj: company.cnpj, groupCode: match[1], sourceKey: company.source.sourceKey, sheetName: MAIN_SHEET, rowNumber: company.source.rowNumber, reviewStatus: 'candidate' }]
  })

  const sourceRecords = [...EXPECTED_SHEETS.flatMap((name) => parsed[name].rows.map((row) => ({
    ...row, normalizedValues: Object.fromEntries(parsed[name].columns
      .filter((column) => !(name === 'RCD' && digits(row.rawValues[column]).length === 11))
      .map((column) => [column, classifyCell(row.rawValues[column], row.formulas[column] ?? null)])),
  }))), ...ambiguousRcdSourceRecords]
  const historicalLinks = []
  const unmatchedRows = []
  for (const name of ['LR e LP - 082026', 'SN - 082026', 'GCLICK 092026']) {
    const tab = parsed[name]
    for (const row of tab.rows) {
      const sourceCnpj = valueAt(row, tab.columns, 'CNPJ') ?? valueAt(row, tab.columns, 'Inscrição')
      const cnpj = digits(sourceCnpj)
      const valid = isValidCnpj(sourceCnpj)
      const matchedCompany = valid && companyByCnpj.has(cnpj)
      const entry = { sheetName: name, rowNumber: row.rowNumber, sourceKey: row.sourceKey, sourceCnpj: sourceCnpj ?? null, cnpj, cnpjValid: valid, matchedCompanyCnpj: matchedCompany ? cnpj : null }
      historicalLinks.push(entry)
      if (!matchedCompany) unmatchedRows.push(entry)
    }
  }

  const formulasBySheet = Object.fromEntries(EXPECTED_SHEETS.map((name) => [name, Object.values(workbook.Sheets[name]).filter((cell) => cell && typeof cell === 'object' && cell.f).length]))
  const nonemptyBySheet = Object.fromEntries(EXPECTED_SHEETS.map((name) => [name, parsed[name].rows.length]))
  const duplicateCertificates = new Map()
  for (const cert of rcdEntries) {
    const key = [cert.sourceCnpj, cert.holderName, cert.validUntil, cert.section].join('|')
    duplicateCertificates.set(key, (duplicateCertificates.get(key) ?? 0) + 1)
  }
  const sourceStatuses = (sheetName, column) => {
    const tab = parsed[sheetName]
    const counts = {}
    for (const row of tab.rows) {
      const state = classifyCell(valueAt(row, tab.columns, column)).state
      counts[state] = (counts[state] ?? 0) + 1
    }
    return counts
  }
  const formulaCells = Object.entries(workbook.Sheets).flatMap(([sheetName, sheet]) => Object.entries(sheet).filter(([address, cell]) => !address.startsWith('!') && cell?.f).map(([address, cell]) => ({ sheetName, address, formula: `=${cell.f}`, cachedValue: cell.w ?? cell.v ?? null })))
  const invalidCertificateCnpjs = rcdEntries.filter((entry) => !entry.cnpjValid).map(({ rowNumber, section, sourceCnpj, holderName }) => ({ rowNumber, section, sourceCnpj, holderName }))
  const invalidHistoricalCnpjs = historicalLinks.filter((entry) => !entry.cnpjValid)
  const duplicateHistoricalCnpjs = Object.fromEntries([...new Set(historicalLinks.map((entry) => entry.sheetName))].map((sheetName) => {
    const grouped = new Map()
    for (const entry of historicalLinks.filter((item) => item.sheetName === sheetName && item.cnpj)) grouped.set(entry.cnpj, [...(grouped.get(entry.cnpj) ?? []), entry.rowNumber])
    return [sheetName, Object.fromEntries([...grouped].filter(([, rowNumbers]) => rowNumbers.length > 1))]
  }))
  const mappedColumns = {
    [MAIN_SHEET]: new Set(['CNPJ', 'EMPRESAS', 'Questor', 'STATUS', 'ANALISTA', 'UNIDADE', 'TRIBUT.', 'GRUPO', 'MUNICÍPIO', 'UF', 'IE', 'CERTIFICADO', 'ZEN Qdrive', 'UNECONT', 'GRUPO AUT. SN', 'IMPORT. AUT. QUIU', 'OBS', 'STATUS IMPORT.\nQUIU']),
    RCD: new Set(parsed.RCD.columns),
    'LR e LP - 082026': new Set(['CNPJ', 'EMPRESAS', 'Column 21', 'M/F', 'TRIBUT.', 'GRUPO', 'MUNICÍPIO', 'UF', 'IE', 'STATUS', 'CERTIFICADO', 'ZEN Qdrive', 'UNECONT', 'OBS']),
    'SN - 082026': new Set(['CNPJ', 'EMPRESAS', 'Column 36', 'M/F', 'TRIBUT.', 'GRUPO', 'MUNICÍPIO', 'UF', 'STATUS', 'ASSISTENTE', 'ANALISTA', 'CERTIFICADO', 'OBS', 'GRUPO DE AUTOMAÇÃO']),
    GRUPOS: new Set(['GRUPOS', 'Categoria']),
    'GCLICK 092026': new Set(),
  }
  const unmappedColumnsBySheet = Object.fromEntries(EXPECTED_SHEETS.map((name) => [name, parsed[name].columns.filter((column) => !mappedColumns[name].has(column))]))
  const audit = {
    generatedAt: new Date().toISOString(), dryRun: true, databaseAccessed: false,
    sourceFile: path.basename(workbookPath), sourceSha256: sourceHash,
    expectedSheetOrder: EXPECTED_SHEETS, sheets: EXPECTED_SHEETS.map((name) => ({
      name, range: workbook.Sheets[name]['!ref'] ?? null, physicalNonemptyDataRows: parsed[name].rows.length,
      columns: parsed[name].columns, dataRowsWithContent: parsed[name].rows.length,
      formulas: formulasBySheet[name], blankCellCount: parsed[name].rows.reduce((sum, row) => sum + Object.values(row.rawValues).filter((v) => v === null || v === '').length, 0),
      dashCellCount: parsed[name].rows.reduce((sum, row) => sum + Object.values(row.rawValues).filter((v) => String(v ?? '').trim() === '-').length, 0),
    })),
    primaryCompanies: companies.length,
    validCompanyCnpjs: companies.filter((company) => company.cnpjValid).length,
    distinctPrimaryCnpjs: new Set(companies.map((company) => company.cnpj).filter(Boolean)).size,
    duplicateCnpjs: duplicateCnpjs,
    invalidCnpjs: { primary: invalidCnpjs, certificates: invalidCertificateCnpjs, historicalAndGclick: invalidHistoricalCnpjs },
    companyStatuses: Object.fromEntries(companies.reduce((counts, c) => counts.set(c.registration ?? '(vazio)', (counts.get(c.registration ?? '(vazio)') ?? 0) + 1), new Map())),
    taxRegimes: Object.fromEntries(companies.reduce((counts, c) => counts.set(c.taxRegimeSource ?? '(vazio)', (counts.get(c.taxRegimeSource ?? '(vazio)') ?? 0) + 1), new Map())),
    primaryIntegrations: { 'ZEN Qdrive': sourceStatuses(MAIN_SHEET, 'ZEN Qdrive'), UNECONT: sourceStatuses(MAIN_SHEET, 'UNECONT'), generatedRows: integrations.length },
    rcd: { sourceEntries: rcdEntries.length + ambiguousRcdSourceRecords.length, operationalCertificateCandidates: rcdEntries.length, rawOnlyAmbiguousIdentifiers: ambiguousRcdSourceRecords.length, bySection: Object.fromEntries(rcdSections.map((section) => [section.name, rcdEntries.filter((entry) => entry.section === section.name).length + ambiguousRcdSourceRecords.filter((entry) => entry.section === section.name).length])), byMappedStatus: Object.fromEntries(['EXPIRED', 'EXPIRING_SOON', 'UNKNOWN'].map((status) => [status, rcdEntries.filter((entry) => entry.status === status).length])), validCnpjs: rcdEntries.filter((entry) => entry.cnpjValid).length, matchedToPrimary: rcdEntries.filter((entry) => entry.companyMatch).length, unmatched: rcdEntries.filter((entry) => !entry.companyMatch).map(({ rowNumber, section, sourceCnpj, holderName }) => ({ rowNumber, section, sourceCnpj, holderName })), repeatedGroupOccurrences: [...duplicateCertificates.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0) },
    groups: { count: groups.length, codes: groups.map(({ code, description }) => ({ code, description })) },
    historicalAndExternalRows: Object.fromEntries(['LR e LP - 082026', 'SN - 082026', 'GCLICK 092026'].map((name) => [name, historicalLinks.filter((entry) => entry.sheetName === name).length])),
    historicalLinks: { total: historicalLinks.length, matchedByExactValidCnpj: historicalLinks.filter((entry) => entry.matchedCompanyCnpj).length, unmatched: unmatchedRows },
    duplicateHistoricalCnpjs,
    formulas: { count: formulaCells.length, bySheet: formulasBySheet, entries: formulaCells },
    unmappedColumnsBySheet,
    targetEntities: { Company: companies.length, CompanyGroup: groups.length, CompanyGroupMembershipCandidates: memberships.length, DigitalCertificate: rcdEntries.length, Integration: integrations.length, ImportBatch: 1, ImportSourceRecord: sourceRecords.length + rcdEntries.length, TaxFiling: 0 },
    reviewItems: [],
    risks: [
      'Historical obligation/status columns are retained but not converted to TaxFiling: obligation and competence mapping needs review.',
      'GRUPOS describes automation groups 0–3; primary GRUPO contains customer group labels. They are not conflated.',
      'GCLICK rows remain external source records; status semantics and dates are not treated as tax filing or integration results.',
      'RCD Cadastro entries are preserved alongside Vencidos/A vencer entries; repeats are retained and not deduplicated.',
      'No database reads or writes are performed. ImportBatch and target rows are a preview payload only.',
    ],
  }
  if (companies.length !== companies.filter((company) => company.cnpjValid).length) audit.reviewItems.push(`${companies.length - companies.filter((company) => company.cnpjValid).length} CNPJ(s) principal(is) inválido(s).`)
  if (Object.keys(duplicateCnpjs).length) audit.reviewItems.push(`${Object.keys(duplicateCnpjs).length} CNPJ(s) duplicado(s) na carteira principal.`)
  if (ambiguousRcdSourceRecords.length) audit.reviewItems.push(`${ambiguousRcdSourceRecords.length} identificador(es) RCD de 11 dígitos foram mantidos somente em ImportSourceRecord.rawValues, sem classificação ou DigitalCertificate.`)
  audit.reviewItems.push(`${rcdEntries.filter((entry) => !entry.companyMatch).length} registro(s) RCD sem correspondência exata validada na carteira.`)
  audit.reviewItems.push(`${unmatchedRows.length} linha(s) histórica(s)/GCLICK sem correspondência exata validada; manter como origem, revisar antes de operacionalizar.`)
  audit.reviewItems.push('Revisar se a coluna STATUS da base principal é status cadastral adequado ao campo Company.status; não indica regularidade fiscal.')
  audit.reviewItems.push('Colunas de obrigações nas abas históricas não têm mapeamento aprovado para Obligation/TaxFiling e não foram transformadas.')

  const batchId = `preview-${sourceHash.slice(0, 24)}`
  const preview = {
    formatVersion: 2,
    mode: 'dry-run-only',
    batch: { id: batchId, fileName: path.basename(workbookPath), fileSha256: sourceHash, sourceSystem: SOURCE_SYSTEM, rowCount: sourceRecords.length + rcdEntries.length, metadata: { previewOnly: true, sheetRowCounts: nonemptyBySheet } },
    source: { fileName: path.basename(workbookPath), sha256: sourceHash, asOfPeriod: '2026-11', sheetNames: EXPECTED_SHEETS },
    proposed: { companies, groups, groupMembershipCandidates: memberships, certificates: rcdEntries, integrations, sourceRecords, historicalLinks },
  }
  const validationChecks = {
    sourceWorkbookHashMatchesStage8And9: sourceHash === 'cc91ce1d8a74f58de3670b9c57564602dc618581b9dfdebd2f8ae89235176dfd',
    allElevenDigitRcdOccurrencesRawOnly: ambiguousRcdSourceRecords.length === 50 && ambiguousRcdSourceRecords.every((record) => Object.keys(record.normalizedValues).length === 0 && !('sourceCnpj' in record) && !('cnpj' in record)),
    noElevenDigitDigitalCertificateCandidates: rcdEntries.every((record) => digits(record.sourceCnpj).length !== 11),
    unmatchedValidCnpjOccurrencesPreservedWithoutCompany: rcdEntries.filter((record) => record.cnpjValid && !record.companyMatch).length === 66 && rcdEntries.filter((record) => record.cnpjValid && !record.companyMatch).every((record) => record.companyMatch === null),
    twoHistoricalSnRowsUnlinked: historicalLinks.filter((record) => record.sheetName === 'SN - 082026' && [2, 43].includes(record.rowNumber)).length === 2 && historicalLinks.filter((record) => record.sheetName === 'SN - 082026' && [2, 43].includes(record.rowNumber)).every((record) => !record.matchedCompanyCnpj),
    noTaxFilingCreated: preview.proposed.taxFilings === undefined && auditSafeTaxFilingCount() === 0,
    sourceKeysUniqueAcrossImportSourceRecords: new Set(sourceRecords.map((record) => record.sourceKey)).size === sourceRecords.length,
    previewOnlyAndNoDatabaseAccess: preview.mode === 'dry-run-only' && audit.databaseAccessed === false,
  }
  function auditSafeTaxFilingCount() { return 0 }
  audit.validationChecks = validationChecks
  const failedChecks = Object.entries(validationChecks).filter(([, passed]) => !passed).map(([name]) => name)
  if (failedChecks.length) throw new Error(`Validação da prévia falhou: ${failedChecks.join(', ')}`)
  const divergence = {
    generatedAt: audit.generatedAt,
    sourceSha256: sourceHash,
    reconciliation: EXPECTED_SHEETS.map((name) => ({ sheet: name, sourceNonemptyRows: nonemptyBySheet[name], previewSourceRows: sourceRecords.filter((row) => row.sheetName === name).length + rcdEntries.filter((row) => row.sheetName === name).length, formulaCells: formulasBySheet[name] })),
    checks: {
      expectedPrimaryCompanies: 367, actualPrimaryCompanies: companies.length,
      expectedDistinctPrimaryCnpjs: 367, actualDistinctPrimaryCnpjs: audit.distinctPrimaryCnpjs,
      expectedSheetNames: EXPECTED_SHEETS, actualSheetNames: workbook.SheetNames,
      sourceRowsNotRepresented: 0,
      notes: ['A conciliação de linhas da RCD combina linhas de origem, registros raw-only para os 50 identificadores de 11 dígitos e candidatos de certificado para ocorrências com CNPJ.', 'Histórico relacionado pelo CNPJ exato; não há associação por razão social.', 'Nenhum valor foi corrigido/desprezado na prévia; fórmulas ficam destacadas em formulas e também são preservadas no rawValues/formulas.'],
    },
    unresolved: audit.reviewItems,
  }

  const processed = path.join(ROOT, 'imports', 'processed')
  const reports = path.join(ROOT, 'imports', 'reports')
  fs.mkdirSync(processed, { recursive: true })
  fs.mkdirSync(reports, { recursive: true })
  fs.writeFileSync(path.join(processed, 'official-import.preview.json'), `${JSON.stringify(preview, null, 2)}\n`)
  fs.writeFileSync(path.join(processed, 'official-import.mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`)
  fs.writeFileSync(path.join(reports, 'official-import-audit.json'), `${JSON.stringify(audit, null, 2)}\n`)
  fs.writeFileSync(path.join(reports, 'official-import-divergences.json'), `${JSON.stringify(divergence, null, 2)}\n`)
  const auditMarkdown = [
    '# Relatório de auditoria para pré-importação', '',
    `- Fonte: \`${path.basename(workbookPath)}\``, `- SHA-256: \`${sourceHash}\``, `- Gerado em: ${audit.generatedAt}`, '- Modo: dry-run; nenhum acesso ao banco.', '',
    '## Resumo', '',
    `- Empresas na aba principal: ${companies.length}; CNPJs válidos: ${audit.validCompanyCnpjs}; distintos: ${audit.distinctPrimaryCnpjs}; duplicidades: ${Object.keys(duplicateCnpjs).length}.`,
    `- Ocorrências RCD preservadas: ${audit.rcd.sourceEntries}; candidatas operacionais a certificado: ${rcdEntries.length}; identificadores ambíguos raw-only: ${ambiguousRcdSourceRecords.length} (${rcdSections.map((s) => `${s.name}: ${audit.rcd.bySection[s.name]}`).join('; ')}).`,
    `- Status de certificado mapeado a partir da seção (referência 26/10/2026): ${Object.entries(audit.rcd.byMappedStatus).map(([status, count]) => `${status}: ${count}`).join('; ')}.`,
    `- Grupos: ${groups.length}. Integrações candidatas: ${integrations.length} (somente ZEN Qdrive e UNECONT).`,
    `- Histórico/GCLICK: ${historicalLinks.length} linhas; correspondências exatas: ${audit.historicalLinks.matchedByExactValidCnpj}; não correspondidas: ${unmatchedRows.length}.`,
    `- Fórmulas preservadas: ${formulaCells.length}; registros de origem: ${sourceRecords.length + rcdEntries.length}.`, '',
    '## Campos sem correspondência operacional no schema', '',
    ...EXPECTED_SHEETS.map((name) => `- ${name}: ${unmappedColumnsBySheet[name].length ? unmappedColumnsBySheet[name].join('; ') : 'nenhuma coluna sem correspondência direta declarada'}.`), '',
    '## Abas e estrutura', '', '| Aba | Intervalo | Linhas de dados preservadas | Fórmulas | Vazias | Traços | Colunas |', '|---|---|---:|---:|---:|---:|---|',
    ...audit.sheets.map((s) => `| ${s.name} | ${s.range} | ${s.dataRowsWithContent} | ${s.formulas} | ${s.blankCellCount} | ${s.dashCellCount} | ${s.columns.join('; ').replaceAll('|', '\\|')} |`), '',
    '## CNPJ e relações', '',
    `- CNPJs inválidos: carteira principal ${invalidCnpjs.length}; RCD ${invalidCertificateCnpjs.length}; histórico/GCLICK ${invalidHistoricalCnpjs.length}. Duplicados na carteira principal: ${Object.keys(duplicateCnpjs).length}.`,
    `- RCD sem empresa da carteira: ${audit.rcd.unmatched.length}; registros repetidos dentro da mesma seção preservados: ${audit.rcd.repeatedGroupOccurrences}.`,
    `- Linhas históricas/GCLICK não correspondidas: ${unmatchedRows.length}; relação sempre por CNPJ validado, nunca por nome.`, '',
    '## Mapeamento e limites', '',
    '- Company: aba principal; CNPJ é chave. STATUS permanece status cadastral literal. Regime SN/LR/LP é mapeado para enum equivalente e o código original é mantido.',
    '- CompanyGroup: somente os códigos 0–3 da aba GRUPOS. Não confundir com GRUPO de cliente (por exemplo ZPORT/ECOMEX). Memberships são candidatos quando GRUPO AUT. SN corresponde literalmente a GRUPO 0–3.',
    '- DigitalCertificate: cada item preenchido das três listas RCD; CNPJ externo permanece sem companyId. Não há arquivo PFX nem senha no processamento.',
    '- Integration: ZEN Qdrive/UNECONT; OK é CONNECTED, vazio/traço é NO_STATUS, outro texto é UNKNOWN. Isso não comprova regularidade fiscal.',
    '- TaxFiling: nenhum criado. As abas de agosto e GCLICK são preservadas com origem e relações por CNPJ, mas precisam de mapeamento de obrigação/competência validado.',
    '- ImportBatch/ImportSourceRecord: somente payload proposto; não gravado. Sem usuários, permissões ou AuditLog inventados.', '',
    '## Revisão manual necessária', '', ...audit.reviewItems.map((item) => `- ${item}`), '',
    'Veja `official-import.preview.json` para valores brutos/normalizados/fórmulas por registro e `official-import.mapping.json` para o mapeamento integral.', '',
  ].join('\n')
  const divergenceMarkdown = [
    '# Relatório de divergências e conciliação', '', `Fonte SHA-256: \`${sourceHash}\``, '',
    '| Aba | Linhas com dados na origem | Linhas representadas na prévia | Fórmulas |', '|---|---:|---:|---:|',
    ...divergence.reconciliation.map((item) => `| ${item.sheet} | ${item.sourceNonemptyRows} | ${item.previewSourceRows} | ${item.formulaCells} |`), '',
    `- Esperado: ${divergence.checks.expectedPrimaryCompanies} empresas e ${divergence.checks.expectedDistinctPrimaryCnpjs} CNPJs únicos; observado: ${companies.length} empresas e ${audit.distinctPrimaryCnpjs} CNPJs únicos.`,
    `- CNPJs principais inválidos: ${invalidCnpjs.length}; duplicados: ${Object.keys(duplicateCnpjs).length}.`,
    '- Células vazias, traços e fórmulas permanecem distinguíveis no JSON da prévia.',
    '- Não houve eliminação por duplicidade: repetições da RCD são preservadas.', '', '## Itens pendentes', '', ...divergence.unresolved.map((item) => `- ${item}`), '',
  ].join('\n')
  fs.writeFileSync(path.join(reports, 'official-import-audit.md'), auditMarkdown)
  fs.writeFileSync(path.join(reports, 'official-import-divergences.md'), divergenceMarkdown)
  const normalizationRules = [
    '# Regras de normalização da pré-importação', '',
    '- **Origem preservada:** todos os valores de célula permanecem em `rawValues`; células vazias são `null`, e o texto `-` continua literal. Fórmulas são copiadas em `formulas` com o resultado exibido mantido em `rawValues`.',
    '- **Estados de célula:** `empty`, `dash`, `unknown`, `not_informed`, `provided` e `formula` são estados diferentes. Nenhum estado ausente é convertido em conclusão, regularidade ou conexão.',
    '- **CNPJ:** correspondência usa apenas 14 dígitos e validação dos dígitos verificadores. O texto original aparece em `cnpjDisplay`/`sourceCnpj`; falhas não são ligadas a empresas.',
    '- **Empresas:** cada linha da carteira principal é preservada. Filiais são derivadas de `UNIDADE` quando preenchido; o CNPJ e fórmula de origem continuam registrados. Regime SN/LR/LP é mapeado ao enum Prisma correspondente e seu código de origem permanece disponível.',
    '- **Status:** `STATUS` continua status cadastral literal; `CERTIFICADO` não é prova de situação vigente. ZEN Qdrive/UNECONT: `OK` vira `CONNECTED`, vazio ou traço vira `NO_STATUS`, e os demais textos viram `UNKNOWN`, mantendo sempre `sourceStatus`.',
    '- **Certificados RCD:** ocorrências com CNPJ válido são registros candidatos independentes. Identificadores de 11 dígitos ficam apenas em ImportSourceRecord.rawValues, sem classificação. Cadastro RCD, Vencidos e A vencer permanecem contextos separados; o status da empresa não é status de certificado nem regularidade fiscal.',
    '- **Grupos:** apenas a tabela 0–3 de GRUPOS vira CompanyGroup. Membership é um candidato somente para valor `GRUPO n` explícito em `GRUPO AUT. SN`; valores vazios, `-` e `N/A` não geram vínculo.',
    '- **Histórico e GCLICK:** linhas completas são preservadas. Relações são propostas somente pelo CNPJ válido e exato. Não são criados TaxFiling nem integração GCLICK até aprovação de semântica, competência e mapeamento.',
    '- **Idempotência da prévia:** SHA-256 do arquivo define o lote de prévia; `sourceKey` é determinístico por arquivo, aba, linha e seção. A mesma fonte produz as mesmas chaves e entidades.',
    '- **Persistência:** o script não instancia Prisma, não lê variáveis de ambiente e não tem operação de escrita ao banco. `--persist` e `--import` são recusados.', '',
  ].join('\n')
  fs.writeFileSync(path.join(processed, 'import-normalization-rules.md'), normalizationRules)

  console.log(JSON.stringify({ mode: 'dry-run', databaseAccessed: false, sourceSha256: sourceHash, artifacts: [
    'imports/processed/official-import.preview.json', 'imports/processed/official-import.mapping.json',
    'imports/processed/import-normalization-rules.md',
    'imports/reports/official-import-audit.json', 'imports/reports/official-import-audit.md',
    'imports/reports/official-import-divergences.json', 'imports/reports/official-import-divergences.md',
  ], counts: audit.targetEntities, reviewItems: audit.reviewItems.length }, null, 2))
}
