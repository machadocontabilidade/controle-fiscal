export type Regime = 'Simples Nacional' | 'Lucro Real' | 'Lucro Presumido'
export type SourceRecord = { sheet: string; rowNumber: number; section?: string; values: Record<string, string> }
export type Company = {
  id: string; razaoSocial: string; nomeFantasia: string; cnpj: string; regime: Regime
  status: 'Ativa' | 'Inativa' | 'Em implantação' | 'Suspensa'; cidade: string; uf: string; responsavel: string
  email: string; telefone: string; vencimento: string; grupo: string; observacoes: string; createdAt: string; updatedAt: string
  unidade?: string; sourceRecords?: SourceRecord[]
}
export type Pending = { id: string; titulo: string; empresa: string; tipo: string; prioridade: 'Alta' | 'Média' | 'Baixa'; prazo: string; status: 'Aberta' | 'Em andamento' | 'Concluída'; responsavel?: string }
export type Certificate = { id: string; empresa: string; tipo: string; validade: string; responsavel: string; status: string; cnpj?: string; sourceSheet?: string; sourceSection?: string }
export type Integration = { id: string; nome: string; fornecedor: string; status: 'Conectada' | 'Atenção' | 'Desconectada' | 'Sem status'; ultimaSincronia: string; cnpj?: string; responsavel?: string; sourceStatus?: string; sourceSheet?: string; sourceRow?: number }
export type Group = { id: string; nome: string; descricao: string; dataImportacao?: string; dataApuracao?: string; sourceSheet?: string; sourceRow?: number }
export type AuditEntry = { id: string; data: string; usuario: string; acao: string; modulo: string; detalhe: string }
export type AppUser = { id: string; nome: string; email: string; perfil: string; permissoes?: string[]; status: 'Ativo' | 'Inativo' }
export type TaxFiling = { id: string; regime: Regime; empresa: string; periodo: string; obrigacao: string; status: 'Não iniciada' | 'Em andamento' | 'Transmitida'; responsavel: string; prazo: string }
export type AppData = { companies: Company[]; pendencies: Pending[]; certificates: Certificate[]; integrations: Integration[]; groups: Group[]; audit: AuditEntry[]; users: AppUser[]; taxFilings: TaxFiling[]; officialSourceLoaded?: boolean }
export type ModuleKey = 'dashboard' | 'empresas' | 'simples' | 'real' | 'presumido' | 'certificados' | 'integracoes' | 'pendencias' | 'grupos' | 'historico' | 'usuarios' | 'configuracoes' | 'importacao'
