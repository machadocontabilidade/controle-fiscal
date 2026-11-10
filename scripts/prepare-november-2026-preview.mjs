import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import XLSX from 'xlsx'

const root = process.cwd()
const sourcePath = path.join(root, 'imports/original/Acompanhamento entregas Tarefas.xlsx')
const sheetName = 'SN, LR e LP - 112026'
const bytes = fs.readFileSync(sourcePath)
const sourceSha256 = crypto.createHash('sha256').update(bytes).digest('hex')
// Restrict worksheet parsing to the one approved tab. Workbook metadata may list other tabs,
// but no other worksheet content is accessed or parsed.
const workbook = XLSX.read(bytes, { type: 'buffer', sheets: [sheetName], cellFormula: true, cellText: true, cellDates: false })
const sheet = workbook.Sheets[sheetName]
if (!sheet) throw new Error(`Aba autorizada não encontrada: ${sheetName}`)
const range = XLSX.utils.decode_range(sheet['!ref'])
const headers = Array.from({ length: range.e.c + 1 }, (_, col) => {
  const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })]
  return cell?.v == null ? null : String(cell.v)
})
const required = ['CNPJ', 'EMPRESAS', 'Questor', 'STATUS', 'ANALISTA', 'UNIDADE', 'TRIBUT.', 'GRUPO', 'MUNICÍPIO', 'UF', 'IE', 'CERTIFICADO', 'ZEN Qdrive', 'UNECONT', 'GRUPO AUT. SN', 'IMPORT. AUT. QUIU', 'OBS', 'STATUS IMPORT.\nQUIU']
if (JSON.stringify(headers) !== JSON.stringify(required)) throw new Error(`Cabeçalhos inesperados: ${JSON.stringify(headers)}`)

const digits = (value) => String(value ?? '').replace(/\D/g, '')
function validCnpj(value) {
  const cnpj = digits(value)
  if (!/^\d{14}$/.test(cnpj) || /^(\d)\1{13}$/.test(cnpj)) return false
  const check = (text, weights) => {
    const sum = [...text].reduce((total, n, index) => total + Number(n) * weights[index], 0)
    const remainder = sum % 11
    return remainder < 2 ? 0 : 11 - remainder
  }
  const first = check(cnpj.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  const second = check(cnpj.slice(0, 12) + first, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2])
  return cnpj.endsWith(`${first}${second}`)
}
const text = (value) => value == null || String(value) === '' ? null : String(value)
const valueAt = (row, name) => row.rawValues[name]
const fingerprint = (line) => crypto.createHash('sha256').update(`${sourceSha256}\0${sheetName}\0${line}`).digest('hex')
function cellValue(address) {
  const cell = sheet[address]
  if (!cell || cell.v == null) return null
  // Keep the source cell's stored value/type, including numeric Questor cells; retain Excel's
  // rendered text separately. Formula cells keep their cached value here.
  return cell.v
}
function cellState(value, formula) {
  if (formula) return 'formula'
  if (value == null || value === '') return 'empty'
  const normalized = String(value).trim()
  if (normalized === '-') return 'dash'
  if (/^(desconhecido|unknown)$/i.test(normalized)) return 'unknown'
  if (/^(não informado|nao informado|não informada|nao informada)$/i.test(normalized)) return 'not_informed'
  return 'provided'
}

const records = []
for (let r = range.s.r + 1; r <= range.e.r; r += 1) {
  const rowNumber = r + 1
  const rawValues = {}
  const displayValues = {}
  const formulas = {}
  const cellStates = {}
  for (let c = 0; c < required.length; c += 1) {
    const name = required[c]
    const address = XLSX.utils.encode_cell({ r, c })
    const cell = sheet[address]
    const formula = cell?.f ? `=${cell.f}` : null
    const value = cellValue(address)
    rawValues[name] = value
    displayValues[name] = cell?.w ?? (value == null ? null : String(value))
    if (formula) formulas[name] = formula
    cellStates[name] = cellState(value, formula)
  }
  if (Object.values(rawValues).every((value) => value == null || value === '')) continue

  const cnpjDisplay = valueAt({ rawValues }, 'CNPJ') == null ? null : String(valueAt({ rawValues }, 'CNPJ'))
  const cnpj = digits(cnpjDisplay)
  const regime = text(valueAt({ rawValues }, 'TRIBUT.'))
  const unit = text(valueAt({ rawValues }, 'UNIDADE'))
  const branchType = unit?.toUpperCase() === 'MATRIZ' ? 'HEADQUARTERS' : unit?.toUpperCase() === 'FILIAL' ? 'BRANCH' : 'UNKNOWN'
  const company = {
    cnpj,
    cnpjDisplay,
    razaoSocial: text(valueAt({ rawValues }, 'EMPRESAS')),
    questorCode: typeof valueAt({ rawValues }, 'Questor') === 'number' ? valueAt({ rawValues }, 'Questor').toFixed(1) : text(valueAt({ rawValues }, 'Questor')),
    inscricaoEstadual: text(valueAt({ rawValues }, 'IE')),
    regime,
    status: text(valueAt({ rawValues }, 'STATUS')),
    cidade: text(valueAt({ rawValues }, 'MUNICÍPIO')),
    uf: text(valueAt({ rawValues }, 'UF')),
    responsavel: text(valueAt({ rawValues }, 'ANALISTA')),
    grupo: text(valueAt({ rawValues }, 'GRUPO')),
    observacoes: text(valueAt({ rawValues }, 'OBS')),
    branchType,
    unit,
    automationGroup: text(valueAt({ rawValues }, 'GRUPO AUT. SN')),
    certificateSourceStatus: text(valueAt({ rawValues }, 'CERTIFICADO')),
    zenQdriveSourceStatus: text(valueAt({ rawValues }, 'ZEN Qdrive')),
    unecontSourceStatus: text(valueAt({ rawValues }, 'UNECONT')),
  }
  records.push({
    operation: 'upsert',
    operationalKey: { field: 'cnpj', value: cnpj, validation: '14 dígitos + dígitos verificadores' },
    cnpjValid: validCnpj(cnpjDisplay),
    company,
    source: { sourceKey: fingerprint(rowNumber), fileName: path.basename(sourcePath), fileSha256: sourceSha256, sheetName, rowNumber },
    rawValues,
    displayValues,
    cellStates,
    formulas,
  })
}

const emptyFields = Object.fromEntries(required.map((field) => [field, {
  count: records.filter((record) => record.cellStates[field] === 'empty').length,
  rows: records.filter((record) => record.cellStates[field] === 'empty').map((record) => record.source.rowNumber),
}]).filter(([, details]) => details.count > 0))
const regimeCounts = Object.fromEntries(['SN', 'LR', 'LP'].map((regime) => [regime, records.filter((record) => record.company.regime === regime).length]))
const questorDecimals = records.filter(({ company }) => /^\d+\.0+$/.test(company.questorCode ?? '')).map(({ company, source, rawValues, displayValues }) => ({
  value: company.questorCode, rawNumeric: rawValues.Questor, excelDisplay: displayValues.Questor, rowNumber: source.rowNumber, cnpj: company.cnpj, razaoSocial: company.razaoSocial,
}))
const municipalityValues = [...new Set(records.map(({ company }) => company.cidade).filter(Boolean))]
const canonicalMunicipality = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toUpperCase()
const cityGroups = new Map()
for (const value of municipalityValues) {
  const key = canonicalMunicipality(value)
  const group = cityGroups.get(key) ?? []
  group.push(value)
  cityGroups.set(key, group)
}
const municipalitySuggestions = [...cityGroups.entries()].filter(([, variants]) => variants.length > 1).map(([proposed, variants]) => ({ proposed, originals: variants }))
const blankQuestorRows = emptyFields.Questor?.rows ?? []
const blankAnalystRows = emptyFields.ANALISTA?.rows ?? []
const formulaCells = records.flatMap(({ source, formulas, rawValues }) => Object.entries(formulas).map(([field, formula]) => ({ rowNumber: source.rowNumber, field, formula, cachedResult: rawValues[field] })))
const cnpjs = records.map(({ company }) => company.cnpj)
const duplicateCnpjs = [...new Set(cnpjs.filter((cnpj, index) => cnpjs.indexOf(cnpj) !== index))]

const preview = {
  formatVersion: 1,
  previewOnly: true,
  source: { fileName: path.basename(sourcePath), sha256: sourceSha256, sheet: sheetName, asOfPeriod: '2026-11' },
  scope: { targetModel: 'Company', recordCount: records.length, excludedModels: ['DigitalCertificate', 'Integration', 'CompanyGroup', 'CompanyGroupMembership', 'TaxFiling', 'Task'] },
  idempotency: { operation: 'upsert', key: 'Company.cnpj', value: 'CNPJ validado reduzido a 14 dígitos', uniqueWithinPreview: new Set(cnpjs).size === cnpjs.length, deterministicSourceKey: 'SHA-256(fileSha256 + sheetName + rowNumber)' },
  counts: { byRegime: regimeCounts, validCnpjs: records.filter(({ cnpjValid }) => cnpjValid).length, invalidCnpjs: records.filter(({ cnpjValid }) => !cnpjValid).length, duplicateCnpjs: duplicateCnpjs.length, formulaCells: formulaCells.length, emptyFields },
  records,
}
const mapping = {
  formatVersion: 1,
  source: { fileName: path.basename(sourcePath), sha256: sourceSha256, sheetName, headerRow: 1, firstDataRow: 2, lastDataRow: 368 },
  targetModel: 'Company',
  operationalIdentity: { field: 'cnpj', sourceField: 'CNPJ', transform: 'remover pontuação; validar 14 dígitos e dígitos verificadores; usar como chave de upsert', databaseConstraint: 'Company.cnpj @unique', duplicatesWithinPreview: duplicateCnpjs },
  mappings: [
    ['CNPJ', 'cnpj', 'string de 14 dígitos validada; original em cnpjDisplay'],
    ['CNPJ', 'cnpjDisplay', 'texto exibido original'], ['EMPRESAS', 'razaoSocial', 'literal'], ['Questor', 'questorCode', 'literal; vazio continua null'],
    ['IE', 'inscricaoEstadual', 'literal'], ['TRIBUT.', 'regime', 'literal SN/LR/LP, compatível com Company.regime String'],
    ['STATUS', 'status', 'literal cadastral; nenhuma inferência de regularidade'], ['MUNICÍPIO', 'cidade', 'literal original; sugestão separada em municípioNormalization'],
    ['UF', 'uf', 'literal'], ['ANALISTA', 'responsavel', 'literal; vazio continua null'], ['GRUPO', 'grupo', 'literal'],
    ['OBS', 'observacoes', 'literal'], ['UNIDADE', 'unit', 'resultado em cache da fórmula; expressão separada em source.formulas'],
    ['UNIDADE', 'branchType', 'MATRIZ→HEADQUARTERS; FILIAL→BRANCH; demais→UNKNOWN'], ['GRUPO AUT. SN', 'automationGroup', 'literal'],
    ['CERTIFICADO', 'certificateSourceStatus', 'literal; sem criar DigitalCertificate'], ['ZEN Qdrive', 'zenQdriveSourceStatus', 'literal; sem criar Integration'],
    ['UNECONT', 'unecontSourceStatus', 'literal; sem criar Integration'],
  ].map(([sourceField, targetField, rule]) => ({ sourceField, targetModel: 'Company', targetField, rule })),
  targetFieldsNotPresentInSource: ['nomeFantasia', 'email', 'telefone', 'vencimento'],
  municipalityNormalizationProposals: municipalitySuggestions,
  preservedOnly: ['IMPORT. AUT. QUIU', 'STATUS IMPORT.\nQUIU'],
  provenance: { sourceRecordShape: ['sourceKey', 'fileName', 'fileSha256', 'sheetName', 'rowNumber'], rawValues: '18 colunas com valor/tipo armazenado no Excel, vazio=null', displayValues: 'texto formatado exibido pelo Excel', cellStates: 'empty/dash/unknown/not_informed/provided/formula', formulas: 'expressão original com = prefixado', formulaStrategy: 'manter resultado em rawValues e Company.unit, expressão em formulas' },
  noSchemaChange: true,
  excluded: ['certificados', 'integrações', 'grupos', 'obrigações', 'TaxFiling'],
}

const audit = [
  '# Etapa 14 — Auditoria da prévia de importação da carteira de novembro/2026', '',
  `Data: 09/11/2026. Fonte: \`imports/original/${path.basename(sourcePath)}\`; aba exclusiva: \`${sheetName}\`.`,
  `SHA-256 da fonte: \`${sourceSha256}\`. A prévia é local e não foi gravada no banco.`, '',
  '## Contagens validadas', '',
  '| Item | Esperado | Prévia |', '|---|---:|---:|',
  `| Empresas | 367 | ${records.length} |`, `| SN | 100 | ${regimeCounts.SN} |`, `| LR | 125 | ${regimeCounts.LR} |`, `| LP | 142 | ${regimeCounts.LP} |`,
  `| CNPJ válido e único | 367 | ${records.filter(({ cnpjValid }) => cnpjValid).length}; duplicados ${duplicateCnpjs.length} |`,
  `| Fórmulas preservadas | 367 | ${formulaCells.length} |`, '',
  '## Integridade e idempotência', '',
  '- Cada linha com dados da aba foi representada com a linha Excel e `sourceKey` determinístico por hash do arquivo, aba e linha.',
  '- A chave operacional é o CNPJ validado em 14 dígitos, alinhada ao `Company.cnpj @unique`; a operação proposta é upsert. A prévia tem 367 chaves distintas.',
  '- Fórmula da coluna UNIDADE: resultado em cache fica em `rawValues.UNIDADE` e no payload `Company.unit`; expressão fica separada em `formulas.UNIDADE`. `branchType` é derivado do resultado em cache.',
  '- Todos os valores fonte permanecem em `rawValues`; ausências são `null` e marcadas como `empty` em `cellStates`. Traço permanece literal.',
  '- Nenhum schema ou migration foi alterado; não houve conexão ou gravação em banco, nem importação real.',
  '- Escopo exclusivo `Company`; certificados, integrações, grupos, obrigações e `TaxFiling` não fazem parte desta prévia.', '',
  '## Campos vazios', '',
  '| Campo de origem | Vazios |', '|---|---:|',
  ...Object.entries(emptyFields).map(([field, details]) => `| ${field.replaceAll('\n', ' ')} | ${details.count} |`), '',
  `- Questor vazio: ${blankQuestorRows.length}; valores ausentes preservados como null.`,
  `- Analista vazio: ${blankAnalystRows.length}; todos preservados como null, sem atribuição inferida.`, '',
  '## Resultado dos checks', '',
  `- Contagem e distribuição de regimes: ${records.length === 367 && regimeCounts.SN === 100 && regimeCounts.LR === 125 && regimeCounts.LP === 142 ? 'PASSOU' : 'FALHOU'}.`,
  `- CNPJ: válidos ${records.filter(({ cnpjValid }) => cnpjValid).length}/367; inválidos ${records.filter(({ cnpjValid }) => !cnpjValid).length}; duplicados ${duplicateCnpjs.length}: ${records.length === 367 && duplicateCnpjs.length === 0 && records.every(({ cnpjValid }) => cnpjValid) ? 'PASSOU' : 'FALHOU'}.`,
  `- Idempotência: CNPJ distintos ${new Set(cnpjs).size}/367; sourceKeys distintos ${new Set(records.map(({ source }) => source.sourceKey)).size}/367: ${new Set(cnpjs).size === 367 && new Set(records.map(({ source }) => source.sourceKey)).size === 367 ? 'PASSOU' : 'FALHOU'}.`,
  `- Integridade de rastreabilidade: todas as linhas e valores brutos presentes: ${records.every(({ source, rawValues }) => source.sheetName === sheetName && source.rowNumber >= 2 && Object.keys(rawValues).length === 18) ? 'PASSOU' : 'FALHOU'}.`,
  '', 'Ver detalhes campo a campo em `etapa-14-divergencias-2026-11-09.md`; payload em `../processed/november-2026.preview.json` e mapeamento em `../processed/november-2026.mapping.json`.',
].join('\n')

const divergences = [
  '# Etapa 14 — Divergências e itens de revisão', '',
  `Fonte: \`${path.basename(sourcePath)}\`; aba única: \`${sheetName}\`; SHA-256: \`${sourceSha256}\`.`,
  'A análise preserva os valores originais. Propostas de normalização ficam separadas e não alteram o payload.', '',
  '## Questor vazio', '',
  `17 códigos Questor estão vazios e permanecem null. Linhas Excel: ${blankQuestorRows.join(', ')}.`, '',
  '## Questor com sufixo decimal', '',
  'Nove valores terminam em `.0`; foram mantidos literalmente, sem correção automática. As células de origem são numéricas: a prévia conserva o valor armazenado, a formatação exibida pelo Excel e a representação decimal candidata em Company.questorCode.', '',
  '| Linha | Número armazenado | Texto exibido no Excel | Questor candidato preservado | CNPJ | Empresa |', '|---:|---:|---|---|---|---|',
  ...questorDecimals.map((item) => `| ${item.rowNumber} | ${item.rawNumeric} | ${item.excelDisplay} | ${item.value} | ${item.cnpj} | ${item.razaoSocial} |`), '',
  'O formato apresentado pelo Excel como fração (por exemplo, 8/1) também foi preservado, sem assumir se o código pretendido é a fração ou o serial numérico. Confirmar com fonte Questor antes de qualquer correção.', '',
  '## Município: grafia preservada e normalização proposta', '',
  'O campo `Company.cidade` conserva a grafia/capitalização original. A proposta abaixo remove acentos, uniformiza espaços e usa caixa alta; serve apenas para revisão e não foi aplicada ao payload.', '',
  '| Valor proposto | Variantes originais na aba |', '|---|---|',
  ...municipalitySuggestions.map(({ proposed, originals }) => `| ${proposed} | ${originals.map((value) => `\`${value}\``).join(', ')} |`), '',
  '## Outros campos vazios', '',
  '| Campo | Vazios | Linhas Excel |', '|---|---:|---|',
  ...Object.entries(emptyFields).map(([field, details]) => `| ${field.replaceAll('\n', ' ')} | ${details.count} | ${details.rows.join(', ')} |`), '',
  `ANALISTA permanece vazio em ${blankAnalystRows.length} registros; nenhum responsável foi inferido.`,
  `Questor permanece vazio em ${blankQuestorRows.length} registros. Os demais vazios, incluindo certificados, integrações, observações e o campo de status Questor, estão enumerados acima e classificados individualmente em \`cellStates\`.`, '',
  '## Fórmulas', '',
  `A aba contém ${formulaCells.length} fórmulas na coluna UNIDADE. Os resultados em cache foram preservados no valor original e no campo Company.unit; cada expressão consta no objeto \`formulas\`. A classificação \`branchType\` deriva do resultado em cache e não substitui a fórmula.`, '',
  '## Revisão necessária antes de eventual importação real', '',
  '- Confirmar os nove códigos decimais com fonte autoritativa Questor.',
  '- Se desejar padronizar municípios, aprovar regras e manter valor original para rastreabilidade.',
  '- Atribuições de analista permanecem vazias conforme a fonte.',
  '- A presente prévia não cria certificados, integrações, grupos, obrigações ou `TaxFiling` e não realiza gravação no banco.',
].join('\n')

const processedDir = path.join(root, 'imports/processed')
const reportsDir = path.join(root, 'imports/reports')
fs.writeFileSync(path.join(processedDir, 'november-2026.preview.json'), `${JSON.stringify(preview, null, 2)}\n`)
fs.writeFileSync(path.join(processedDir, 'november-2026.mapping.json'), `${JSON.stringify(mapping, null, 2)}\n`)
fs.writeFileSync(path.join(reportsDir, 'etapa-14-auditoria-previa-2026-11-09.md'), `${audit}\n`)
fs.writeFileSync(path.join(reportsDir, 'etapa-14-divergencias-2026-11-09.md'), `${divergences}\n`)
console.log(JSON.stringify({ sourceSha256, records: records.length, regimeCounts, validCnpjs: records.filter(({ cnpjValid }) => cnpjValid).length, duplicates: duplicateCnpjs.length, formulas: formulaCells.length, blankQuestor: blankQuestorRows.length, blankAnalyst: blankAnalystRows.length, decimalQuestor: questorDecimals.length, municipalityGroups: municipalitySuggestions.length }, null, 2))
