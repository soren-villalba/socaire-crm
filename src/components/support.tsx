// Detalle de ticket: historial de respuestas, notas internas, cambios de estado y SLA.
import { useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { missingTables } from '../lib/backend'
import { Badge, Drawer, Segmented, StatusBadge } from './ui'
import { ClientLink, UserChip } from './links'
import { useQuick } from './QuickCreate'
import { useToast } from './Toast'
import { PRIORITY, TICKET_EVENT_KINDS, TICKET_STATUS } from '../lib/constants'
import { fdatetime } from '../lib/format'
import { SLA_LABEL, fmtHours, ticketSla } from '../lib/sla'
import type { Ticket, TicketEvent, TicketStatus } from '../lib/types'

export function SlaBadge({ t }: { t: Ticket }) {
  const { settings } = useData()
  const sla = ticketSla(t, settings)
  const l = SLA_LABEL[sla.state]
  const extra = sla.state === 'en_tiempo' || sla.state === 'por_vencer' ? ` · ${fmtHours(sla.left)}` : sla.state === 'vencido' ? ` · hace ${fmtHours(sla.left)}` : sla.responseHours != null ? ` · ${fmtHours(sla.responseHours)}` : ''
  return <Badge tone={l.tone}>{l.label}{extra}</Badge>
}

type ComposeKind = 'respuesta' | 'cliente' | 'nota'

export function TicketDrawer({ ticket, onClose }: { ticket: Ticket | null; onClose: () => void }) {
  const { db, insert, update, settings, me } = useData()
  const events = useTable('ticket_events')
  const quick = useQuick()
  const toast = useToast()
  const [kind, setKind] = useState<ComposeKind>('respuesta')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  // Siempre la versión más reciente del ticket (se actualiza al responder o cambiar estado).
  const t = ticket ? db.tickets.find((x) => x.id === ticket.id) ?? ticket : null
  const history = useMemo(() => (t ? events.filter((e) => e.ticket_id === t.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []), [events, t])
  const canLog = !missingTables.has('ticket_events')
  if (!t) return null
  const sla = ticketSla(t, settings)
  const closed = t.status === 'resuelto' || t.status === 'cerrado'

  const log = async (k: TicketEvent['kind'], text: string) => {
    if (canLog) await insert('ticket_events', { ticket_id: t.id, kind: k, body: text }, { silent: true })
  }

  const add = async () => {
    const text = body.trim()
    if (!text) return
    setBusy(true)
    try {
      await log(kind, text)
      const patch: Partial<Ticket> = {}
      if (kind === 'respuesta') {
        if (!t.first_response_at) patch.first_response_at = new Date().toISOString()
        if (t.status === 'nuevo' || t.status === 'asignado') patch.status = 'en_proceso'
        if (!t.assigned_to && me) patch.assigned_to = me.id
      }
      if (kind === 'cliente' && (t.status === 'esperando_cliente' || closed)) patch.status = 'en_proceso'
      if (!canLog) patch.description = [t.description, `[${TICKET_EVENT_KINDS[kind].label} · ${fdatetime(new Date().toISOString())}] ${text}`].filter(Boolean).join('\n\n')
      if (Object.keys(patch).length) await update('tickets', t.id, patch, { silent: true })
      setBody('')
      toast.success(kind === 'respuesta' && !t.first_response_at ? `Respuesta registrada · ${SLA_LABEL[new Date() <= sla.due ? 'cumplido' : 'incumplido'].label}` : 'Agregado al historial')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const setStatus = async (s: TicketStatus) => {
    setBusy(true)
    try {
      const now = new Date().toISOString()
      const patch: Partial<Ticket> = { status: s }
      if ((s === 'en_proceso' || s === 'esperando_cliente' || s === 'resuelto' || s === 'cerrado') && !t.first_response_at) patch.first_response_at = now
      if ((s === 'resuelto' || s === 'cerrado') && !t.resolved_at) patch.resolved_at = now
      if (s === 'resuelto' && body.trim()) patch.resolution = body.trim()
      if (s === 'en_proceso' && closed) patch.resolved_at = null
      await update('tickets', t.id, patch, { silent: true })
      await log('estado', `${TICKET_STATUS[t.status]?.label ?? t.status} → ${TICKET_STATUS[s].label}${patch.resolution ? `. Resolución: ${patch.resolution}` : ''}`)
      if (patch.resolution) setBody('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      width={600}
      title={t.title}
      subtitle={<span className="flex flex-wrap items-center gap-2"><ClientLink id={t.client_id} /><span className="capitalize">{t.category}</span><span>· abierto {fdatetime(t.created_at)}</span></span>}
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge map={PRIORITY} value={t.priority} />
          <StatusBadge map={TICKET_STATUS} value={t.status} />
          <SlaBadge t={t} />
          <span className="flex items-center gap-1 text-xs text-stone-500">Responsable <UserChip id={t.assigned_to} /></span>
          <button className="btn-ghost btn-sm ml-auto" onClick={() => { onClose(); quick.edit('ticket', t) }}><Pencil size={13} /> Editar</button>
        </div>
        <p className="text-xs text-stone-500">
          SLA de primera respuesta: {settings[`sla_${t.priority}_hours` as const]} h hábiles (lun–vie, {settings.business_start_hour}:00–{settings.business_end_hour}:00). Vence {fdatetime(sla.due.toISOString())}.
        </p>

        <div className="flex flex-wrap gap-1.5">
          {(['en_proceso', 'esperando_cliente', 'resuelto', 'cerrado'] as TicketStatus[]).filter((s) => s !== t.status).map((s) => (
            <button key={s} className={s === 'resuelto' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'} disabled={busy} onClick={() => setStatus(s)}>
              {s === 'en_proceso' && closed ? 'Reabrir' : TICKET_STATUS[s].label}
            </button>
          ))}
        </div>

        <ol className="space-y-3 border-l-2 border-stone-100 pl-4">
          <li>
            <div className="text-xs text-stone-500">{fdatetime(t.created_at)} · Ticket abierto</div>
            {t.description && <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{t.description}</p>}
          </li>
          {history.map((e) => {
            const k = TICKET_EVENT_KINDS[e.kind]
            const author = db.profiles.find((p) => p.id === e.created_by)?.full_name.split(' (')[0]
            return (
              <li key={e.id} className={e.kind === 'nota' ? 'rounded-lg bg-amber-50/60 p-2' : ''}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                  <Badge tone={k?.tone ?? 'neutral'}>{k?.label ?? e.kind}</Badge>
                  <span>{fdatetime(e.created_at)}</span>
                  {author && <span>· {author}</span>}
                </div>
                <p className={`mt-1 whitespace-pre-wrap text-sm ${e.kind === 'estado' ? 'text-stone-500' : 'text-stone-800'}`}>{e.body}</p>
              </li>
            )
          })}
          {t.resolution && !history.some((e) => e.body.includes(t.resolution!)) && (
            <li>
              <div className="text-xs text-stone-500">{fdatetime(t.resolved_at)} · Resolución</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-stone-700">{t.resolution}</p>
            </li>
          )}
        </ol>

        <div className="rounded-xl border border-stone-200 p-3">
          <Segmented<ComposeKind>
            value={kind}
            onChange={setKind}
            options={[{ value: 'respuesta', label: 'Respuesta al cliente' }, { value: 'cliente', label: 'Mensaje del cliente' }, { value: 'nota', label: 'Nota interna' }]}
          />
          <textarea
            className="input mt-2 h-24"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            aria-label="Texto"
            placeholder={kind === 'respuesta' ? 'Qué le respondiste (por WhatsApp o correo). La primera respuesta detiene el reloj del SLA.' : kind === 'cliente' ? 'Lo que escribió el cliente' : 'Solo la ve el equipo'}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) add() }}
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-stone-500">{canLog ? 'Ctrl + Enter para agregar. Si vas a resolver, escribe la resolución y pulsa Resuelto.' : 'Falta correr 0006: por ahora el historial se guarda en la descripción.'}</span>
            <button className="btn-primary btn-sm" disabled={busy || !body.trim()} onClick={add}>Agregar</button>
          </div>
        </div>
      </div>
    </Drawer>
  )
}
