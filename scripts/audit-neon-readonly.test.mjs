import test from 'node:test'
import assert from 'node:assert/strict'
import {
  auditInReadOnlyTransaction,
  loadAuthorizedPreview,
  maskCnpj,
  runWithClient,
  safeErrorMessage,
  safeTlsPreflight,
} from './audit-neon-readonly.mjs'

const authorizedCompanyColumns = [
  'id', 'razaoSocial', 'nomeFantasia', 'cnpj', 'regime', 'status', 'cidade', 'uf',
  'vencimento', 'grupo', 'automationGroup', 'branchType', 'certificateSourceStatus',
  'cnpjDisplay', 'inscricaoEstadual', 'questorCode', 'unecontSourceStatus', 'unit',
  'zenQdriveSourceStatus',
]
const blockedCompanyColumns = ['responsavel', 'email', 'telefone', 'observacoes', 'createdAt', 'updatedAt']

const record = (cnpj = '12345678000195', rowNumber = 2) => ({
  cnpjValid: true,
  operationalKey: { value: cnpj },
  company: { cnpj, cnpjDisplay: cnpj, razaoSocial: 'Empresa', regime: 'SN', status: 'ATIVA' },
  source: { sheetName: 'SN, LR e LP - 112026', rowNumber },
})

function mockClient({ gate = 'on', found = [], failure } = {}) {
  const calls = []
  const tx = {
    $executeRaw: async (strings, ...values) => { calls.push({ type: 'execute', sql: strings.join('?'), values }) },
    $queryRaw: async (query, ...values) => {
      calls.push({ type: 'query', query: Array.isArray(query) ? { sql: query.join('?'), values } : query })
      if (failure) throw failure
      if (calls.filter(call => call.type === 'query').length === 1) return [{ transaction_read_only: gate }]
      return found
    },
  }
  return {
    calls,
    disconnected: 0,
    $transaction: async callback => callback(tx),
    $disconnect: async function () { this.disconnected++ },
  }
}

test('gate READ ONLY is the first SQL instruction and queries follow only after on', async () => {
  const client = mockClient()
  await auditInReadOnlyTransaction(client, [record()])
  assert.equal(client.calls[0].type, 'execute')
  assert.match(client.calls[0].sql, /SET TRANSACTION READ ONLY/)
  assert.equal(client.calls[1].type, 'query')
  assert.match(client.calls[1].query.sql, /current_setting\('transaction_read_only'\)/)
  assert.equal(client.calls[2].type, 'query')
})

test('gate result other than exactly on aborts before company query', async () => {
  const client = mockClient({ gate: 'off' })
  await assert.rejects(auditInReadOnlyTransaction(client, [record()]), /READ ONLY não confirmado/)
  assert.equal(client.calls.length, 2)
})

test('query errors do not trigger a fallback or retry', async () => {
  const client = mockClient({ failure: new Error('mock failure') })
  await assert.rejects(auditInReadOnlyTransaction(client, [record()]), /mock failure/)
  assert.equal(client.calls.filter(call => call.type === 'execute').length, 1)
  assert.equal(client.calls.filter(call => call.type === 'query').length, 1)
})

test('Company query uses Prisma bound parameters and only the authorized CNPJ', async () => {
  const client = mockClient()
  await auditInReadOnlyTransaction(client, [record()])
  const query = client.calls[2].query
  assert.ok(query.sql)
  assert.match(query.sql, /WHERE "cnpj" IN \(\?\)/)
  assert.deepEqual(query.values, ['12345678000195'])
  assert.doesNotMatch(query.sql, /12345678000195/)
})

test('Company SELECT explicitly contains only authorized columns', async () => {
  const client = mockClient()
  await auditInReadOnlyTransaction(client, [record()])
  const sql = client.calls[2].query.sql
  const selected = sql.match(/SELECT([\s\S]*?)FROM "Company"/i)?.[1]
  assert.ok(selected, 'Company SELECT list must be present')
  assert.doesNotMatch(selected, /\*/)
  const columns = [...selected.matchAll(/"([^"]+)"/g)].map(([, column]) => column)
  assert.deepEqual(columns, authorizedCompanyColumns)
  for (const column of blockedCompanyColumns) assert.ok(!columns.includes(column), `${column} must not be selected`)
})

test('comparison ignores fields outside the authorized Company allowlist', async () => {
  const client = mockClient({ found: [{
    cnpj: '12345678000195', cnpjDisplay: '12345678000195', razaoSocial: 'Empresa', regime: 'SN', status: 'ATIVA',
    responsavel: 'restricted', email: 'restricted', telefone: 'restricted', observacoes: 'restricted',
    createdAt: new Date(), updatedAt: new Date(),
  }] })
  const results = await auditInReadOnlyTransaction(client, [record()])
  assert.equal(results[0].status, 'IDENTICAL')
})

test('preview loader rejects rows outside the exact authorized tab or CNPJ scope', async () => {
  const sheetName = 'SN, LR e LP - 112026'
  const p = {
    previewOnly: true,
    source: { sheet: sheetName },
    records: Array.from({ length: 367 }, (_, index) => {
      const cnpj = String(index + 1).padStart(14, '0')
      return {
        cnpjValid: true,
        operationalKey: { value: cnpj },
        company: { cnpj },
        source: { sheetName },
      }
    }),
  }
  const m = { source: { sheetName } }
  assert.equal(loadAuthorizedPreview(p, m).length, 367)
  const altered = structuredClone(p)
  altered.records[0].source.sheetName = 'Outra aba'
  assert.throws(() => loadAuthorizedPreview(altered, m), /allowlist/)
})

test('TLS preflight reports only safe status and requires all three strict parameters', () => {
  const accepted = safeTlsPreflight('postgresql://user:secret@host/db?sslmode=require&sslaccept=strict&channel_binding=require')
  assert.equal(accepted.ok, true)
  const rejected = safeTlsPreflight('postgresql://user:secret@host/db?sslmode=require&channel_binding=require')
  assert.equal(rejected.ok, false)
  assert.doesNotMatch(JSON.stringify(rejected), /secret|host/)
})

test('CNPJ is masked in report references', () => {
  assert.equal(maskCnpj('12345678000195'), '12.***.***/****-95')
})

test('unexpected database errors are suppressed instead of logged', () => {
  const rendered = safeErrorMessage(new Error('postgresql://secret-token@host/db?sslpassword=hidden'))
  assert.doesNotMatch(rendered, /secret-token|host|hidden/)
})

test('connection is disconnected when audit fails', async () => {
  const client = mockClient({ gate: 'off' })
  await assert.rejects(runWithClient(client, [record()]), /READ ONLY não confirmado/)
  assert.equal(client.disconnected, 1)
})
