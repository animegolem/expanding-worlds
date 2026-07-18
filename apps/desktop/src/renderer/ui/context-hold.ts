/** Shared GR-5 touch hold: movement yields to drag; a fired hold swallows click. */
export class ContextHoldGesture {
  #timer: ReturnType<typeof setTimeout> | null = null
  #pointerId: number | null = null
  #origin = { x: 0, y: 0 }
  #fired = false
  #clickExpiry: ReturnType<typeof setTimeout> | null = null

  constructor(
    private readonly delayMs = 550,
    private readonly movementPx = 8,
  ) {}

  begin(event: PointerEvent, open: () => void): void {
    if (event.pointerType !== 'touch') return
    this.cancel()
    this.#pointerId = event.pointerId
    this.#origin = { x: event.clientX, y: event.clientY }
    this.#fired = false
    this.#timer = setTimeout(() => {
      this.#timer = null
      this.#fired = true
      open()
    }, this.delayMs)
  }

  move(event: PointerEvent): void {
    if (event.pointerId !== this.#pointerId || this.#timer === null) return
    if (
      Math.hypot(event.clientX - this.#origin.x, event.clientY - this.#origin.y) >
      this.movementPx
    ) {
      this.cancelPending()
    }
  }

  end(event: PointerEvent): void {
    if (event.pointerId !== this.#pointerId) return
    this.cancelPending()
    this.#pointerId = null
    if (this.#fired) {
      this.#clickExpiry = setTimeout(() => {
        this.#clickExpiry = null
        this.#fired = false
      }, 1_000)
    }
  }

  cancel(): void {
    this.cancelPending()
    if (this.#clickExpiry !== null) clearTimeout(this.#clickExpiry)
    this.#clickExpiry = null
    this.#pointerId = null
    this.#fired = false
  }

  blocksDrag(): boolean {
    return this.#timer !== null || (this.#fired && this.#pointerId !== null)
  }

  consumeClick(): boolean {
    if (!this.#fired) return false
    if (this.#clickExpiry !== null) clearTimeout(this.#clickExpiry)
    this.#clickExpiry = null
    this.#fired = false
    return true
  }

  private cancelPending(): void {
    if (this.#timer !== null) clearTimeout(this.#timer)
    this.#timer = null
  }
}
