import { z } from 'zod'
import { isValidCnpj, normalizeCnpj } from './format'

export const companySchema = z.object({
  razaoSocial: z.string().trim().min(2, 'Informe a razão social.'),
  nomeFantasia: z.string().trim().default(''),
  cnpj: z.string().min(14, 'Informe o CNPJ completo.').transform(normalizeCnpj).refine((value) => value.length === 14, 'CNPJ deve ter 14 posições.').refine(isValidCnpj, 'CNPJ inválido. Confira os caracteres e dígitos verificadores.'),
  regime: z.enum(['Simples Nacional', 'Lucro Real', 'Lucro Presumido']),
  status: z.enum(['Ativa', 'Inativa', 'Em implantação', 'Suspensa']),
  cidade: z.string().trim().default(''), uf: z.string().trim().max(2, 'Use a sigla da UF.').default(''),
  responsavel: z.string().trim().default(''), email: z.string().trim().default('').refine((value) => !value || z.string().email().safeParse(value).success, 'E-mail inválido.'),
  telefone: z.string().trim().default(''), vencimento: z.string().default(''), grupo: z.string().default(''), observacoes: z.string().default(''),
})

export function validateCompany(input: unknown) {
  const result = companySchema.safeParse(input)
  if (!result.success) return { success: false as const, errors: Object.fromEntries(result.error.issues.map((issue) => [String(issue.path[0]), issue.message])) }
  return { success: true as const, data: result.data }
}
