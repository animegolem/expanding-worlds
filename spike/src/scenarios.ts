import type { Op } from './adapter'
import type { SceneKey } from './fixtures'
import { VIEW, WORLD } from './fixtures'

/**
 * Scenario scripts covering every RFC-0001 §12.3 bullet. One op per
 * animation frame; `wait` idles n frames so texture uploads and GC
 * settle inside the measurement window.
 */

export interface Scenario {
  name: string
  sceneKey: SceneKey
  ops: Op[]
  /** Expected commitGesture count, asserted by the runner. */
  expectedCommits: number
}

const cx = VIEW.w / 2
const cy = VIEW.h / 2

function repeat(n: number, f: (i: number) => Op): Op[] {
  return Array.from({ length: n }, (_v, i) => f(i))
}

function panSweep(frames: number, dx: number, dy: number): Op[] {
  return repeat(frames, () => ({ t: 'pan', dx, dy }))
}

function zoomSweep(frames: number, from: number, to: number): Op[] {
  return repeat(frames, (i) => ({
    t: 'zoom',
    scale: from * Math.pow(to / from, (i + 1) / frames),
    cx,
    cy,
  }))
}

const wait = (frames: number): Op => ({ t: 'wait', frames })

export function buildScenarios(idsOf: (key: SceneKey) => { images: string[]; pins: string[] }): Scenario[] {
  const i300 = idsOf('images300')
  const p1k = idsOf('pins1000')
  const mix = idsOf('mixed')

  const dragTargets = i300.images.slice(0, 50)
  const highlightTargets = p1k.pins.slice(0, 12)
  const guideLines = [
    { axis: 'x' as const, value: WORLD.w / 2 },
    { axis: 'y' as const, value: WORLD.h / 2 },
  ]

  return [
    {
      name: 'map-pan-zoom',
      sceneKey: 'map',
      expectedCommits: 0,
      ops: [
        wait(30),
        ...zoomSweep(60, 0.06, 1.0),
        ...panSweep(120, 40, 18),
        ...zoomSweep(60, 1.0, 0.06),
        ...panSweep(60, -60, -20),
        wait(30),
      ],
    },
    {
      name: 'images-300',
      sceneKey: 'images300',
      expectedCommits: 0,
      ops: [wait(30), ...zoomSweep(50, 0.06, 0.5), ...panSweep(120, 50, 25), ...zoomSweep(50, 0.5, 0.12), wait(30)],
    },
    {
      name: 'pins-1000-labels',
      sceneKey: 'pins1000',
      expectedCommits: 0,
      ops: [
        wait(30),
        ...zoomSweep(50, 0.06, 0.8),
        { t: 'setLabelsVisible', visible: false },
        ...panSweep(80, 60, 25),
        { t: 'setLabelsVisible', visible: true },
        ...zoomSweep(80, 0.8, 0.06),
        wait(30),
      ],
    },
    {
      name: 'marquee-select',
      sceneKey: 'images300',
      expectedCommits: 0,
      ops: [
        wait(20),
        { t: 'zoom', scale: 0.06, cx, cy },
        ...repeat(45, (i) => ({ t: 'marquee', x0: 100, y0: 100, x1: 200 + i * 20, y1: 150 + i * 12 }) as Op),
        wait(20),
      ],
    },
    {
      name: 'multi-drag-snap',
      sceneKey: 'images300',
      expectedCommits: 1,
      ops: [
        wait(20),
        { t: 'select', ids: dragTargets },
        { t: 'showGuides', lines: guideLines },
        ...repeat(60, () => ({ t: 'moveSelection', dx: 8, dy: 4 }) as Op),
        { t: 'hideGuides' },
        { t: 'commitGesture', name: 'move-50' },
        wait(20),
      ],
    },
    {
      name: 'resize-rotate',
      sceneKey: 'images300',
      expectedCommits: 2,
      ops: [
        wait(20),
        { t: 'select', ids: dragTargets.slice(0, 10) },
        ...repeat(40, () => ({ t: 'scaleSelection', factor: 1.01 }) as Op),
        { t: 'commitGesture', name: 'resize-10' },
        ...repeat(40, () => ({ t: 'rotateSelection', radians: 0.02 }) as Op),
        { t: 'commitGesture', name: 'rotate-10' },
        wait(20),
      ],
    },
    {
      name: 'highlight-matches',
      sceneKey: 'pins1000',
      expectedCommits: 0,
      ops: [
        wait(20),
        { t: 'zoom', scale: 0.06, cx, cy },
        { t: 'highlight', ids: highlightTargets },
        wait(60),
        { t: 'clearHighlight' },
        wait(20),
      ],
    },
    {
      name: 'background-ops',
      sceneKey: 'mixed',
      expectedCommits: 5,
      ops: [
        wait(20),
        { t: 'setBackgroundImage', textureId: 'bg-tex-a' },
        { t: 'commitGesture', name: 'set-bg' },
        wait(20),
        { t: 'setBackgroundImage', textureId: 'bg-tex-b' },
        { t: 'commitGesture', name: 'replace-bg' },
        wait(20),
        ...repeat(30, (i) => ({ t: 'setBackgroundTransform', x: i * 4, y: i * 2, scale: 1 + i * 0.01, opacity: 0.9 }) as Op),
        { t: 'commitGesture', name: 'edit-bg' },
        { t: 'setBackgroundTransform', x: 0, y: 0, scale: 1, opacity: 1 },
        { t: 'commitGesture', name: 'reset-bg' },
        wait(10),
        { t: 'setBackgroundImage', textureId: null },
        { t: 'setBackgroundColor', color: '#22303c' },
        { t: 'commitGesture', name: 'remove-bg-set-color' },
        wait(20),
      ],
    },
    {
      name: 'decoration-suite',
      sceneKey: 'mixed',
      expectedCommits: 4,
      ops: [
        wait(20),
        { t: 'zoom', scale: 0.06, cx, cy },
        ...repeat(30, (i) => ({
          t: 'addDecoration',
          d: { id: `live-dec-${i}`, kind: 'rect', x: 200 + i * 60, y: 200 + i * 30, w: 120, h: 90, stroke: '#ffb703' },
        }) as Op),
        { t: 'commitGesture', name: 'draw-rects' },
        { t: 'select', ids: mix.images.slice(0, 12) },
        { t: 'bringToFront', ids: mix.images.slice(0, 12) },
        { t: 'commitGesture', name: 'reorder' },
        { t: 'setVisible', ids: mix.pins.slice(0, 40), visible: false },
        { t: 'commitGesture', name: 'hide' },
        { t: 'setLocked', ids: mix.images.slice(12, 24), locked: true },
        ...repeat(40, () => ({ t: 'moveSelection', dx: 5, dy: 3 }) as Op),
        { t: 'commitGesture', name: 'group-move' },
        { t: 'setVisible', ids: mix.pins.slice(0, 40), visible: true },
        wait(20),
      ],
    },
    {
      name: 'swap-and-return',
      sceneKey: 'images300',
      expectedCommits: 0,
      ops: [
        wait(30),
        ...panSweep(30, 30, 12),
        { t: 'loadScene', sceneKey: 'secondary' },
        wait(45),
        ...panSweep(30, 30, 12),
        { t: 'loadScene', sceneKey: 'images300' },
        wait(45),
        { t: 'loadScene', sceneKey: 'secondary' },
        wait(30),
        { t: 'loadScene', sceneKey: 'images300' },
        wait(45),
      ],
    },
  ]
}
