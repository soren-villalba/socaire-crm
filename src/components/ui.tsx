import { useEffect, useRef, useState, type ReactNode } from 'react'
import { X, Inbox } from 'lucide-react'
import type { Tone } from '../lib/constants'
import { initials } from '../lib/format'

const TONES: Record<Tone, string> = {
  neutral: 'bg-stone-100 text-stone-600 ring-stone-200',
  brand: 'bg-brand-100 text-brand-700 ring-brand-200',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export function Badge({ tone = 'neutral', children, className = '' }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`}>{children}</span>
}

export function StatusBadge({ map, value }: { map: Record<string, { label: string; tone: Tone }>; value?: string | null }) {
  if (!value) return null
  const m = map[value] ?? { label: value, tone: 'neutral' as Tone }
  return <Badge tone={m.tone}>{m.label}</Badge>
}

export function Avatar({ name, size = 24 }: { name?: string | null; size?: number }) {
  return (
    <span title={name ?? ''} style={{ width: size, height: size, fontSize: size * 0.42 }} className="inline-flex shrink-0 items-center justify-center rounded-full bg-brand-200 font-semibold text-brand-800">
      {initials(name)}
    </span>
  )
}

export function Card({ title, actions, children, className = '', bodyClass = 'p-4' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-2 border-b border-stone-100 px-4 py-2.5">
          <h2 className="h2">{title}</h2>
          <div className="flex items-center gap-1">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  )
}

export function Stat({ label, value, sub, tone, onClick }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'red' | 'amber' | 'green'; onClick?: () => void }) {
  const color = tone === 'red' ? 'text-red-600' : tone === 'amber' ? 'text-amber-600' : tone === 'green' ? 'text-emerald-700' : 'text-brand-800'
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp onClick={onClick} className={`card flex flex-col items-start px-4 py-3 text-left ${onClick ? 'transition hover:border-brand-200 hover:bg-brand-50/40' : ''}`}>
      <span className="text-xs font-medium text-stone-500">{label}</span>
      <span className={`tnum mt-1 text-xl font-semibold ${color}`}>{value}</span>
      {sub && <span className="mt-0.5 text-xs text-stone-500">{sub}</span>}
    </Comp>
  )
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <Inbox size={28} className="text-stone-300" />
      <p className="font-medium text-stone-700">{title}</p>
      {children && <p className="max-w-sm text-sm text-stone-500">{children}</p>}
      {action}
    </div>
  )
}

export function Drawer({ open, onClose, title, subtitle, children, width = 520, footer }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; children: ReactNode; width?: number; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-stone-900/20" onClick={onClose} />
      <aside role="dialog" aria-modal="true" style={{ width }} className="relative flex h-full max-w-full flex-col bg-white shadow-pop">
        <header className="flex items-start justify-between gap-3 border-b border-stone-100 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="truncate text-base font-semibold text-brand-800">{title}</h2>
            {subtitle && <div className="mt-0.5 text-xs text-stone-500">{subtitle}</div>}
          </div>
          <button aria-label="Cerrar" onClick={onClose} className="btn-ghost -mr-2 px-1.5">
            <X size={18} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <footer className="border-t border-stone-100 px-5 py-3">{footer}</footer>}
      </aside>
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 440 }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: number }) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-stone-900/25" onClick={onClose} />
      <div role="dialog" aria-modal="true" style={{ width }} className="relative max-w-[95vw] rounded-xl bg-white shadow-pop">
        <header className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <h2 className="font-semibold text-brand-800">{title}</h2>
          <button aria-label="Cerrar" onClick={onClose} className="btn-ghost -mr-2 px-1.5">
            <X size={16} />
          </button>
        </header>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

export function Confirm({ open, title, text, confirmLabel = 'Confirmar', danger, onConfirm, onClose }: { open: boolean; title: string; text: ReactNode; confirmLabel?: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className="text-sm text-stone-600">{text}</div>
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>
          Cancelar
        </button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  )
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { key: T; label: string; count?: number }[]; value: T; onChange: (k: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-stone-200">
      {tabs.map((t) => (
        <button
          key={t.key}
          role="tab"
          aria-selected={value === t.key}
          onClick={() => onChange(t.key)}
          className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition ${value === t.key ? 'border-brand-600 text-brand-800' : 'border-transparent text-stone-500 hover:text-stone-800'}`}
        >
          {t.label}
          {t.count != null && t.count > 0 && <span className="ml-1.5 rounded bg-stone-100 px-1.5 text-xs text-stone-500">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Segmented<T extends string>({ options, value, onChange }: { options: { value: T; label: ReactNode }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-stone-50 p-0.5">
      {options.map((o) => (
        <button key={o.value} onClick={() => onChange(o.value)} className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${value === o.value ? 'bg-white text-brand-800 shadow-card' : 'text-stone-500 hover:text-stone-800'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Menu({ trigger, children }: { trigger: ReactNode; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open])
  return (
    <div ref={ref} className="relative inline-block">
      <div onClick={() => setOpen((o) => !o)}>{trigger}</div>
      {open && <div className="absolute right-0 z-40 mt-1 min-w-[180px] rounded-lg border border-stone-200 bg-white py-1 shadow-pop">{children(() => setOpen(false))}</div>}
    </div>
  )
}
export function MenuItem({ onClick, children, danger }: { onClick: () => void; children: ReactNode; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-stone-50 ${danger ? 'text-red-600' : 'text-stone-700'}`}>
      {children}
    </button>
  )
}

export function Progress({ pct, tone = 'brand' }: { pct: number; tone?: 'brand' | 'red' | 'green' }) {
  const c = tone === 'red' ? 'bg-red-500' : tone === 'green' ? 'bg-emerald-500' : 'bg-brand-400'
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
      <div className={`h-full rounded-full ${c}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  )
}

export function PageHeader({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="h1">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-stone-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      </div>
      {children}
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…' }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input className="input w-64" type="search" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
}

export function KV({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_1fr] gap-2 py-1 text-sm">
      <dt className="text-stone-500">{label}</dt>
      <dd className="min-w-0 break-words text-stone-800">{children ?? '—'}</dd>
    </div>
  )
}

/**
 * Fila de tabla que abre su registro: toda la fila es clicable (y con Enter desde el teclado),
 * pero los clics en ligas, botones, menús o campos dentro de la fila hacen solo lo suyo.
 */
export function clickRow(open: () => void) {
  return {
    className: 'row-click',
    tabIndex: 0,
    onClick: (e: React.MouseEvent<HTMLElement>) => {
      if ((e.target as HTMLElement).closest('a,button,input,select,textarea,label,[role="menu"],[role="dialog"]')) return
      open()
    },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Enter' && e.target === e.currentTarget) open()
    },
  }
}

/** Bloque gris animado que ocupa el lugar del contenido mientras carga. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded-md bg-stone-100 ${className}`} />
}

/** Esqueleto de toda la aplicación: menú, barra superior, indicadores y una tabla. */
export function AppSkeleton() {
  return (
    <div className="flex h-screen overflow-hidden bg-white" role="status" aria-label="Cargando el CRM">
      <aside className="flex w-[220px] shrink-0 flex-col gap-5 border-r border-stone-200 bg-stone-50/60 px-3 py-4">
        <div className="flex items-center gap-2"><Skeleton className="h-7 w-7" /><Skeleton className="h-5 w-24" /></div>
        {[4, 3, 2].map((n, g) => (
          <div key={g} className="space-y-2">
            <Skeleton className="h-2.5 w-16" />
            {Array.from({ length: n }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b border-stone-200 px-5"><Skeleton className="h-9 w-[420px]" /><Skeleton className="ml-auto h-9 w-24" /></div>
        <div className="mx-auto w-full max-w-[1400px] space-y-5 px-6 py-6">
          <div className="space-y-2"><Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-72" /></div>
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-6">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <div className="grid gap-5 xl:grid-cols-3">
            <div className="card space-y-3 p-4 xl:col-span-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
            <div className="card space-y-3 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
          </div>
        </div>
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  )
}
