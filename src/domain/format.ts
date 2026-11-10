export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
export const formatDate = (value: string) => value ? /^\d{2}\/\d{2}\/\d{4}$/.test(value) ? value : new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(new Date(`${value}T12:00:00`)) : '—'
export const normalizeCnpj = (value: string) => value.replace(/[^a-z\d]/gi, '').toUpperCase()
export const formatCnpj = (value: string) => { const d = normalizeCnpj(value); return d.length === 14 ? d.replace(/^(.{2})(.{3})(.{3})(.{4})(.{2})$/, '$1.$2.$3/$4-$5') : value }
export function isValidCnpj(value: string) {
  const cnpj = normalizeCnpj(value)
  if (!/^[A-Z\d]{12}\d{2}$/.test(cnpj) || /^([A-Z\d])\1{13}$/.test(cnpj)) return false
  const digit = (base: string, weights: number[]) => {
    const total = [...base].reduce((sum, char, index) => sum + (char.charCodeAt(0) - 48) * weights[index], 0)
    const mod = total % 11
    return mod < 2 ? 0 : 11 - mod
  }
  const first = digit(cnpj.slice(0, 12), [5,4,3,2,9,8,7,6,5,4,3,2])
  const second = digit(`${cnpj.slice(0, 12)}${first}`, [6,5,4,3,2,9,8,7,6,5,4,3,2])
  return cnpj.endsWith(`${first}${second}`)
}
export const makeId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
