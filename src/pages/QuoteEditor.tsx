import logo from '../logo.svg'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Copy, Printer, Send, Check, X, Plus, Trash2, Lock, ExternalLink } from 'lucide-react'
import { useData, useTable } from '../lib/store'
import { Badge, Card, StatusBadge, Confirm } from '../components/ui'
import { ClientLink } from '../components/links'
import { useQuick } from '../components/QuickCreate'
import { DriveFolderButton, DriveIcon } from '../components/drive'
import { parseDrive } from '../lib/drive'
import { QUOTE_STATUS } from '../lib/constants'
import { addDays, fdate, money, todayISO } from '../lib/format'
import { quoteEffectiveStatus, quoteTotals } from '../lib/metrics'
import type { QuoteItem } from '../lib/types'

const DEFAULT_CONDITIONS = `Condiciones de pago: anticipo 50% · entrega 50% · IVA aparte (en productos por suscripción: a partir de la fecha de inicio del cobro).
Calendario de entrega: método VELERO; fecha estimada de salida: [fecha].
Inicio del servicio y del primer cobro: go-live o fecha acordada.
Permanencia mínima: [6] meses; si se cancela antes, el alta se cobra de forma proporcional.
Qué necesitamos del cliente: persona que decide, información en un plazo de 3 días hábiles, accesos.
Datos fiscales del cliente para el CFDI.
Cambios fuera del plan inicial se cotizan aparte como actualización.`

export default function QuoteEditor() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { db, insert, update, remove, byId, settings } = useData()
  const quotes = useTable('quotes')
  const creating = useRef(false)

  // Crear una cotización nueva (con folio consecutivo) y redirigir a su editor
  useEffect(() => {
    if (id !== 'nueva' || creating.current) return
    creating.current = true
    void (async () => {
      const year = new Date().getFullYear()
      const nums = quotes.map((q) => q.folio.match(new RegExp(`SOC-${year}-(\\d+)`))?.[1]).filter(Boolean).map(Number)
      const folio = `SOC-${year}-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0')}`
      const opp = byId('opportunities', params.get('opp'))
      const clientId = opp?.client_id ?? params.get('client') ?? db.clients.find((c) => !c.deleted_at)?.id
      if (!clientId) return
      const q = await insert('quotes', { folio, version: 1, client_id: clientId, opportunity_id: opp?.id ?? null, issue_date: todayISO(), valid_until: addDays(todayISO(), 30), status: 'borrador', title: opp?.title ?? '', conditions: DEFAULT_CONDITIONS }, { silent: true })
      const product = byId('products', opp?.product_id)
      if (product?.billing === 'mensual') {
        await insert('quote_items', { quote_id: q.id, product_id: product.id, description: `${product.name}, por ${product.unit}`, kind: 'mensual', quantity: 1, unit_price: product.list_price, discount: product.intro_price != null ? product.list_price - product.intro_price : 0, sort: 1 }, { silent: true })
        if (product.setup_fee) await insert('quote_items', { quote_id: q.id, product_id: product.id, description: 'Alta: catálogo, sucursales, configuración y capacitación', kind: 'unico', quantity: 1, unit_price: product.setup_fee, discount: 0, sort: 2 }, { silent: true })
      } else {
        await insert('quote_items', { quote_id: q.id, product_id: product?.id ?? null, description: product?.name ?? 'Concepto', kind: 'unico', quantity: 1, unit_price: opp?.estimated_value ?? 0, discount: 0, sort: 1 }, { silent: true })
      }
      navigate(`/cotizaciones/${q.id}`, { replace: true })
    })()
  }, [id, quotes, params, byId, db.clients, insert, navigate])

  const quote = id && id !== 'nueva' ? byId('quotes', id) : undefined
  const items = useMemo(() => db.quote_items.filter((i) => i.quote_id === quote?.id && !i.deleted_at).sort((a, b) => a.sort - b.sort), [db.quote_items, quote?.id])
  const versions = useMemo(() => quotes.filter((q) => q.folio === quote?.folio).sort((a, b) => b.version - a.version), [quotes, quote?.folio])
  const [confirmDel, setConfirmDel] = useState(false)
  const quick = useQuick()
  const docs = useMemo(() => db.documents.filter((d) => d.quote_id === quote?.id && !d.deleted_at), [db.documents, quote?.id])

  if (!quote) return <div className="text-stone-500">{id === 'nueva' ? 'Creando cotización…' : 'Cotización no encontrada.'}</div>

  const editable = quote.status === 'borrador'
  const t = quoteTotals(items)
  const client = byId('clients', quote.client_id)
  const clientOpps = db.opportunities.filter((o) => o.client_id === quote.client_id && !o.deleted_at)
  const status = quoteEffectiveStatus(quote)

  const setQ = (patch: Parameters<typeof update<'quotes'>>[2]) => update('quotes', quote.id, patch, { silent: true })
  const setItem = (it: QuoteItem, patch: Partial<QuoteItem>) => update('quote_items', it.id, patch, { silent: true })
  const addItem = () => insert('quote_items', { quote_id: quote.id, description: '', kind: 'unico', quantity: 1, unit_price: 0, discount: 0, sort: (items.at(-1)?.sort ?? 0) + 1 }, { silent: true })

  const newVersion = async () => {
    const nq = await insert('quotes', { ...quote, id: undefined, created_at: undefined, updated_at: undefined, version: Math.max(...versions.map((v) => v.version)) + 1, previous_version_id: quote.id, status: 'borrador', issue_date: todayISO(), valid_until: addDays(todayISO(), 30), accepted_at: null, file_path: null } as never, { silent: true })
    for (const it of items) await insert('quote_items', { ...it, id: undefined, created_at: undefined, updated_at: undefined, quote_id: nq.id } as never, { silent: true })
    if (quote.status === 'enviada' || quote.status === 'borrador') await update('quotes', quote.id, { status: 'reemplazada' }, { silent: true })
    navigate(`/cotizaciones/${nq.id}`)
  }
  const markSent = async () => {
    await setQ({ status: 'enviada' })
    const opp = byId('opportunities', quote.opportunity_id)
    if (opp && ['nuevo', 'primer_contacto', 'calificacion', 'diagnostico'].includes(opp.stage)) await update('opportunities', opp.id, { stage: 'propuesta', probability: 50, next_followup_date: addDays(todayISO(), 3), next_step: `Dar seguimiento a ${quote.folio}` }, { silent: true })
  }

  return (
    <>
      <div className="no-print mb-4 flex flex-wrap items-center gap-2">
        <Link to="/cotizaciones" className="btn-ghost px-1.5"><ArrowLeft size={18} /></Link>
        <h1 className="h1">{quote.folio}</h1>
        <Badge>v{quote.version}</Badge>
        <StatusBadge map={QUOTE_STATUS} value={status} />
        {!editable && <span className="flex items-center gap-1 text-xs text-stone-500"><Lock size={12} /> Solo lectura: crea una nueva versión para cambiarla</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {quote.status === 'borrador' && <button className="btn-primary" onClick={markSent}><Send size={14} /> Marcar enviada</button>}
          {(quote.status === 'enviada' || status === 'vencida') && (
            <>
              <button className="btn-primary" onClick={() => setQ({ status: 'aceptada', accepted_at: todayISO() })}><Check size={14} /> Aceptada</button>
              <button className="btn-secondary" onClick={() => setQ({ status: 'rechazada' })}><X size={14} /> Rechazada</button>
            </>
          )}
          <button className="btn-secondary" onClick={newVersion}><Copy size={14} /> Nueva versión</button>
          <button className="btn-secondary" onClick={() => window.print()}><Printer size={14} /> Imprimir / PDF</button>
          {editable && <button className="btn-ghost text-red-600" onClick={() => setConfirmDel(true)}><Trash2 size={14} /></button>}
        </div>
      </div>

      {quote.status === 'aceptada' && quote.opportunity_id && byId('opportunities', quote.opportunity_id)?.stage !== 'ganada' && (
        <div className="no-print mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          Cotización aceptada. <Link className="font-medium underline" to={`/oportunidades?o=${quote.opportunity_id}`}>Marca la oportunidad como ganada</Link> para crear la suscripción y el proyecto VELERO.
        </div>
      )}

      <div className="no-print grid gap-5 xl:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Card title="Datos generales">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="col-span-2">
                <label className="label">Cliente</label>
                <select className="input" disabled={!editable} value={quote.client_id} onChange={(e) => setQ({ client_id: e.target.value, opportunity_id: null })}>
                  {db.clients.filter((c) => !c.deleted_at).map((c) => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Oportunidad</label>
                <select className="input" disabled={!editable} value={quote.opportunity_id ?? ''} onChange={(e) => setQ({ opportunity_id: e.target.value || null })}>
                  <option value="">—</option>
                  {clientOpps.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="label">Título</label>
                <input className="input" disabled={!editable} defaultValue={quote.title ?? ''} key={quote.id + 't'} onBlur={(e) => setQ({ title: e.target.value })} />
              </div>
              <div>
                <label className="label">Fecha</label>
                <input className="input" type="date" disabled={!editable} value={quote.issue_date} onChange={(e) => setQ({ issue_date: e.target.value })} />
              </div>
              <div>
                <label className="label">Vigente hasta</label>
                <input className="input" type="date" disabled={!editable} value={quote.valid_until ?? ''} onChange={(e) => setQ({ valid_until: e.target.value })} />
              </div>
            </div>
          </Card>

          <Card title="Conceptos" bodyClass="" actions={editable && <button className="btn-secondary btn-sm" onClick={addItem}><Plus size={13} /> Concepto</button>}>
            <table className="w-full text-sm">
              <thead className="border-b border-stone-100">
                <tr>
                  <th className="th">Descripción</th>
                  <th className="th w-28">Cobro</th>
                  <th className="th w-20 text-right">Cant.</th>
                  <th className="th w-28 text-right">Precio</th>
                  <th className="th w-28 text-right">Descuento</th>
                  <th className="th w-28 text-right">Importe</th>
                  <th className="w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {items.map((it) => (
                  <tr key={it.id}>
                    <td className="td"><input className="input" disabled={!editable} defaultValue={it.description} onBlur={(e) => e.target.value !== it.description && setItem(it, { description: e.target.value })} /></td>
                    <td className="td">
                      <select className="input" disabled={!editable} value={it.kind} onChange={(e) => setItem(it, { kind: e.target.value as QuoteItem['kind'] })}>
                        <option value="mensual">Mensual</option>
                        <option value="unico">Pago único</option>
                      </select>
                    </td>
                    <td className="td"><input className="input tnum text-right" type="number" disabled={!editable} defaultValue={it.quantity} onBlur={(e) => setItem(it, { quantity: Number(e.target.value) })} /></td>
                    <td className="td"><input className="input tnum text-right" type="number" disabled={!editable} defaultValue={it.unit_price} onBlur={(e) => setItem(it, { unit_price: Number(e.target.value) })} /></td>
                    <td className="td"><input className="input tnum text-right" type="number" disabled={!editable} defaultValue={it.discount} onBlur={(e) => setItem(it, { discount: Number(e.target.value) })} /></td>
                    <td className="td tnum text-right font-medium">{money(it.quantity * it.unit_price - it.discount)}</td>
                    <td className="td">{editable && <button aria-label="Quitar" className="text-stone-300 hover:text-red-500" onClick={() => remove('quote_items', it.id, 'Concepto')}><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items.length === 0 && <p className="p-4 text-sm text-stone-500">Agrega al menos un concepto.</p>}
          </Card>

          <Card title="Condiciones y notas">
            <label className="label">Condiciones (se imprimen)</label>
            <textarea className="input" rows={7} disabled={!editable} defaultValue={quote.conditions ?? ''} key={quote.id + 'c'} onBlur={(e) => setQ({ conditions: e.target.value })} />
            <label className="label mt-3">Notas internas (no se imprimen)</label>
            <textarea className="input" rows={2} defaultValue={quote.notes ?? ''} key={quote.id + 'n'} onBlur={(e) => setQ({ notes: e.target.value })} />
            <label className="label mt-3">Archivo en la carpeta de socaire</label>
            <input className="input" placeholder="04_Ventas/Cotizaciones/…pdf" defaultValue={quote.file_path ?? ''} key={quote.id + 'f'} onBlur={(e) => setQ({ file_path: e.target.value })} />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="Totales">
            <div className="space-y-1.5 text-sm">
              <Row label="Mensual (lista)" value={money(t.monthlyList)} muted />
              <Row label="Mensual" value={money(t.monthly)} strong />
              <Row label="IVA mensual" value={money(t.monthly * settings.iva_rate)} muted />
              <div className="my-2 border-t border-stone-100" />
              <Row label="Pago único (lista)" value={money(t.onceList)} muted />
              <Row label="Pago único" value={money(t.once)} strong />
              <Row label="IVA pago único" value={money(t.once * settings.iva_rate)} muted />
            </div>
          </Card>
          <Card title="Versiones" bodyClass="">
            <ul className="divide-y divide-stone-100">
              {versions.map((v) => (
                <li key={v.id}>
                  <Link to={`/cotizaciones/${v.id}`} className={`flex items-center gap-2 px-4 py-2 text-sm hover:bg-stone-50 ${v.id === quote.id ? 'bg-brand-50' : ''}`}>
                    <span className="font-medium">v{v.version}</span>
                    <span className="text-stone-500">{fdate(v.issue_date)}</span>
                    <span className="ml-auto"><StatusBadge map={QUOTE_STATUS} value={quoteEffectiveStatus(v)} /></span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Documentos" bodyClass="" actions={<button className="btn-secondary btn-sm" onClick={() => quick.open('document', { quote_id: quote.id, client_id: quote.client_id, kind: 'cotizacion', name: `Cotización ${quote.folio}${quote.version > 1 ? ` v${quote.version}` : ''}` })}><Plus size={13} /> Liga</button>}>
            {docs.length ? (
              <ul className="divide-y divide-stone-100">
                {docs.map((d) => {
                  const drive = parseDrive(d.location)
                  return (
                    <li key={d.id} className="flex items-center gap-2 px-4 py-2 text-sm">
                      <button className="min-w-0 flex-1 truncate text-left hover:text-brand-700" onClick={() => quick.edit('document', d)} title="Editar">{d.name}</button>
                      {drive ? (
                        <a href={drive.url} target="_blank" rel="noopener noreferrer" className="link inline-flex shrink-0 items-center gap-1 text-xs" title={drive.label}><DriveIcon kind={drive.kind} size={12} /> Abrir <ExternalLink size={11} /></a>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="px-4 py-3 text-xs text-stone-500">Liga aquí el PDF o la versión firmada que tengas en Drive.</p>
            )}
          </Card>
          <DriveFolderButton url={client?.drive_url} className="btn-secondary w-full justify-center" label="Carpeta del cliente en Drive" />
          {client && (
            <Card title="Cliente">
              <ClientLink id={client.id} />
              <div className="mt-1 text-xs text-stone-500">{client.legal_name ?? 'Sin razón social'} · RFC {client.tax_id ?? 'pendiente'}</div>
            </Card>
          )}
        </div>
      </div>

      {/* Vista de impresión */}
      {createPortal(<div className="print-area hidden">
        <div className="flex items-center gap-3 border-b-2 border-brand-400 pb-4">
          <img src={logo} alt="" className="h-12 w-12" />
          <div>
            <div className="font-serif text-3xl font-semibold text-brand-800">socaire</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-brand-400">Soluciones digitales a la medida</div>
          </div>
          <div className="ml-auto text-right text-sm">
            <div className="text-xl font-semibold text-brand-800">Cotización</div>
            <div>Folio {quote.folio}{quote.version > 1 ? ` · v${quote.version}` : ''}</div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-sm">
          <div><span className="text-stone-500">Preparada para:</span> <b>{client?.legal_name || client?.company_name}</b></div>
          <div className="text-right"><span className="text-stone-500">Fecha:</span> {fdate(quote.issue_date, { year: true })} · <span className="text-stone-500">Vigencia:</span> {fdate(quote.valid_until, { year: true })}</div>
        </div>
        {quote.title && <p className="mt-3 text-base font-medium text-brand-800">{quote.title}</p>}
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="border-b border-brand-200 text-left text-xs uppercase text-brand-600">
              <th className="py-2">Concepto</th><th>Cobro</th><th className="text-right">Cant.</th><th className="text-right">Precio</th><th className="text-right">Descuento</th><th className="text-right">Importe</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) => (
              <tr key={it.id} className="border-b border-stone-100">
                <td className="py-2">{it.description}</td><td>{it.kind === 'mensual' ? 'Mensual' : 'Único'}</td><td className="text-right">{it.quantity}</td><td className="text-right">{money(it.unit_price, true)}</td><td className="text-right">{it.discount ? `−${money(it.discount, true)}` : ''}</td><td className="text-right">{money(it.quantity * it.unit_price - it.discount, true)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="ml-auto mt-4 w-72 space-y-1 text-sm">
          {t.monthly > 0 && <div className="flex justify-between rounded bg-brand-100 px-3 py-1.5 font-semibold text-brand-800"><span>Total mensual</span><span>{money(t.monthly, true)} MXN</span></div>}
          <div className="flex justify-between rounded bg-brand-50 px-3 py-1.5 font-semibold text-brand-800"><span>Pago inicial</span><span>{money(t.once, true)} MXN</span></div>
          <div className="px-3 text-xs text-stone-500">IVA aparte.</div>
        </div>
        {quote.conditions && (
          <div className="mt-6 text-xs leading-relaxed text-stone-700">
            <div className="mb-1 font-semibold uppercase tracking-wide text-brand-600">Condiciones</div>
            {quote.conditions.split('\n').map((l, i) => <p key={i}>{l}</p>)}
          </div>
        )}
        <div className="mt-10 border-t border-stone-200 pt-2 text-center text-xs text-stone-500">socaire · Soluciones digitales a la medida · alsocaire.com</div>
      </div>, document.body)}

      <Confirm open={confirmDel} onClose={() => setConfirmDel(false)} danger title="Eliminar borrador" text={`¿Eliminar la cotización ${quote.folio} v${quote.version}?`} confirmLabel="Eliminar" onConfirm={async () => { await remove('quotes', quote.id, 'Cotización'); navigate('/cotizaciones') }} />
    </>
  )
}

function Row({ label, value, strong, muted }: { label: string; value: string; strong?: boolean; muted?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className={muted ? 'text-stone-400' : 'text-stone-600'}>{label}</span>
      <span className={`tnum ${strong ? 'font-semibold text-brand-800' : muted ? 'text-stone-400' : ''}`}>{value}</span>
    </div>
  )
}
