// Reglas de negocio calculadas: MRR, referidos, saldos, cobros esperados y alertas.
import type { Client, DB, Invoice, Opportunity, Payment, Project, ProjectPhase, Quote, QuoteItem, Subscription, Task } from './types'
import type { Settings } from './constants'
import { OPEN_STAGES } from './constants'
import { addDays, addMonths, diffDays, todayISO } from './format'

const live = <T extends { deleted_at?: string | null }>(arr: T[]) => arr.filter((r) => !r.deleted_at)

// ---------- Suscripciones y referidos ----------

export function referralDiscount(db: DB, sub: Subscription, s: Settings): { discount: number; count: number } {
  if (!sub.apply_referrals) return { discount: 0, count: 0 }
  const windowEnd = sub.start_date ? addMonths(sub.start_date, s.referral_window_months) : null
  const refs = live(db.referrals)
    .filter((r) => r.referrer_client_id === sub.client_id && r.active)
    .filter((r) => !windowEnd || r.signed_date <= windowEnd)
    .sort((a, b) => a.signed_date.localeCompare(b.signed_date))
  const steps = s.referral_steps
  let discount = 0
  refs.forEach((_, i) => (discount += steps[i] ?? 0))
  return { discount, count: refs.length }
}

export function subUnitPrice(db: DB, sub: Subscription, s: Settings): number {
  const { discount } = referralDiscount(db, sub, s)
  const floor = sub.price_floor ?? s.referral_floor
  const p = sub.unit_price - discount
  return discount > 0 ? Math.max(floor, p) : sub.unit_price
}
export function subMonthly(db: DB, sub: Subscription, s: Settings): number {
  return subUnitPrice(db, sub, s) * sub.quantity
}
export function minTermEnd(sub: Subscription): string | null {
  return sub.start_date && sub.min_term_months ? addMonths(sub.start_date, sub.min_term_months) : null
}

export function mrr(db: DB, s: Settings) {
  const subs = live(db.subscriptions)
  const active = subs.filter((x) => x.status === 'activa').reduce((a, x) => a + subMonthly(db, x, s), 0)
  const committed = subs.filter((x) => x.status === 'pendiente').reduce((a, x) => a + subMonthly(db, x, s), 0)
  return { active, committed, arr: active * 12 }
}

/** Fechas de cobro de una suscripción en un rango [from, to]. */
export function billingDates(sub: Subscription, from: string, to: string): string[] {
  if (!sub.start_date || sub.status === 'cancelada') return []
  const out: string[] = []
  let d = sub.start_date
  let i = 0
  while (d <= to && i < 240) {
    if (d >= from && (!sub.cancellation_date || d < sub.cancellation_date)) out.push(d)
    i++
    d = addMonths(sub.start_date, i)
  }
  return out
}

export interface ExpectedCharge {
  sub: Subscription
  date: string
  period: string
  amount: number
  invoice?: Invoice
}
/** Cobros esperados de suscripciones (mensualidades) y si ya tienen factura. */
export function expectedCharges(db: DB, s: Settings, from: string, to: string): ExpectedCharge[] {
  const invs = live(db.invoices).filter((i) => i.status !== 'cancelada')
  const out: ExpectedCharge[] = []
  for (const sub of live(db.subscriptions)) {
    if (sub.status === 'cancelada' || sub.status === 'pausada') continue
    for (const date of billingDates(sub, from, to)) {
      const period = date.slice(0, 7)
      out.push({ sub, date, period, amount: subMonthly(db, sub, s), invoice: invs.find((i) => i.subscription_id === sub.id && i.period === period) })
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

// ---------- Facturas y pagos ----------

export function invoicePaid(db: DB, inv: Invoice): number {
  return live(db.payments)
    .filter((p) => p.invoice_id === inv.id)
    .reduce((a, p) => a + p.amount, 0)
}
export function invoiceBalance(db: DB, inv: Invoice): number {
  if (inv.status === 'cancelada') return 0
  return Math.max(0, Math.round((inv.total - invoicePaid(db, inv)) * 100) / 100)
}
export type PayState = 'borrador' | 'cancelada' | 'pagada' | 'parcial' | 'vencida' | 'pendiente'
export function invoicePayState(db: DB, inv: Invoice): PayState {
  if (inv.status === 'cancelada') return 'cancelada'
  if (inv.status === 'borrador') return 'borrador'
  const paid = invoicePaid(db, inv)
  if (paid >= inv.total - 0.01) return 'pagada'
  if (inv.due_date && inv.due_date < todayISO()) return 'vencida'
  if (paid > 0) return 'parcial'
  return 'pendiente'
}
export function receivables(db: DB) {
  const invs = live(db.invoices).filter((i) => i.status === 'emitida')
  let total = 0
  let overdue = 0
  for (const i of invs) {
    const b = invoiceBalance(db, i)
    total += b
    if (b > 0 && i.due_date && i.due_date < todayISO()) overdue += b
  }
  return { total, overdue }
}
export function collectedInMonth(payments: Payment[], ym: string) {
  return live(payments)
    .filter((p) => p.payment_date.startsWith(ym))
    .reduce((a, p) => a + p.amount, 0)
}

// ---------- Cotizaciones ----------

export function quoteTotals(items: QuoteItem[]) {
  let monthly = 0
  let once = 0
  let monthlyList = 0
  let onceList = 0
  for (const it of live(items)) {
    const gross = it.quantity * it.unit_price
    const net = gross - (it.discount || 0)
    if (it.kind === 'mensual') {
      monthly += net
      monthlyList += gross
    } else {
      once += net
      onceList += gross
    }
  }
  return { monthly, once, monthlyList, onceList }
}
export function quoteEffectiveStatus(q: Quote): Quote['status'] {
  if (q.status === 'enviada' && q.valid_until && q.valid_until < todayISO()) return 'vencida'
  return q.status
}

// ---------- Pipeline ----------

export function isOpen(o: Opportunity) {
  return OPEN_STAGES.includes(o.stage)
}
/** Valor de una oportunidad: pago único + 12 meses de recurrente (valor anual). */
export function oppValue(o: Opportunity) {
  return (o.estimated_value || 0) + (o.estimated_mrr || 0) * 12
}
export function pipelineSummary(db: DB) {
  const open = live(db.opportunities).filter(isOpen)
  const total = open.reduce((a, o) => a + oppValue(o), 0)
  const weighted = open.reduce((a, o) => a + (oppValue(o) * (o.probability || 0)) / 100, 0)
  const mrrOpen = open.reduce((a, o) => a + (o.estimated_mrr || 0), 0)
  const closed = live(db.opportunities).filter((o) => o.stage === 'ganada' || o.stage === 'perdida')
  const won = closed.filter((o) => o.stage === 'ganada').length
  return { open: open.length, total, weighted, mrrOpen, winRate: closed.length ? won / closed.length : null }
}
export function lastTouch(db: DB, o: Opportunity): string {
  const dates = live(db.interactions)
    .filter((i) => i.opportunity_id === o.id || (!i.opportunity_id && i.client_id === o.client_id))
    .map((i) => i.occurred_at.slice(0, 10))
  dates.push(o.updated_at.slice(0, 10))
  return dates.sort().at(-1)!
}

// ---------- Proyectos ----------

export function projectPhases(db: DB, p: Project): ProjectPhase[] {
  return live(db.project_phases)
    .filter((x) => x.project_id === p.id)
    .sort((a, b) => a.sort - b.sort)
}
export function projectProgress(db: DB, p: Project) {
  const ph = projectPhases(db, p)
  const done = ph.filter((x) => x.status === 'hecho').length
  const late = ph.filter((x) => x.status !== 'hecho' && x.due_date && x.due_date < todayISO())
  const current = ph.find((x) => x.status !== 'hecho')
  const hours = live(db.time_entries)
    .filter((t) => t.project_id === p.id)
    .reduce((a, t) => a + t.hours, 0)
  return { total: ph.length, done, pct: ph.length ? Math.round((done / ph.length) * 100) : 0, late, current, hours }
}
export function projectCost(db: DB, p: Project, s: Settings) {
  return live(db.time_entries)
    .filter((t) => t.project_id === p.id)
    .reduce((a, t) => {
      const u = db.profiles.find((x) => x.id === t.user_id)
      return a + t.hours * (u?.hourly_cost || s.default_hourly_cost)
    }, 0)
}

// ---------- Tareas ----------
export function taskOverdue(t: Task) {
  return t.status !== 'hecha' && !!t.due_date && t.due_date < todayISO()
}

// ---------- Distribución ----------
export function distribution(db: DB) {
  const clients = live(db.clients)
  const branches = live(db.branches)
  const subs = live(db.subscriptions).filter((x) => x.status !== 'cancelada')
  const activeBranches = subs.filter((x) => x.status === 'activa').reduce((a, x) => a + x.quantity, 0)
  const pendingBranches = subs.filter((x) => x.status === 'pendiente').reduce((a, x) => a + x.quantity, 0)
  const withService = clients.filter((c) => subs.some((x) => x.client_id === c.id))
  const potential = withService.reduce((a, c) => a + Math.max(c.total_branches ?? 0, branches.filter((b) => b.client_id === c.id).length), 0)
  return { activeBranches, pendingBranches, potential, clientsWithService: withService.length }
}

// ---------- Atención requerida ----------

export type AlertLevel = 'alta' | 'media' | 'baja'
export interface Alert {
  id: string
  level: AlertLevel
  area: 'Comercial' | 'Finanzas' | 'Proyectos' | 'Tareas' | 'Soporte' | 'Clientes'
  title: string
  detail: string
  to: string
  date?: string
}

export function buildAlerts(db: DB, s: Settings): Alert[] {
  const today = todayISO()
  const out: Alert[] = []
  const cname = (id?: string | null) => db.clients.find((c) => c.id === id)?.company_name ?? ''

  for (const o of live(db.opportunities).filter(isOpen)) {
    const touch = lastTouch(db, o)
    if (!o.next_followup_date) {
      out.push({ id: `opp-nf-${o.id}`, level: 'media', area: 'Comercial', title: `Sin próximo seguimiento: ${cname(o.client_id)}`, detail: o.title, to: `/oportunidades?o=${o.id}` })
    } else if (o.next_followup_date < today) {
      out.push({ id: `opp-od-${o.id}`, level: 'alta', area: 'Comercial', title: `Seguimiento vencido: ${cname(o.client_id)}`, detail: `${o.next_step ?? o.title}`, to: `/oportunidades?o=${o.id}`, date: o.next_followup_date })
    } else if (o.next_followup_date === today) {
      out.push({ id: `opp-td-${o.id}`, level: 'media', area: 'Comercial', title: `Seguimiento hoy: ${cname(o.client_id)}`, detail: `${o.next_step ?? o.title}`, to: `/oportunidades?o=${o.id}`, date: o.next_followup_date })
    }
    const stale = diffDays(today, touch)
    if (stale >= s.followup_stale_days && (!o.next_followup_date || o.next_followup_date <= today)) {
      out.push({ id: `opp-st-${o.id}`, level: 'media', area: 'Comercial', title: `${stale} días sin actividad: ${cname(o.client_id)}`, detail: o.title, to: `/oportunidades?o=${o.id}`, date: touch })
    }
  }

  for (const q of live(db.quotes)) {
    if (q.status !== 'enviada' || !q.valid_until) continue
    const d = diffDays(q.valid_until, today)
    if (d < 0) out.push({ id: `q-ex-${q.id}`, level: 'media', area: 'Comercial', title: `Cotización vencida: ${q.folio}`, detail: `${cname(q.client_id)} · márcala como vencida o envía una nueva versión`, to: `/cotizaciones/${q.id}`, date: q.valid_until })
    else if (d <= s.quote_expiry_warning_days) out.push({ id: `q-sx-${q.id}`, level: 'media', area: 'Comercial', title: `Cotización por vencer: ${q.folio}`, detail: `${cname(q.client_id)} · vence en ${d} días`, to: `/cotizaciones/${q.id}`, date: q.valid_until })
  }

  for (const inv of live(db.invoices)) {
    if (inv.status !== 'emitida') continue
    const bal = invoiceBalance(db, inv)
    if (bal <= 0) continue
    if (inv.due_date && inv.due_date < today) {
      out.push({ id: `inv-od-${inv.id}`, level: 'alta', area: 'Finanzas', title: `Pago vencido: ${cname(inv.client_id)}`, detail: `${inv.folio ?? inv.concept} · saldo $${bal.toLocaleString('es-MX')}`, to: `/finanzas?tab=facturas&f=${inv.id}`, date: inv.due_date })
    }
    for (const n of s.invoice_reminder_days) {
      if (addDays(inv.issue_date, n) === today)
        out.push({ id: `inv-rm-${inv.id}-${n}`, level: 'media', area: 'Finanzas', title: `Recordatorio de cobro (día ${n}): ${cname(inv.client_id)}`, detail: `${inv.folio ?? inv.concept} · saldo $${bal.toLocaleString('es-MX')}`, to: `/finanzas?tab=facturas&f=${inv.id}`, date: today })
    }
  }

  for (const ch of expectedCharges(db, s, addDays(today, -60), addDays(today, 5))) {
    if (ch.invoice) continue
    const late = ch.date < today
    out.push({ id: `chg-${ch.sub.id}-${ch.period}`, level: late ? 'alta' : 'media', area: 'Finanzas', title: `${late ? 'Mensualidad sin facturar' : 'Facturar mensualidad'}: ${cname(ch.sub.client_id)}`, detail: `Periodo ${ch.period} · $${ch.amount.toLocaleString('es-MX')}`, to: `/finanzas?tab=cobros`, date: ch.date })
  }

  for (const sub of live(db.subscriptions)) {
    if (sub.status === 'pendiente' && sub.start_date && sub.start_date < today)
      out.push({ id: `sub-st-${sub.id}`, level: 'media', area: 'Finanzas', title: `Suscripción sin activar: ${cname(sub.client_id)}`, detail: `El inicio de cobro era el ${sub.start_date}. Márcala activa o mueve la fecha.`, to: `/clientes/${sub.client_id}?tab=servicios`, date: sub.start_date })
    const end = minTermEnd(sub)
    if (sub.status === 'activa' && end) {
      const d = diffDays(end, today)
      if (d >= 0 && d <= 30) out.push({ id: `sub-mt-${sub.id}`, level: 'baja', area: 'Clientes', title: `Fin de permanencia en ${d} días: ${cname(sub.client_id)}`, detail: 'Buen momento para renovar o ampliar.', to: `/clientes/${sub.client_id}?tab=servicios`, date: end })
    }
  }

  for (const p of live(db.projects).filter((x) => x.status === 'en_curso' || x.status === 'planeacion')) {
    for (const ph of projectPhases(db, p)) {
      if (ph.status === 'hecho' || !ph.due_date) continue
      if (ph.due_date < today) out.push({ id: `ph-${ph.id}`, level: 'alta', area: 'Proyectos', title: `Hito retrasado ${ph.milestone}: ${cname(p.client_id)}`, detail: `${ph.milestone_name} (${ph.name})`, to: `/proyectos/${p.id}`, date: ph.due_date })
      else if (diffDays(ph.due_date, today) <= 2) out.push({ id: `ph-s-${ph.id}`, level: 'media', area: 'Proyectos', title: `Hito ${ph.milestone} vence pronto: ${cname(p.client_id)}`, detail: ph.milestone_name, to: `/proyectos/${p.id}`, date: ph.due_date })
    }
  }

  for (const cr of live(db.change_requests)) {
    if (cr.status === 'registrado' || cr.status === 'estimado' || cr.status === 'cotizado')
      out.push({ id: `cr-${cr.id}`, level: 'baja', area: 'Proyectos', title: `Cambio de alcance sin aprobar: ${cname(cr.client_id)}`, detail: `${cr.title} · no se ejecuta sin aprobación por escrito`, to: `/proyectos/${cr.project_id}?tab=cambios`, date: cr.requested_date })
  }

  for (const t of live(db.tasks)) {
    if (taskOverdue(t)) out.push({ id: `t-${t.id}`, level: t.priority === 'alta' ? 'alta' : 'media', area: 'Tareas', title: t.kind === 'compromiso' ? `Compromiso incumplido: ${t.title}` : `Tarea vencida: ${t.title}`, detail: cname(t.client_id) || 'Interna', to: `/tareas?t=${t.id}`, date: t.due_date! })
  }

  for (const tk of live(db.tickets)) {
    if (tk.status === 'resuelto' || tk.status === 'cerrado') continue
    const hrs = (Date.now() - new Date(tk.created_at).getTime()) / 3600000
    if (!tk.first_response_at && hrs > 24) out.push({ id: `tk-${tk.id}`, level: 'alta', area: 'Soporte', title: `Solicitud sin respuesta: ${cname(tk.client_id)}`, detail: tk.title, to: `/soporte?t=${tk.id}`, date: tk.created_at.slice(0, 10) })
  }

  const rank = { alta: 0, media: 1, baja: 2 }
  return out.sort((a, b) => rank[a.level] - rank[b.level] || (a.date ?? '').localeCompare(b.date ?? ''))
}

export function clientRevenue(db: DB, c: Client) {
  return live(db.payments)
    .filter((p) => p.client_id === c.id)
    .reduce((a, p) => a + p.amount, 0)
}
