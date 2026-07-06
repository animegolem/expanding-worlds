/**
 * Toasts and the ongoing-state perch store (RFC §8.6, AI-IMP-066).
 * Two vocabularies: `toast()` for transitions — a transient,
 * auto-dissolving bottom-edge stack — and `condition(id).raise() /
 * .clear()` for ongoing states, which keep the ⚠ perch alive for
 * exactly as long as any condition holds. §11.4 surfaces here: a
 * transient toast alone never satisfies an ongoing condition, so the
 * service-outage wiring below raises a condition for the outage and
 * only toasts the transitions into and out of it.
 *
 * Framework-agnostic listener store in the engagement.ts mold so the
 * logic unit-tests without a DOM; Svelte chrome subscribes via the
 * onXChanged hooks.
 */
import { wake } from './engagement'
import { TOAST_DURATION_MS } from './feel'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  testid: string
  run: () => void
}

export interface ToastOptions {
  kind?: ToastKind
  /** Sticky toasts stay until dismissed (import errors keep their
   * pre-toast stay-until-dismissed behavior). */
  sticky?: boolean
  actions?: ToastAction[]
  /** Named surface: becomes the toast element's data-testid and acts
   * as a single-slot replace key, matching the pre-toast surfaces
   * (board-notice, import-error) that showed one notice at a time. */
  surface?: string
  /** data-testid for the dismiss button (legacy surface contracts). */
  dismissTestid?: string
}

export interface ToastEntry {
  id: number
  message: string
  kind: ToastKind
  sticky: boolean
  actions: readonly ToastAction[]
  surface?: string
  dismissTestid?: string
}

export interface Condition {
  id: string
  detail: string
}

type ToastsListener = (toasts: readonly ToastEntry[]) => void
type ConditionsListener = (conditions: readonly Condition[]) => void

let nextToastId = 1
let toasts: readonly ToastEntry[] = []
const toastListeners = new Set<ToastsListener>()
const toastTimers = new Map<number, ReturnType<typeof setTimeout>>()

let conditions: readonly Condition[] = []
const conditionListeners = new Set<ConditionsListener>()

function emitToasts(): void {
  for (const listener of toastListeners) listener(toasts)
}

function emitConditions(): void {
  for (const listener of conditionListeners) listener(conditions)
}

/** Show a transient toast; returns its id for manual dismissal. */
export function toast(message: string, options: ToastOptions = {}): number {
  const entry: ToastEntry = {
    id: nextToastId++,
    message,
    kind: options.kind ?? 'info',
    sticky: options.sticky ?? false,
    actions: options.actions ?? [],
    ...(options.surface !== undefined ? { surface: options.surface } : {}),
    ...(options.dismissTestid !== undefined ? { dismissTestid: options.dismissTestid } : {}),
  }
  const replaced =
    entry.surface === undefined ? [] : toasts.filter((t) => t.surface === entry.surface)
  for (const old of replaced) {
    const timer = toastTimers.get(old.id)
    if (timer) clearTimeout(timer)
    toastTimers.delete(old.id)
  }
  toasts = [...toasts.filter((t) => !replaced.includes(t)), entry]
  if (!entry.sticky) {
    toastTimers.set(
      entry.id,
      setTimeout(() => dismissToast(entry.id), TOAST_DURATION_MS),
    )
  }
  emitToasts()
  return entry.id
}

export function dismissToast(id: number): void {
  const timer = toastTimers.get(id)
  if (timer) clearTimeout(timer)
  toastTimers.delete(id)
  if (!toasts.some((t) => t.id === id)) return
  toasts = toasts.filter((t) => t.id !== id)
  emitToasts()
}

/**
 * Handle to one ongoing condition (§8.6). `raise` creates or updates
 * the condition's detail; `clear` removes it. The perch exists while
 * at least one condition is raised and not a moment longer.
 */
export function condition(id: string): { raise: (detail: string) => void; clear: () => void } {
  return {
    raise(detail: string): void {
      const existing = conditions.find((c) => c.id === id)
      if (existing?.detail === detail) return
      conditions = existing
        ? conditions.map((c) => (c.id === id ? { id, detail } : c))
        : [...conditions, { id, detail }]
      emitConditions()
      // §11.4: an ongoing condition arriving while the board is
      // wallpaper wakes the chrome — the perch must not fade in
      // silence (lead decision at the AI-IMP-066 merge).
      wake()
    },
    clear(): void {
      if (!conditions.some((c) => c.id === id)) return
      conditions = conditions.filter((c) => c.id !== id)
      emitConditions()
    },
  }
}

/** Subscribe to the toast stack; fires immediately, returns unsub. */
export function onToastsChanged(listener: ToastsListener): () => void {
  toastListeners.add(listener)
  listener(toasts)
  return () => toastListeners.delete(listener)
}

/** Subscribe to the condition list; fires immediately, returns unsub. */
export function onConditionsChanged(listener: ConditionsListener): () => void {
  conditionListeners.add(listener)
  listener(conditions)
  return () => conditionListeners.delete(listener)
}

let serviceAttached = false

/** §11.4 startup-recovery outcome the service 'ok' event carries.
 * Only `repairs` is consumed here; integrity ERRORS are an ongoing
 * condition and keep their perch path — never a transient toast. */
export interface RecoverySummary {
  repairs: string[]
}

/**
 * §11.4: successful startup repairs (rebuilt derivatives, reconciled
 * imports) surface as ONE transient success toast naming the count.
 * A clean open (empty repairs) says nothing. Integrity ERRORS are
 * routed to the ⚠ perch elsewhere, never here.
 */
export function reportRecoveryRepairs(summary: RecoverySummary | undefined): void {
  const count = summary?.repairs.length ?? 0
  if (count === 0) return
  toast(`Recovered on open: ${count} repairs`, {
    kind: 'success',
    surface: 'recovery-repairs',
  })
}

/**
 * Wire the utility-process lifecycle (AI-IMP-053 ServiceStatusEvent)
 * into the §8.6 grammar: outage → ongoing condition (the perch holds
 * for the whole outage, §11.4) plus an enter toast; recovery → clear
 * plus a resolution toast. A healthy open additionally toasts any
 * §11.4 startup repairs it carries. Replaces the interim StatusStrip.
 */
export function attachServiceStatus(): void {
  if (serviceAttached) return
  serviceAttached = true
  const service = condition('project-service')
  let outage = false
  const apply = (event: {
    status: 'restarting' | 'ok' | 'failed'
    message?: string
    recovery?: RecoverySummary
  }): void => {
    if (event.status === 'restarting') {
      outage = true
      service.raise('Project service crashed — restarting…')
      toast('Project service crashed — restarting…', { kind: 'error', surface: 'service-outage' })
    } else if (event.status === 'failed') {
      outage = true
      const detail = `Project service failed: ${event.message ?? 'unknown'} — restart the app`
      service.raise(detail)
      toast(detail, { kind: 'error', surface: 'service-outage' })
    } else {
      // status === 'ok': the open succeeded. Surface any repairs the
      // recovery pass performed (§11.4), then resolve a prior outage.
      reportRecoveryRepairs(event.recovery)
      if (outage) {
        outage = false
        service.clear()
        toast('Project service recovered', { kind: 'success', surface: 'service-recovered' })
      }
    }
  }
  window.ew.project.onServiceStatus(apply)
  // Cold-boot events fire before App mounts (main gates init on
  // nothing, the renderer gates mount on initSettings) — catch up on
  // the retained event so a boot refusal or repair summary is never
  // lost to the race (AI-IMP-106). Same-surface toasts replace, so a
  // live event arriving alongside the catch-up stays one toast.
  const pull = window.ew.project.serviceStatus
  if (pull) {
    void pull().then((event) => {
      if (event) apply(event)
    })
  }
  // Deterministic condition control for hidden-window e2e — the same
  // pattern as engagement's ew-test-set-engagement event.
  window.addEventListener('ew-test-condition', ((event: Event) => {
    const detail = (event as CustomEvent<{ id: string; detail?: string }>).detail
    if (detail.detail !== undefined) condition(detail.id).raise(detail.detail)
    else condition(detail.id).clear()
  }) as EventListener)
}

let noticesAttached = false
let restoreKeep: (nodeIds: string[]) => void = () => {}

/**
 * Route §9.2 board notices into toasts. `ew-board-notice` stays the
 * transport (canvas code and Workspace keep dispatching it, bubbling
 * to window); rendering moved here from CanvasHost. Legacy testids
 * (board-notice, board-notice-keep, board-notice-dismiss) are honored
 * so the §9.2 e2e contracts hold against the toast surface.
 */
export function attachBoardNotices(restore: (nodeIds: string[]) => void): void {
  restoreKeep = restore
  if (noticesAttached) return
  noticesAttached = true
  window.addEventListener('ew-board-notice', ((event: Event) => {
    const detail = (event as CustomEvent<{ message: string; keepNodeIds?: string[] }>).detail
    const keep = detail.keepNodeIds ?? []
    toast(detail.message, {
      surface: 'board-notice',
      dismissTestid: 'board-notice-dismiss',
      actions:
        keep.length > 0
          ? [{ label: 'Keep in Project', testid: 'board-notice-keep', run: () => restoreKeep(keep) }]
          : [],
    })
  }) as EventListener)
}

/** Test-only: wipe module state so unit tests stay independent. */
export function __resetStatusForTests(): void {
  for (const timer of toastTimers.values()) clearTimeout(timer)
  toastTimers.clear()
  toasts = []
  conditions = []
  toastListeners.clear()
  conditionListeners.clear()
}
