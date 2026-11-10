import type { Company, Regime } from '../domain/types'
import { makeId, normalizeCnpj } from '../domain/format'
import { validateCompany } from '../domain/validation'

const headerAliases: Record<string, string> = {
  'razao social': 'razaoSocial', 'razão social': 'razaoSocial', empresa: 'razaoSocial', empresas: 'razaoSocial', 'nome empresarial': 'razaoSocial',
  'nome fantasia': 'nomeFantasia', cnpj: 'cnpj', regime: 'regime', 'regime tributário': 'regime', 'regime tributario': 'regime',
  status: 'status', situação: 'status', situacao: 'status', cidade: 'cidade', município: 'cidade', municipio: 'cidade', uf: 'uf', estado: 'uf', unidade: 'unidade', tribut: 'regime', 'tribut.': 'regime', responsável: 'responsavel', responsavel: 'responsavel', analista: 'responsavel',
  email: 'email', 'e-mail': 'email', telefone: 'telefone', vencimento: 'vencimento', grupo: 'grupo', obs: 'observacoes', observações: 'observacoes', observacoes: 'observacoes',
}
const norm = (v: unknown) => String(v ?? '').trim()
const normalizeRegime = (value: string): Regime => {
  const v = value.toLocaleLowerCase('pt-BR')
  if (v.includes('presumido')) return 'Lucro Presumido'
  if (v.includes('real')) return 'Lucro Real'
  if (v.includes('simples') || v === 'sn') return 'Simples Nacional'
  if (v === 'lr') return 'Lucro Real'
  if (v === 'lp') return 'Lucro Presumido'
  return value as Regime
}
const normalizeStatus = (value: string) => {
  const status = value.toLocaleLowerCase('pt-BR').trim()
  if (status === 'ativa' || status === 'ativo') return 'Ativa'
  if (status === 'inativa' || status === 'inativo' || status === 'desativada') return 'Inativa'
  if (status === 'suspenso' || status === 'suspensa') return 'Suspensa'
  if (status.includes('implant')) return 'Em implantação'
  return value
}

export async function parseCompanies(file: File): Promise<{ companies: Company[]; errors: string[] }> {
  const XLSX = await import('xlsx')
  const buffer = await file.arrayBuffer()
  const book = XLSX.read(buffer, { type: 'array', cellDates: false })
  const sheetName = book.SheetNames[0]
  const sheet = book.Sheets[sheetName]
  if (!sheet) throw new Error('A planilha não contém abas para importar.')
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '', raw: false })
  const companies: Company[] = []; const errors: string[] = []
  rows.forEach((row, index) => {
    const mapped: Record<string, string> = {}
    for (const [key, value] of Object.entries(row)) mapped[headerAliases[key.toLocaleLowerCase('pt-BR').trim()] ?? key] = headerAliases[key.toLocaleLowerCase('pt-BR').trim()] === 'cnpj' ? normalizeCnpj(norm(value)) : norm(value)
    if (mapped.regime) mapped.regime = normalizeRegime(mapped.regime)
    if (mapped.status) mapped.status = normalizeStatus(mapped.status)
    const checked = validateCompany(mapped)
    if (!checked.success) { errors.push(`Linha ${index + 2}: ${Object.values(checked.errors).join(' ')}`); return }
    companies.push({ ...checked.data, unidade: mapped.unidade || '', sourceRecords: [{ sheet: sheetName, rowNumber: index + 2, values: Object.fromEntries(Object.entries(row).map(([key, value]) => [key, norm(value)])) }], id: makeId(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
  })
  return { companies, errors }
}

export async function exportCompanies(companies: Company[]) {
  const XLSX = await import('xlsx')
  const rows = companies.map(({ id: _id, createdAt: _created, updatedAt: _updated, sourceRecords: _sourceRecords, ...company }) => company)
  const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ mensagem: 'Sem registros cadastrados' }])
  const sourceRows = companies.flatMap((company) => (company.sourceRecords ?? []).map((record) => ({ CNPJ: company.cnpj, Empresa: company.razaoSocial, Aba: record.sheet, Linha: record.rowNumber, Seção: record.section ?? '', ...record.values })))
  const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, 'Empresas')
  if (sourceRows.length) XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(sourceRows), 'Origem vinculada')
  XLSX.writeFile(book, 'machado-empresas.xlsx')
}
