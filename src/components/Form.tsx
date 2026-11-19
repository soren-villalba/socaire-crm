import { useEffect, useState, type FormEvent, type ReactNode } from 'react'

export interface Option {
  value: string
  label: string
}
export interface FieldDef {
  name: string
  label: string
  type?: 'text' | 'number' | 'money' | 'date' | 'time' | 'select' | 'textarea' | 'checkbox' | 'email' | 'tel' | 'multiselect'
  options?: Option[]
  required?: boolean
  placeholder?: string
  span?: 1 | 2
  hint?: string
  show?: (v: Record<string, unknown>) => boolean
  min?: number
  step?: number
  autoFocus?: boolean
  emptyLabel?: string
  /** Devuelve un mensaje de error si el valor no es válido. */
  validate?: (val: unknown, all: Record<string, unknown>) => string | undefined
}

type Values = Record<string, unknown>

export function RecordForm({ fields, initial, onSubmit, onCancel, submitLabel = 'Guardar', extra, onChange }: { fields: FieldDef[]; initial: Values; onSubmit: (v: Values) => void | Promise<void>; onCancel?: () => void; submitLabel?: string; extra?: ReactNode; onChange?: (v: Values) => Values | void }) {
  const [v, setV] = useState<Values>(initial)
  const [busy, setBusy] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  useEffect(() => setV(initial), [initial])

  const set = (name: string, val: unknown) => {
    setV((prev) => {
      let next = { ...prev, [name]: val }
      const adj = onChange?.(next)
      if (adj) next = adj
      return next
    })
    if (errors[name]) setErrors((e) => ({ ...e, [name]: '' }))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    for (const f of fields) {
      if (f.show && !f.show(v)) continue
      const val = v[f.name]
      if (f.required && (val == null || val === '' || (Array.isArray(val) && !val.length))) errs[f.name] = 'Obligatorio'
      else if (f.validate) {
        const msg = f.validate(val, v)
        if (msg) errs[f.name] = msg
      }
    }
    setErrors(errs)
    if (Object.keys(errs).length) return
    const clean: Values = {}
    for (const f of fields) {
      if (f.show && !f.show(v)) continue
      let val = v[f.name]
      if (typeof val === 'string' && f.type !== 'textarea') val = val.trim()
      if ((f.type === 'number' || f.type === 'money') && val !== '' && val != null) val = Number(val)
      if (val === '') val = f.type === 'number' || f.type === 'money' ? null : null
      clean[f.name] = val
    }
    setBusy(true)
    try {
      await onSubmit(clean)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        {fields.map((f) => {
          if (f.show && !f.show(v)) return null
          const id = `f-${f.name}`
          const val = v[f.name]
          const err = errors[f.name]
          const span = f.span === 1 ? 'col-span-1' : 'col-span-2'
          if (f.type === 'checkbox')
            return (
              <label key={f.name} className={`${span} flex items-center gap-2 text-sm text-stone-700`}>
                <input type="checkbox" className="h-4 w-4 rounded border-stone-300 accent-brand-600" checked={!!val} onChange={(e) => set(f.name, e.target.checked)} />
                {f.label}
                {f.hint && <span className="text-xs text-stone-500">· {f.hint}</span>}
              </label>
            )
          return (
            <div key={f.name} className={span}>
              <label htmlFor={id} className="label">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </label>
              {f.type === 'select' ? (
                <select id={id} className="input" value={(val as string) ?? ''} onChange={(e) => set(f.name, e.target.value || null)} autoFocus={f.autoFocus}>
                  {!f.required && <option value="">{f.emptyLabel ?? '—'}</option>}
                  {f.required && !val && <option value="">Selecciona…</option>}
                  {f.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : f.type === 'multiselect' ? (
                <div className="flex flex-wrap gap-1.5">
                  {f.options?.map((o) => {
                    const arr = (val as string[]) ?? []
                    const on = arr.includes(o.value)
                    return (
                      <button type="button" key={o.value} onClick={() => set(f.name, on ? arr.filter((x) => x !== o.value) : [...arr, o.value])} className={`rounded-md border px-2 py-1 text-xs ${on ? 'border-brand-400 bg-brand-100 text-brand-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}>
                        {o.label}
                      </button>
                    )
                  })}
                </div>
              ) : f.type === 'textarea' ? (
                <textarea id={id} rows={3} className="input" placeholder={f.placeholder} value={(val as string) ?? ''} onChange={(e) => set(f.name, e.target.value)} autoFocus={f.autoFocus} />
              ) : (
                <div className="relative">
                  {f.type === 'money' && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-500">$</span>}
                  <input
                    id={id}
                    className={`input ${f.type === 'money' ? 'pl-6 tnum' : ''} ${err ? 'border-red-400' : ''}`}
                    type={f.type === 'money' ? 'number' : f.type ?? 'text'}
                    step={f.step ?? (f.type === 'money' ? 0.01 : f.type === 'number' ? 'any' : undefined)}
                    min={f.min}
                    placeholder={f.placeholder}
                    value={(val as string | number | undefined) ?? ''}
                    onChange={(e) => set(f.name, e.target.value)}
                    autoFocus={f.autoFocus}
                  />
                </div>
              )}
              {err ? <p className="mt-1 text-xs text-red-600">{err}</p> : f.hint ? <p className="mt-1 text-xs text-stone-500">{f.hint}</p> : null}
            </div>
          )
        })}
      </div>
      {extra}
      <div className="flex justify-end gap-2 pt-2">
        {onCancel && (
          <button type="button" className="btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? 'Guardando…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
