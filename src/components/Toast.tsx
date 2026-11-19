import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'

interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
}
interface ToastItem {
  id: number
  kind: 'success' | 'error'
  text: string
  action?: ToastAction
}
interface ToastApi {
  success: (text: string, action?: ToastAction) => void
  error: (text: string) => void
}

const Ctx = createContext<ToastApi | null>(null)
export const useToast = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useToast fuera de ToastProvider')
  return c
}

let seq = 1
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), [])
  const push = useCallback(
    (t: Omit<ToastItem, 'id'>) => {
      const id = seq++
      setItems((l) => [...l.slice(-3), { ...t, id }])
      setTimeout(() => dismiss(id), t.action ? 6000 : t.kind === 'error' ? 6000 : 2200)
    },
    [dismiss],
  )
  const api = useMemo<ToastApi>(
    () => ({
      success: (text, action) => push({ kind: 'success', text, action }),
      error: (text) => push({ kind: 'error', text }),
    }),
    [push],
  )
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} role="status" className="pointer-events-auto flex min-w-[260px] max-w-sm items-center gap-2 rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-pop">
            {t.kind === 'success' ? <CheckCircle2 size={16} className="shrink-0 text-emerald-600" /> : <AlertCircle size={16} className="shrink-0 text-red-600" />}
            <span className="flex-1 text-stone-700">{t.text}</span>
            {t.action && (
              <button
                className="font-medium text-brand-600 hover:underline"
                onClick={() => {
                  void t.action!.onClick()
                  dismiss(t.id)
                }}
              >
                {t.action.label}
              </button>
            )}
            <button aria-label="Cerrar" className="text-stone-400 hover:text-stone-600" onClick={() => dismiss(t.id)}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
