import { useState, type ReactNode } from 'react'
import { X, Search, ChevronDown, Plus, Check, AlertCircle, Upload, Download, Eye, Pencil, Trash2, SlidersHorizontal, ChevronLeft, ChevronRight } from 'lucide-react'

export function Button({ children, onClick, variant = 'primary', type = 'button', disabled = false, className = '' }: { children: ReactNode; onClick?: () => void; variant?: 'primary' | 'outline' | 'ghost' | 'danger'; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  return <button type={type} onClick={onClick} disabled={disabled} className={`btn btn-${variant} ${className}`}>{children}</button>
}
export function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-title"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="page-action">{action}</div>}</div>
}
export function SearchBox({ value, onChange, placeholder = 'Buscar...' }: { value: string; onChange: (value: string) => void; placeholder?: string }) {
  return <label className="search-box"><Search size={16} /><input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />{value && <button type="button" onClick={() => onChange('')} aria-label="Limpar busca"><X size={14} /></button>}</label>
}
export function Modal({ title, children, onClose, size = 'normal' }: { title: string; children: ReactNode; onClose: () => void; size?: 'normal' | 'wide' }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}><section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-head"><div><h2 id="modal-title">{title}</h2></div><button className="icon-button" onClick={onClose} aria-label="Fechar"><X size={18} /></button></header><div className="modal-body">{children}</div></section></div>
}
export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty-state"><div className="empty-icon"><Search size={20} /></div><h3>{title}</h3><p>{detail}</p>{action}</div>
}
export function StatusBadge({ children, tone }: { children: ReactNode; tone?: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const text = String(children).toLocaleLowerCase('pt-BR'); const value = tone ?? (/(ativa|conectada|concluída|ativo|regular|válido)/.test(text) ? 'good' : /(atenção|andamento|implantação|vence)/.test(text) ? 'warn' : /(inativa|desconectada|inativo|expirad|aberta)/.test(text) ? 'bad' : 'neutral')
  return <span className={`badge badge-${value}`}><i />{children}</span>
}
export type Column<T> = { key: string; label: string; render?: (row: T) => React.ReactNode; sortable?: boolean }
export function DataTable<T extends { id: string }>({ rows, columns, page, pageSize, onPage, onSort, sortKey, sortDir, onEdit, onDelete, onView, viewLabel = 'Visualizar', empty, emptyDetail }: {
  rows: T[]; columns: Column<T>[]; page: number; pageSize: number; onPage: (page: number) => void; onSort: (key: string) => void; sortKey?: string; sortDir?: 'asc' | 'desc'; onEdit?: (row: T) => void; onDelete?: (row: T) => void; onView?: (row: T) => void; viewLabel?: string; empty: string; emptyDetail: string
}) {
  const pages = Math.max(1, Math.ceil(rows.length / pageSize)); const current = Math.min(page, pages); const visible = rows.slice((current - 1) * pageSize, current * pageSize)
  if (!rows.length) return <EmptyState title={empty} detail={emptyDetail} />
  return <div className="table-wrap"><table><thead><tr>{columns.map((col) => <th key={col.key}><button disabled={col.sortable === false} onClick={() => onSort(col.key)} className="th-sort">{col.label}{sortKey === col.key && <ChevronDown size={13} className={sortDir === 'asc' ? 'sort-up' : ''} />}</button></th>)}{(onView || onEdit || onDelete) && <th className="action-th">Ações</th>}</tr></thead><tbody>{visible.map((row) => <tr key={row.id}>{columns.map((col) => <td key={col.key}>{col.render ? col.render(row) : String((row as Record<string, unknown>)[col.key] ?? '—')}</td>)}{(onView || onEdit || onDelete) && <td><div className="row-actions">{onView && <button title={viewLabel} aria-label={viewLabel} onClick={() => onView(row)}><Eye size={15} /></button>}{onEdit && <button title="Editar" aria-label="Editar" onClick={() => onEdit(row)}><Pencil size={15} /></button>}{onDelete && <button title="Excluir" aria-label="Excluir" onClick={() => onDelete(row)} className="delete-action"><Trash2 size={15} /></button>}</div></td>}</tr>)}</tbody></table><div className="table-footer"><span>{rows.length} registro{rows.length === 1 ? '' : 's'}</span><div className="pagination"><button onClick={() => onPage(Math.max(1, current - 1))} disabled={current <= 1} aria-label="Página anterior"><ChevronLeft size={16} /></button><span>Página {current} de {pages}</span><button onClick={() => onPage(Math.min(pages, current + 1))} disabled={current >= pages} aria-label="Próxima página"><ChevronRight size={16} /></button></div></div></div>
}
export function FilterSelect({ value, onChange, options, label }: { value: string; onChange: (value: string) => void; options: string[]; label: string }) {
  return <label className="select-wrap"><SlidersHorizontal size={14} /><select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Todos {label.toLocaleLowerCase('pt-BR')}</option>{options.map((opt) => <option key={opt}>{opt}</option>)}</select><ChevronDown size={14} /></label>
}
export function Toast({ message, kind = 'success', onClose }: { message: string; kind?: 'success' | 'error'; onClose: () => void }) {
  return <div className={`toast toast-${kind}`} role="status">{kind === 'success' ? <Check size={17} /> : <AlertCircle size={17} />}{message}<button onClick={onClose} aria-label="Fechar aviso"><X size={15} /></button></div>
}
export function FilePicker({ onFile, accept = '.xlsx,.xls,.csv' }: { onFile: (file: File) => void; accept?: string }) {
  const [name, setName] = useState('')
  return <label className="file-picker"><input type="file" accept={accept} onChange={(e) => { const file = e.target.files?.[0]; if (file) { setName(file.name); onFile(file) } }} /><span className="file-picker-icon"><Upload size={18} /></span><strong>{name || 'Escolha uma planilha'}</strong><small>Excel ou CSV, até 10 MB</small></label>
}
export { Plus, Download }
