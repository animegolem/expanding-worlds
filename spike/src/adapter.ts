/**
 * Renderer-agnostic contract. AI-IMP-002 (PixiJS) and AI-IMP-003 (Konva)
 * implement RendererAdapter; the runner drives both with identical
 * scenario op streams so results are comparable.
 *
 * One op is applied per animation frame. Ops with continuous motion
 * (pan, moveSelection, ...) therefore appear repeatedly in scripts —
 * that repetition IS the gesture, and `commitGesture` marks where the
 * real application would commit one durable command (RFC-0001 §10.2).
 */

export interface SceneImage {
  id: string
  x: number
  y: number
  w: number
  h: number
  rotation: number
  textureId: string
  label?: string
}

export interface ScenePin {
  id: string
  x: number
  y: number
  r: number
  color: string
  label?: string
}

export type SceneDecoration =
  | { id: string; kind: 'text'; x: number; y: number; text: string; size: number }
  | { id: string; kind: 'rect' | 'ellipse'; x: number; y: number; w: number; h: number; stroke: string; fill?: string }
  | { id: string; kind: 'line' | 'arrow'; x1: number; y1: number; x2: number; y2: number; stroke: string }
  | { id: string; kind: 'freehand'; points: number[]; stroke: string }
  /** Anchored connector: endpoints follow the referenced placements. */
  | { id: string; kind: 'connector'; fromId: string; toId: string; stroke: string }

export interface TileLevel {
  /** world units per tile-texture pixel at this level (1 = native). */
  scale: number
  cols: number
  rows: number
}

export interface TileSpec {
  worldW: number
  worldH: number
  tileSize: number
  levels: TileLevel[]
}

export interface SceneBackground {
  textureId?: string
  color?: string
  x: number
  y: number
  scale: number
  opacity: number
}

export interface Scene {
  id: string
  images: SceneImage[]
  pins: ScenePin[]
  decorations: SceneDecoration[]
  tiles?: TileSpec
  background?: SceneBackground
  labelsVisible: boolean
}

export type Op =
  | { t: 'pan'; dx: number; dy: number }
  | { t: 'zoom'; scale: number; cx: number; cy: number }
  | { t: 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | { t: 'select'; ids: string[] }
  | { t: 'moveSelection'; dx: number; dy: number }
  | { t: 'scaleSelection'; factor: number }
  | { t: 'rotateSelection'; radians: number }
  | { t: 'setLabelsVisible'; visible: boolean }
  | { t: 'highlight'; ids: string[] }
  | { t: 'clearHighlight' }
  | { t: 'setBackgroundImage'; textureId: string | null }
  | { t: 'setBackgroundTransform'; x: number; y: number; scale: number; opacity: number }
  | { t: 'setBackgroundColor'; color: string | null }
  | { t: 'showGuides'; lines: { axis: 'x' | 'y'; value: number }[] }
  | { t: 'hideGuides' }
  | { t: 'addDecoration'; d: SceneDecoration }
  | { t: 'removeById'; id: string }
  | { t: 'bringToFront'; ids: string[] }
  | { t: 'sendToBack'; ids: string[] }
  | { t: 'setVisible'; ids: string[]; visible: boolean }
  | { t: 'setLocked'; ids: string[]; locked: boolean }
  | { t: 'commitGesture'; name: string }
  /** Runner-level ops (adapters still receive them; may ignore commit/wait). */
  | { t: 'loadScene'; sceneKey: string }
  | { t: 'wait'; frames: number }

export interface RendererAdapter {
  readonly name: string
  mount(host: HTMLElement, width: number, height: number): Promise<void>
  loadScene(scene: Scene): Promise<void>
  applyOp(op: Op): void
  unmount(): Promise<void>
}

export type AdapterFactory = () => Promise<RendererAdapter>
