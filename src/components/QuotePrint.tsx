// Vista de impresión de cotizaciones. Replica el formato de las cotizaciones reales
// (04_Ventas/Cotizaciones/Cotizacion_SOC-2026-00X.pdf): encabezado con isotipo, datos
// en rejilla, tablas por tipo de cobro con renglón de descuento, banda de totales,
// programa de referidos (solo Socaire Pedidos) y condiciones.
import { createPortal } from 'react-dom'
import logo from '../logo.svg'
import { addDays, diffDays, parseISO } from '../lib/format'
import type { Client, Product, Quote, QuoteItem } from '../lib/types'

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const fmt2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt0 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 })
const m2 = (n: number) => (n < 0 ? '−' : '') + fmt2.format(Math.abs(n)).replace('MX', '')
const m0 = (n: number) => (n < 0 ? '−' : '') + fmt0.format(Math.abs(n)).replace('MX', '')

// Programa de referidos vigente (seed/notas: −100, −50, −50 por sucursal, piso $800)
const REFERRAL_STEPS = [100, 50, 50]

function fechaLarga(s: string, withYear = true) {
  const d = parseISO(s)
  return `${d.getDate()} de ${MESES[d.getMonth()]}${withYear ? ` de ${d.getFullYear()}` : ''}`
}

/** Marcadores sin llenar en un texto, p. ej. "[fecha]" o "[6]". */
export function pendingPlaceholders(text?: string | null): string[] {
  return [...new Set(text?.match(/\[[^\]\n]{1,40}\]/g) ?? [])]
}

/** Nombre de archivo de las cotizaciones reales: Cotizacion_SOC-2026-003(_v2) */
export function quoteFileName(q: Quote) {
  return `Cotizacion_${q.folio}${q.version > 1 ? `_v${q.version}` : ''}`
}

export function QuotePrint({ quote, items, client, products }: { quote: Quote; items: QuoteItem[]; client?: Client; products: Product[] }) {
  const monthly = items.filter((i) => i.kind === 'mensual')
  const once = items.filter((i) => i.kind === 'unico')
  const prod = (it: QuoteItem) => products.find((p) => p.id === it.product_id)
  const perBranch = (list: QuoteItem[]) => list.length > 0 && list.every((i) => /sucursal/i.test(prod(i)?.unit ?? ''))
  const isPedidos = monthly.length > 0 && perBranch(monthly)
  const qtyLabel = (list: QuoteItem[]) => (perBranch(list) ? 'Sucursales' : 'Cantidad')

  const tMonthly = monthly.reduce((s, i) => s + i.quantity * i.unit_price - (i.discount || 0), 0)
  const tOnce = once.reduce((s, i) => s + i.quantity * i.unit_price - (i.discount || 0), 0)

  // Vigencia: "30 días (hasta el 9 de diciembre)"
  const validDays = quote.valid_until ? diffDays(quote.valid_until, quote.issue_date) : null
  const sameYear = quote.valid_until ? parseISO(quote.valid_until).getFullYear() === parseISO(quote.issue_date).getFullYear() : true
  const vigencia = quote.valid_until ? `${validDays} días (hasta el ${fechaLarga(quote.valid_until, !sameYear)})` : `30 días (hasta el ${fechaLarga(addDays(quote.issue_date, 30), false)})`

  // Tarifa de partida para referidos = precio neto por sucursal del primer concepto mensual
  const base = monthly[0] ? monthly[0].unit_price - (monthly[0].discount || 0) / Math.max(1, monthly[0].quantity) : 0
  const floor = base - REFERRAL_STEPS.reduce((a, b) => a + b, 0)
  let acc = base
  const tiers = REFERRAL_STEPS.map((d, i) => ({ label: `${i + 1}° referido`, d, rate: (acc -= d) }))

  const conditions = (quote.conditions ?? '').split('\n').map((l) => l.trim().replace(/^[-•·]\s*/, '')).filter(Boolean)
  const subtitle = quote.title?.trim()

  return createPortal(
    <div className="print-area qp" aria-hidden>
      <header className="qp-head">
        <img src={logo} alt="" className="qp-logo" />
        <div>
          <div className="qp-brand">Socaire</div>
          <div className="qp-tag">Soluciones digitales a la medida</div>
        </div>
      </header>

      <h1 className="qp-title">Cotización</h1>
      {subtitle && <p className="qp-sub">{subtitle}</p>}
      <div className="qp-meta">
        <span className="qp-k">Folio</span>
        <span>{quote.folio}{quote.version > 1 ? ` · versión ${quote.version}` : ''}</span>
        <span className="qp-k">Fecha</span>
        <span>{fechaLarga(quote.issue_date)}</span>
        <span className="qp-k">Preparada para</span>
        <span className="qp-client">{client?.company_name || client?.legal_name || '—'}</span>
        <span className="qp-k">Vigencia</span>
        <span>{vigencia}</span>
      </div>

      <h2 className="qp-h2">Propuesta</h2>

      {monthly.length > 0 && (
        <table className="qp-table">
          <thead>
            <tr>
              <th>Suscripción mensual</th>
              <th className="c">{qtyLabel(monthly)}</th>
              <th className="r">Precio por {perBranch(monthly) ? 'sucursal' : 'unidad'}</th>
              <th className="r">Mensual</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((it) => (
              <ItemRows key={it.id} it={it} showUnit discountLabel={isPedidos ? 'Precio introductorio (descuento)' : 'Descuento'} />
            ))}
          </tbody>
        </table>
      )}

      {once.length > 0 && (
        <table className="qp-table">
          <thead>
            <tr>
              <th>{isPedidos ? 'Alta (pago único)' : 'Pago único'}</th>
              <th className="c">{qtyLabel(once)}</th>
              <th className="r">{perBranch(once) ? '' : 'Precio unitario'}</th>
              <th className="r">Total</th>
            </tr>
          </thead>
          <tbody>
            {once.map((it) => (
              <ItemRows key={it.id} it={it} showUnit={!perBranch(once)} discountLabel={isPedidos ? 'Bonificación del alta (descuento)' : 'Descuento'} />
            ))}
          </tbody>
        </table>
      )}

      <div className="qp-totals">
        {monthly.length > 0 && (
          <div><span className="qp-k">Total mensual</span><span className="qp-amt">{m2(tMonthly)} MXN</span></div>
        )}
        {(once.length > 0 || monthly.length === 0) && (
          <div><span className="qp-k">{isPedidos ? 'Pago inicial por alta' : 'Total'}</span><span className="qp-amt">{m2(tOnce)} MXN</span></div>
        )}
      </div>

      {isPedidos && base > 0 && (
        <section className="qp-keep">
          <h2 className="qp-h2">Programa de referidos</h2>
          <p className="qp-p">
            Si recomiendas Socaire Pedidos a otros negocios y firman contrato, tu mensualidad baja. Los descuentos se aplican sobre tu precio introductorio: mientras más referidos, menor tarifa por sucursal, hasta un mínimo de {m0(floor)}.
          </p>
          <table className="qp-table qp-ref">
            <thead>
              <tr><th>Referido</th><th className="r">Descuento por sucursal</th><th className="r">Tarifa por sucursal</th></tr>
            </thead>
            <tbody>
              <tr><td>Punto de partida</td><td className="r">—</td><td className="r">{m0(base)}</td></tr>
              {tiers.map((t, i) => (
                <tr key={t.label} className={i === tiers.length - 1 ? 'b' : ''}><td>{t.label}</td><td className="r">{m0(-t.d)}</td><td className="r">{m0(t.rate)}</td></tr>
              ))}
            </tbody>
          </table>
          <div className="qp-k qp-mt">Cómo funciona</div>
          <ul className="qp-list">
            <li>Un referido cuenta cuando firma contrato por un mínimo de 3 meses y paga su primer mes; el descuento empieza ese mismo mes.</li>
            <li>Cada descuento se mantiene mientras ese referido siga activo. Si cancela, la tarifa de ese escalón vuelve a subir.</li>
            <li>La tarifa mínima es de {m0(floor)} por sucursal. Cada referido paga su alta con 50% de descuento.</li>
            <li>Los referidos cuentan si firman dentro de los primeros 6 meses del servicio.</li>
          </ul>
        </section>
      )}

      {/* Condiciones: nota en cursiva al pie, como en las cotizaciones reales */}
      <div className="qp-note">
        {conditions.map((l, i) => <p key={i}>{l}</p>)}
        {!conditions.some((l) => /IVA/.test(l)) && <p>Precios en pesos mexicanos (MXN), IVA aparte.</p>}
      </div>

      <footer className="qp-foot">Socaire&nbsp;&nbsp;·&nbsp;&nbsp;Soluciones digitales a la medida&nbsp;&nbsp;·&nbsp;&nbsp;alsocaire.com</footer>
    </div>,
    document.body,
  )
}

function ItemRows({ it, showUnit, discountLabel }: { it: QuoteItem; showUnit: boolean; discountLabel: string }) {
  const gross = it.quantity * it.unit_price
  const disc = it.discount || 0
  return (
    <>
      <tr>
        <td>{it.description}</td>
        <td className="c">{it.quantity}</td>
        <td className="r">{showUnit ? m2(it.unit_price) : ''}</td>
        <td className="r">{m2(gross)}</td>
      </tr>
      {disc > 0 && (
        <tr className="qp-disc">
          <td>{discountLabel}</td>
          <td />
          <td className="r">{showUnit ? m2(-disc / Math.max(1, it.quantity)) : ''}</td>
          <td className="r">{m2(-disc)}</td>
        </tr>
      )}
    </>
  )
}
