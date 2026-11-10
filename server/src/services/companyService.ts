// Repository contract for the future Prisma-backed implementation. This phase returns no sample records.
export interface CompanyRepository<T> { findAll(): Promise<T[]>; findById(id: string): Promise<T | null> }
const emptyRepository: CompanyRepository<never> = { findAll: async () => [], findById: async () => null }
export const companyService = {
  list: () => emptyRepository.findAll(),
  get: (id: string) => emptyRepository.findById(id),
}
