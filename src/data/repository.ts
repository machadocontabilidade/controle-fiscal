import { emptyData } from './emptyData'
import type { AppData, Company } from '../domain/types'

const STORAGE_KEY = 'machado-controle-fiscal:data:v1'
const wait = (ms = 110) => new Promise((resolve) => window.setTimeout(resolve, ms))
type OfficialData = Pick<AppData, 'companies' | 'certificates' | 'groups' | 'integrations'>

/** Data access boundary. Replace this implementation with an HTTP adapter without changing UI modules. */
export interface DataRepository {
  load(): Promise<AppData>
  save(data: AppData): Promise<void>
  clear(): Promise<void>
}

export class LocalStorageRepository implements DataRepository {
  async load(): Promise<AppData> {
    await wait()
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      const response = await fetch('/data/official-data.json')
      if (!response.ok) throw new Error('Não foi possível carregar a base oficial local.')
      const official = await response.json() as OfficialData
      if (!stored) return { ...structuredClone(emptyData), ...structuredClone(official), officialSourceLoaded: true }
      const data = { ...emptyData, ...JSON.parse(stored) } as AppData
      if (!data.officialSourceLoaded) {
        const source = official.companies as Company[]
        const localByCnpj = new Map(data.companies.map((company) => [company.cnpj.replace(/[^a-z\d]/gi, '').toUpperCase(), company]))
        for (const company of source) {
          const key = company.cnpj.replace(/[^a-z\d]/gi, '').toUpperCase()
          const local = localByCnpj.get(key)
          if (local) Object.assign(local, { sourceRecords: company.sourceRecords, unidade: company.unidade, grupo: local.grupo || company.grupo })
          else data.companies.push(company)
        }
        data.certificates.push(...official.certificates.filter((certificate) => !data.certificates.some((item) => item.id === certificate.id)))
        data.groups.push(...official.groups.filter((group) => !data.groups.some((item) => item.id === group.id)))
        data.integrations.push(...official.integrations.filter((integration) => !data.integrations.some((item) => item.id === integration.id)))
        data.officialSourceLoaded = true
      }
      return data
    } catch { return structuredClone(emptyData) }
  }
  async save(data: AppData) { await wait(); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) }
  async clear() { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...emptyData, officialSourceLoaded: true })) }
}

export const repository: DataRepository = new LocalStorageRepository()
