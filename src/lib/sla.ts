// SLA de soporte en horas hábiles (lunes a viernes, horario configurable en Parámetros).
import type { Settings } from './constants'
import type { Ticket } from './types'

const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6

/** Mueve la fecha al siguiente instante hábil (si ya lo es, no cambia). */
function nextBusinessInstant(d: Date, s: Settings): Date {
  const x = new Date(d)
  for (let i = 0; i < 14; i++) {
    if (isWorkday(x)) {
      const open = new Date(x); open.setHours(s.business_start_hour, 0, 0, 0)
      const close = new Date(x); close.setHours(s.business_end_hour, 0, 0, 0)
      if (x < open) return open
      if (x < close) return x
    }
    x.setDate(x.getDate() + 1)
    x.setHours(s.business_start_hour, 0, 0, 0)
  }
  return x
}

export function addBusinessHours(start: Date, hours: number, s: Settings): Date {
  let cur = nextBusinessInstant(start, s)
  let left = hours * 3600000
  for (let i = 0; i < 400 && left > 0; i++) {
    const close = new Date(cur); close.setHours(s.business_end_hour, 0, 0, 0)
    const avail = close.getTime() - cur.getTime()
    if (left <= avail) return new Date(cur.getTime() + left)
    left -= avail
    cur = nextBusinessInstant(new Date(close.getTime() + 1000), s)
  }
  return cur
}

/** Horas hábiles transcurridas entre dos instantes. */
export function businessHoursBetween(a: Date, b: Date, s: Settings): number {
  if (b <= a) return 0
  let cur = nextBusinessInstant(a, s)
  let ms = 0
  for (let i = 0; i < 2000 && cur < b; i++) {
    const close = new Date(cur); close.setHours(s.business_end_hour, 0, 0, 0)
    const end = close < b ? close : b
    ms += Math.max(0, end.getTime() - cur.getTime())
    cur = nextBusinessInstant(new Date(close.getTime() + 1000), s)
  }
  return ms / 3600000
}

export function slaHours(t: Pick<Ticket, 'priority'>, s: Settings): number {
  return t.priority === 'alta' ? s.sla_alta_hours : t.priority === 'media' ? s.sla_media_hours : s.sla_baja_hours
}

export type SlaState = 'cumplido' | 'incumplido' | 'en_tiempo' | 'por_vencer' | 'vencido'
export interface SlaInfo {
  due: Date
  state: SlaState
  /** Horas hábiles que faltan (negativo si ya venció). Solo para tickets sin primera respuesta. */
  left: number
  /** Horas hábiles hasta la primera respuesta, si ya la hubo. */
  responseHours: number | null
}

/** El SLA mide el tiempo a la primera respuesta al cliente. */
export function ticketSla(t: Ticket, s: Settings, now = new Date()): SlaInfo {
  const created = new Date(t.created_at)
  const hours = slaHours(t, s)
  const due = addBusinessHours(created, hours, s)
  if (t.first_response_at) {
    const r = new Date(t.first_response_at)
    return { due, state: r <= due ? 'cumplido' : 'incumplido', left: 0, responseHours: businessHoursBetween(created, r, s) }
  }
  const closed = t.status === 'resuelto' || t.status === 'cerrado'
  if (closed) {
    const r = t.resolved_at ? new Date(t.resolved_at) : new Date(t.updated_at)
    return { due, state: r <= due ? 'cumplido' : 'incumplido', left: 0, responseHours: businessHoursBetween(created, r, s) }
  }
  const left = now <= due ? businessHoursBetween(now, due, s) : -businessHoursBetween(due, now, s)
  return { due, state: left < 0 ? 'vencido' : left <= Math.max(1, hours * 0.25) ? 'por_vencer' : 'en_tiempo', left, responseHours: null }
}

export const SLA_LABEL: Record<SlaState, { label: string; tone: 'green' | 'red' | 'amber' | 'neutral' | 'brand' }> = {
  cumplido: { label: 'SLA cumplido', tone: 'green' },
  incumplido: { label: 'SLA incumplido', tone: 'red' },
  en_tiempo: { label: 'En tiempo', tone: 'neutral' },
  por_vencer: { label: 'Por vencer', tone: 'amber' },
  vencido: { label: 'SLA vencido', tone: 'red' },
}

export function fmtHours(h: number): string {
  const a = Math.abs(h)
  if (a < 1) return `${Math.round(a * 60)} min`
  return `${a < 10 ? Math.round(a * 10) / 10 : Math.round(a)} h`
}
