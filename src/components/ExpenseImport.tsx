// Importa gastos pegados desde Excel (hoja Egresos) o un CSV.
import { useMemo, useState } from 'react'
import { useData } from '../lib/store'
import { Modal } from './ui'
import { useToast } from './Toast'
import { EXPENSE_CATEGORIES } from '../lib/constants'
import { money } from '../lib/format'
import type { Expense } from '../lib/types'

const norm = (x: string) => x.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
const COLS: Record<string, string[]> = {
  expense_date: ['fecha'],
  concept: ['concepto', 'descripcion', 'detalle'],
  vendor: ['proveedor', 'beneficiario'],
  category: ['categoria', 'rubro', 'tipo de gasto'],
  subtotal: ['subtotal', 'importe', 'sin iva', 'monto'],
  tax: ['iva'],
  total: ['total'],
  method: ['forma de pago', 'metodo', 'metodo de pago'],
  cfdi_folio: ['folio', 'cfdi', 'uuid'],
}

function parseNum(v?: string) {
  const n = Number(String(v ?? '').replace(/[$\s,]/g, ''))
  return isNaN(n) ? 0 : n
}
function parseDate(v?: string) {
  const s = String(v ?? '').trim()
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
function parseCategory(v?: string) {
  const s = norm(v ?? '')
  if (!s) return 'otros'
  const hit = EXPENSE_CATEGORIES.find((c) => norm(c.value) === s || norm(c.label).includes(s) || s.includes(norm(c.value)))
  return hit?.value ?? 'otros'
}
function splitRow(line: string) {
  if (line.includes('\t')) return line.split('\t')
  const out: string[] = []
  let cur = '', q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function parseExpenses(text: string, iva: number): { rows: Partial<Expense>[]; skipped: number; missing: string[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { rows: [], skipped: 0, missing: ['encabezados'] }
  const head = splitRow(lines[0]).map(norm)
  const idx: Record<string, number> = {}
  for (const [k, names] of Object.entries(COLS)) {
    const i = head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)))
    if (i >= 0) idx[k] = i
  }
  const missing = ['expense_date', 'concept'].filter((k) => idx[k] === undefined).map((k) => (k === 'expense_date' ? 'Fecha' : 'Concepto'))
  if (missing.length || (idx.subtotal === undefined && idx.total === undefined)) return { rows: [], skipped: 0, missing: [...missing, ...(idx.subtotal === undefined && idx.total === undefined ? ['Subtotal o Total'] : [])] }
  const rows: Partial<Expense>[] = []
  let skipped = 0
  for (const line of lines.slice(1)) {
    const c = splitRow(line)
    const get = (k: string) => (idx[k] !== undefined ? c[idx[k]]?.trim() : undefined)
    const date = parseDate(get('expense_date'))
    const concept = get('concept')
    let subtotal = parseNum(get('subtotal'))
    let total = parseNum(get('total'))
    let tax = get('tax') ? parseNum(get('tax')) : NaN
    if (!date || !concept || (!subtotal && !total)) { skipped++; continue }
    if (!subtotal) subtotal = isNaN(tax) ? Math.round((total / (1 + iva)) * 100) / 100 : total - tax
    if (isNaN(tax)) tax = total ? Math.round((total - subtotal) * 100) / 100 : Math.round(subtotal * iva * 100) / 100
    if (!total) total = Math.round((subtotal + tax) * 100) / 100
    const method = norm(get('method') ?? '')
    rows.push({
      expense_date: date, concept, vendor: get('vendor') || null, category: parseCategory(get('category')), kind: 'operativo',
      subtotal, tax, total, status: 'pagado',
      method: method.includes('transf') ? 'transferencia' : method.includes('efect') ? 'efectivo' : method.includes('tarj') ? 'tarjeta' : null,
      cfdi_folio: get('cfdi_folio') || null, notes: 'Importado del Excel',
    })
  }
  return { rows, skipped, missing: [] }
}

export function ExpenseImport({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { insert, settings } = useData()
  const toast = useToast()
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const parsed = useMemo(() => (text.trim() ? parseExpenses(text, settings.iva_rate) : null), [text, settings.iva_rate])
  const run = async () => {
    if (!parsed?.rows.length) return
    setBusy(true)
    try {
      for (const r of parsed.rows) await insert('expenses', r, { silent: true })
      toast.success(`${parsed.rows.length} gastos importados`)
      setText('')
      onClose()
    } catch (e) {
      toast.error(`Se detuvo la importación: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title="Importar gastos del Excel" width={640}>
      <div className="space-y-3 text-sm">
        <p className="text-stone-600">En la hoja <b>Egresos</b> selecciona la tabla con sus encabezados, cópiala (Ctrl C) y pégala aquí. También acepta CSV. Columnas que reconoce: Fecha, Concepto, Proveedor, Categoría, Subtotal, IVA, Total, Forma de pago, Folio.</p>
        <textarea className="input h-48 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} placeholder={'Fecha\tConcepto\tProveedor\tCategoría\tSubtotal\tIVA\tTotal\n05/11/2026\tPlan Pro\tSupabase\tsoftware\t430\t68.80\t498.80'} aria-label="Datos a importar" />
        {parsed && (parsed.missing.length ? (
          <p className="text-red-600">Faltan columnas: {parsed.missing.join(', ')}.</p>
        ) : (
          <p className="text-stone-600">
            {parsed.rows.length} gastos listos por {money(parsed.rows.reduce((t, r) => t + (r.total ?? 0), 0))} con IVA
            {parsed.skipped > 0 && <span className="text-amber-700"> · {parsed.skipped} filas sin fecha, concepto o monto se omitirán</span>}.
          </p>
        ))}
        <div className="flex justify-end gap-2">
          <button className="btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn-primary" disabled={!parsed?.rows.length || busy} onClick={run}>{busy ? 'Importando…' : 'Importar'}</button>
        </div>
      </div>
    </Modal>
  )
}
