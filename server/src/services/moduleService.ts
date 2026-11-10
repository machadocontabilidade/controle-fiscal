export type ModuleName = 'certificates' | 'integrations' | 'pendencies' | 'groups' | 'users' | 'audit' | 'tax/simples' | 'tax/real' | 'tax/presumido' | 'settings' | 'imports'
const supportedModules = new Set<ModuleName>(['certificates','integrations','pendencies','groups','users','audit','tax/simples','tax/real','tax/presumido','settings','imports'])
export const moduleService = {
  supports: (name: string): name is ModuleName => supportedModules.has(name as ModuleName),
  list: async (_name: ModuleName) => [] as unknown[],
  find: async (_name: ModuleName, _id: string) => null as unknown | null,
}
