import { matchesCombo, type Combo } from '../keys/registry'
import {
  dispatchReservationChange,
  onReservationChanged,
  reservationDensity,
  setReservationDensity,
  type ChromeDensity,
} from '../chrome/reservation'

const OVERLAY_COMBO: Combo = { mod: true, shift: true, alt: true, code: 'KeyR' }

interface ReservationDebug {
  show(value?: boolean): boolean
  density(value?: ChromeDensity): ChromeDensity
}

declare global {
  interface Window {
    __ewReservations?: ReservationDebug
  }
}

/** Session-only reservation inspector, following the release-present feel-dial seam. */
export function mountReservationDebug(): () => void {
  document.documentElement.dataset['density'] ||= 'compact'
  document.documentElement.dataset['dockExpanded'] ||= 'false'
  let showing = false
  const setShowing = (value: boolean): boolean => {
    showing = value
    dispatchReservationChange()
    return showing
  }
  const debug: ReservationDebug = {
    show(value) {
      return value === undefined ? showing : setShowing(value)
    },
    density(value) {
      if (value) setReservationDensity(value)
      return reservationDensity()
    },
  }
  const onKeydown = (event: KeyboardEvent): void => {
    if (!matchesCombo(event, OVERLAY_COMBO)) return
    event.preventDefault()
    setShowing(!showing)
  }
  window.__ewReservations = debug
  window.addEventListener('keydown', onKeydown)
  dispatchReservationChange()
  return () => {
    window.removeEventListener('keydown', onKeydown)
    if (window.__ewReservations === debug) delete window.__ewReservations
  }
}

export function reservationsVisible(): boolean {
  return window.__ewReservations?.show() ?? false
}

export { onReservationChanged }
