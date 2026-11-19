// Utilidades de formato y fechas. Las fechas de negocio se manejan como 'YYYY-MM-DD'
// en hora local (México) para evitar corrimientos por zona horaria.

const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const mxn2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 })

export const money = (n: number | null | undefined, decimals = false) =>
  n == null || isNaN(n) ? '—' : (decimals ? mxn2 : mxn).format(n)

export const num = (n: number | null | undefined, d = 0) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('es-MX', { maximumFractionDigits: d, minimumFractionDigits: 0 })

export function todayISO(): string {
  const d = new Date()
  return toISO(d)
}
export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
export function parseISO(s: string): Date {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export function addDays(s: string, n: number): string {
  const d = parseISO(s)
  d.setDate(d.getDate() + n)
  return toISO(d)
}
export function addMonths(s: string, n: number): string {
  const d = parseISO(s)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, last))
  return toISO(d)
}
export function diffDays(a: string, b: string): number {
  return Math.round((parseISO(a).getTime() - parseISO(b).getTime()) / 86400000)
}
export function addBusinessDays(s: string, n: number): string {
  let d = s
  let left = n
  while (left > 0) {
    d = addDays(d, 1)
    const wd = parseISO(d).getDay()
    if (wd !== 0 && wd !== 6) left--
  }
  return d
}

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const DAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']

export function fdate(s?: string | null, opts: { weekday?: boolean; year?: boolean } = {}): string {
  if (!s) return '—'
  const d = parseISO(s)
  const showYear = opts.year ?? d.getFullYear() !== new Date().getFullYear()
  return `${opts.weekday ? DAYS[d.getDay()] + ' ' : ''}${d.getDate()} ${MONTHS[d.getMonth()]}${showYear ? ' ' + d.getFullYear() : ''}`
}
export function fdatetime(s?: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return `${fdate(toISO(d))} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
export function monthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return `${MONTHS[m - 1]} ${y}`
}
export function relDays(s?: string | null): string {
  if (!s) return ''
  const n = diffDays(s, todayISO())
  if (n === 0) return 'hoy'
  if (n === 1) return 'mañana'
  if (n === -1) return 'ayer'
  if (n > 0) return `en ${n} días`
  return `hace ${-n} días`
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export function initials(name?: string | null): string {
  if (!name) return '?'
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((w) => /^[\p{L}]/u.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('')
}

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}
