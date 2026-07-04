import type { Op, RendererAdapter, Scene, SceneDecoration, TileSpec } from '../../adapter'
import { textureCanvas, tileCanvas } from '../../textures'

/**
 * Konva implementation of the spike RendererAdapter (AI-IMP-003).
 *
 * Structure follows Konva's "few layers" guidance: three layers only —
 * background (color fill + background image + tile pyramid), content
 * (images, pins, decorations, labels, Transformer), and overlay
 * (guides + marquee). The camera is a world Group per layer sharing one
 * transform; the background color fill and the marquee rect live in
 * screen space directly on their layers.
 *
 * konva is dynamically imported inside the factory so the base bundle
 * stays lean; all konva types below are type-only and erased at build.
 */

type KonvaNS = typeof import('konva').default
type Stage = InstanceType<KonvaNS['Stage']>
type Layer = InstanceType<KonvaNS['Layer']>
type Group = InstanceType<KonvaNS['Group']>
type KRect = InstanceType<KonvaNS['Rect']>
type KImage = InstanceType<KonvaNS['Image']>
type KText = InstanceType<KonvaNS['Text']>
type KLine = InstanceType<KonvaNS['Line']>
type KShape = InstanceType<KonvaNS['Shape']>
type KTransformer = InstanceType<KonvaNS['Transformer']>
type KNode = InstanceType<KonvaNS['Node']>

const DEG = 180 / Math.PI

interface ItemRec {
  id: string
  kind: 'image' | 'pin' | 'decoration'
  node: KShape
  label?: KText
  /** Center position in world units (images/pins). Decorations keep node-local coords. */
  x: number
  y: number
  w: number
  h: number
  r: number
  rotation: number // radians
  locked: boolean
  visible: boolean
}

interface ConnectorRec {
  fromId: string
  toId: string
  line: KLine
}

interface WorldRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

class KonvaSpikeAdapter implements RendererAdapter {
  readonly name = 'konva'

  private readonly K: KonvaNS
  private stage: Stage | null = null
  private viewW = 0
  private viewH = 0

  private bgLayer: Layer | null = null
  private contentLayer: Layer | null = null
  private overlayLayer: Layer | null = null

  private colorRect: KRect | null = null
  private bgWorld: Group | null = null
  private contentWorld: Group | null = null
  private overlayWorld: Group | null = null

  private bgImageNode: KImage | null = null
  private bgTransform = { x: 0, y: 0, scale: 1, opacity: 1 }
  private tileGroup: Group | null = null
  private tileSpec: TileSpec | null = null
  private tileNodes = new Map<string, KImage>()

  private marqueeRect: KRect | null = null
  private guideNodes: KLine[] = []
  private transformer: KTransformer | null = null

  private cam = { x: 0, y: 0, scale: 1 }
  private recs = new Map<string, ItemRec>()
  private connectorsByAnchor = new Map<string, ConnectorRec[]>()
  private selection: string[] = []
  private highlighted: string[] = []
  private labelsVisible = true

  constructor(K: KonvaNS) {
    this.K = K
  }

  mount(host: HTMLElement, width: number, height: number): Promise<void> {
    const K = this.K
    this.viewW = width
    this.viewH = height
    // Konva sizes its canvases by devicePixelRatio automatically (DPR-correct).
    this.stage = new K.Stage({ container: host as HTMLDivElement, width, height })

    this.bgLayer = new K.Layer({ listening: false })
    this.contentLayer = new K.Layer()
    this.overlayLayer = new K.Layer({ listening: false })

    this.colorRect = new K.Rect({ x: 0, y: 0, width, height, visible: false, listening: false })
    this.bgWorld = new K.Group({ listening: false })
    this.tileGroup = new K.Group({ listening: false })
    this.bgWorld.add(this.tileGroup)
    this.bgLayer.add(this.colorRect)
    this.bgLayer.add(this.bgWorld)

    this.contentWorld = new K.Group()
    this.contentLayer.add(this.contentWorld)

    this.overlayWorld = new K.Group({ listening: false })
    this.marqueeRect = new K.Rect({
      visible: false,
      fill: 'rgba(76,201,240,0.15)',
      stroke: '#4cc9f0',
      strokeWidth: 1,
      listening: false,
    })
    this.overlayLayer.add(this.overlayWorld)
    this.overlayLayer.add(this.marqueeRect)

    this.stage.add(this.bgLayer)
    this.stage.add(this.contentLayer)
    this.stage.add(this.overlayLayer)
    this.applyCamera()
    return Promise.resolve()
  }

  loadScene(scene: Scene): Promise<void> {
    const K = this.K
    if (!this.contentWorld || !this.bgWorld || !this.overlayWorld) throw new Error('konva adapter not mounted')

    // Fully replace prior scene content, destroying previous nodes.
    this.transformer = null
    this.contentWorld.destroyChildren()
    this.bgWorld.destroyChildren()
    this.overlayWorld.destroyChildren()
    this.bgImageNode = null
    this.tileNodes.clear()
    this.tileGroup = new K.Group({ listening: false })
    this.bgWorld.add(this.tileGroup)
    this.marqueeRect?.visible(false)
    this.guideNodes = []
    this.recs.clear()
    this.connectorsByAnchor.clear()
    this.selection = []
    this.highlighted = []

    this.labelsVisible = scene.labelsVisible
    this.tileSpec = scene.tiles ?? null
    this.bgTransform = { x: 0, y: 0, scale: 1, opacity: 1 }
    this.colorRect?.visible(false)
    if (scene.background) {
      const b = scene.background
      this.bgTransform = { x: b.x, y: b.y, scale: b.scale, opacity: b.opacity }
      if (b.color) this.setBackgroundColor(b.color)
      if (b.textureId) this.setBackgroundImage(b.textureId)
    }

    for (const img of scene.images) {
      const node = new K.Image({
        image: textureCanvas(img.textureId),
        x: img.x,
        y: img.y,
        width: img.w,
        height: img.h,
        offsetX: img.w / 2,
        offsetY: img.h / 2,
        rotation: img.rotation * DEG,
        perfectDrawEnabled: false,
      })
      this.contentWorld.add(node)
      const rec: ItemRec = {
        id: img.id,
        kind: 'image',
        node,
        x: img.x,
        y: img.y,
        w: img.w,
        h: img.h,
        r: 0,
        rotation: img.rotation,
        locked: false,
        visible: true,
      }
      if (img.label) rec.label = this.makeLabel(img.label)
      this.recs.set(img.id, rec)
      this.updateLabel(rec)
    }

    for (const pin of scene.pins) {
      const node = new K.Circle({
        x: pin.x,
        y: pin.y,
        radius: pin.r,
        fill: pin.color,
        perfectDrawEnabled: false,
      })
      this.contentWorld.add(node)
      const rec: ItemRec = {
        id: pin.id,
        kind: 'pin',
        node,
        x: pin.x,
        y: pin.y,
        w: pin.r * 2,
        h: pin.r * 2,
        r: pin.r,
        rotation: 0,
        locked: false,
        visible: true,
      }
      if (pin.label) rec.label = this.makeLabel(pin.label)
      this.recs.set(pin.id, rec)
      this.updateLabel(rec)
    }

    for (const dec of scene.decorations) this.addDecoration(dec)

    // Transformer last so selection handles render above content — the
    // hit graph, handles and multi-node bounds tracking come from Konva.
    this.transformer = new K.Transformer({ rotateEnabled: true, ignoreStroke: true })
    this.contentWorld.add(this.transformer)

    this.applyCamera()
    return Promise.resolve()
  }

  applyOp(op: Op): void {
    switch (op.t) {
      case 'pan':
        this.cam.x += op.dx
        this.cam.y += op.dy
        this.applyCamera()
        break
      case 'zoom': {
        const { scale, cx, cy } = op
        const wx = (cx - this.cam.x) / this.cam.scale
        const wy = (cy - this.cam.y) / this.cam.scale
        this.cam.scale = scale
        this.cam.x = cx - wx * scale
        this.cam.y = cy - wy * scale
        this.applyCamera()
        break
      }
      case 'marquee':
        this.marquee(op.x0, op.y0, op.x1, op.y1)
        break
      case 'select':
        this.setSelection(op.ids)
        this.marqueeRect?.visible(false)
        break
      case 'moveSelection':
        for (const rec of this.selectedRecs()) {
          rec.x += op.dx
          rec.y += op.dy
          rec.node.position({ x: rec.x, y: rec.y })
          this.updateLabel(rec)
          this.updateConnectorsFor(rec.id)
        }
        break
      case 'scaleSelection':
        for (const rec of this.selectedRecs()) {
          rec.w *= op.factor
          rec.h *= op.factor
          if (rec.kind === 'image') {
            rec.node.size({ width: rec.w, height: rec.h })
            rec.node.offset({ x: rec.w / 2, y: rec.h / 2 })
          } else if (rec.kind === 'pin') {
            rec.r *= op.factor
            ;(rec.node as InstanceType<KonvaNS['Circle']>).radius(rec.r)
          } else {
            rec.node.scale({ x: rec.node.scaleX() * op.factor, y: rec.node.scaleY() * op.factor })
          }
          this.updateLabel(rec)
        }
        break
      case 'rotateSelection':
        for (const rec of this.selectedRecs()) {
          rec.rotation += op.radians
          rec.node.rotation(rec.rotation * DEG)
        }
        break
      case 'setLabelsVisible':
        this.labelsVisible = op.visible
        for (const rec of this.recs.values()) this.updateLabel(rec)
        break
      case 'highlight': {
        this.clearHighlight()
        const on = new Set(op.ids)
        this.highlighted = [...op.ids]
        for (const rec of this.recs.values()) {
          const hit = on.has(rec.id)
          rec.node.opacity(hit ? 1 : 0.25)
          rec.label?.opacity(hit ? 1 : 0.25)
          if (hit && rec.kind !== 'decoration') rec.node.setAttrs({ stroke: '#ffd166', strokeWidth: 4 })
        }
        break
      }
      case 'clearHighlight':
        this.clearHighlight()
        break
      case 'setBackgroundImage':
        this.setBackgroundImage(op.textureId)
        break
      case 'setBackgroundTransform':
        this.bgTransform = { x: op.x, y: op.y, scale: op.scale, opacity: op.opacity }
        this.applyBgTransform()
        break
      case 'setBackgroundColor':
        this.setBackgroundColor(op.color)
        break
      case 'showGuides':
        this.showGuides(op.lines)
        break
      case 'hideGuides':
        for (const n of this.guideNodes) n.destroy()
        this.guideNodes = []
        break
      case 'addDecoration':
        this.addDecoration(op.d)
        break
      case 'removeById': {
        const rec = this.recs.get(op.id)
        if (rec) {
          rec.node.destroy()
          rec.label?.destroy()
          this.recs.delete(op.id)
          this.selection = this.selection.filter((id) => id !== op.id)
        }
        break
      }
      case 'bringToFront':
        for (const id of op.ids) {
          const rec = this.recs.get(id)
          if (!rec) continue
          rec.node.moveToTop()
          rec.label?.moveToTop()
        }
        // Keep selection handles above reordered content.
        this.transformer?.moveToTop()
        break
      case 'sendToBack':
        for (let i = op.ids.length - 1; i >= 0; i--) {
          const rec = this.recs.get(op.ids[i] ?? '')
          if (!rec) continue
          rec.label?.moveToBottom()
          rec.node.moveToBottom()
        }
        break
      case 'setVisible':
        for (const id of op.ids) {
          const rec = this.recs.get(id)
          if (!rec) continue
          rec.visible = op.visible
          rec.node.visible(op.visible)
          this.updateLabel(rec)
        }
        break
      case 'setLocked':
        for (const id of op.ids) {
          const rec = this.recs.get(id)
          if (rec) rec.locked = op.locked
        }
        break
      case 'commitGesture':
      case 'loadScene':
      case 'wait':
        // Runner concerns; nothing to render.
        break
    }
  }

  unmount(): Promise<void> {
    // Konva 10 releases canvas backing stores on destroy
    // (releaseCanvasOnDestroy defaults to true), which is exactly what
    // the swap-and-return heap check measures.
    this.stage?.destroy()
    this.stage = null
    this.bgLayer = this.contentLayer = this.overlayLayer = null
    this.colorRect = this.marqueeRect = null
    this.bgWorld = this.contentWorld = this.overlayWorld = this.tileGroup = null
    this.bgImageNode = null
    this.transformer = null
    this.tileSpec = null
    this.tileNodes.clear()
    this.recs.clear()
    this.connectorsByAnchor.clear()
    this.selection = []
    this.highlighted = []
    this.guideNodes = []
    return Promise.resolve()
  }

  // --- camera & tiles ---

  private applyCamera(): void {
    for (const g of [this.bgWorld, this.contentWorld, this.overlayWorld]) {
      g?.position({ x: this.cam.x, y: this.cam.y })
      g?.scale({ x: this.cam.scale, y: this.cam.scale })
    }
    this.updateTiles()
  }

  private viewWorldRect(pad = 0): WorldRect {
    const s = this.cam.scale
    const x0 = -this.cam.x / s
    const y0 = -this.cam.y / s
    const x1 = (this.viewW - this.cam.x) / s
    const y1 = (this.viewH - this.cam.y) / s
    const px = (x1 - x0) * pad
    const py = (y1 - y0) * pad
    return { x0: x0 - px, y0: y0 - py, x1: x1 + px, y1: y1 + py }
  }

  /** Level whose scale best matches 1/zoom; only viewport-intersecting tiles kept. */
  private updateTiles(): void {
    const spec = this.tileSpec
    if (!spec || !this.tileGroup) {
      if (this.tileNodes.size) {
        for (const n of this.tileNodes.values()) n.destroy()
        this.tileNodes.clear()
      }
      return
    }
    let levelIdx = 0
    let bestD = Infinity
    for (let i = 0; i < spec.levels.length; i++) {
      const lv = spec.levels[i]
      if (!lv) continue
      const d = Math.abs(Math.log(lv.scale * this.cam.scale))
      if (d < bestD) {
        bestD = d
        levelIdx = i
      }
    }
    const level = spec.levels[levelIdx]
    if (!level) return
    const tileWorld = spec.tileSize * level.scale
    const view = this.viewWorldRect()
    const c0 = Math.max(0, Math.floor(view.x0 / tileWorld))
    const c1 = Math.min(level.cols - 1, Math.floor(view.x1 / tileWorld))
    const r0 = Math.max(0, Math.floor(view.y0 / tileWorld))
    const r1 = Math.min(level.rows - 1, Math.floor(view.y1 / tileWorld))

    const wanted = new Set<string>()
    for (let c = c0; c <= c1; c++) {
      for (let r = r0; r <= r1; r++) wanted.add(`${levelIdx}:${c}:${r}`)
    }
    for (const [key, node] of this.tileNodes) {
      if (!wanted.has(key)) {
        node.destroy()
        this.tileNodes.delete(key)
      }
    }
    for (const key of wanted) {
      if (this.tileNodes.has(key)) continue
      const [, cs, rs] = key.split(':')
      const c = Number(cs)
      const r = Number(rs)
      const node = new this.K.Image({
        image: tileCanvas(levelIdx, c, r, spec.tileSize),
        x: c * tileWorld,
        y: r * tileWorld,
        width: tileWorld,
        height: tileWorld,
        listening: false,
        perfectDrawEnabled: false,
      })
      this.tileGroup.add(node)
      this.tileNodes.set(key, node)
    }
  }

  // --- selection & interaction ---

  private selectedRecs(): ItemRec[] {
    const out: ItemRec[] = []
    for (const id of this.selection) {
      const rec = this.recs.get(id)
      if (rec && !rec.locked) out.push(rec)
    }
    return out
  }

  private setSelection(ids: string[]): void {
    this.selection = ids.filter((id) => {
      const rec = this.recs.get(id)
      return !!rec && !rec.locked
    })
    // Konva Transformer gives selection handles/bounds for free; spike
    // transforms are applied per-item (spec semantics), so it is used
    // as selection UI that auto-tracks node changes.
    this.transformer?.nodes(this.selectedRecs().map((r) => r.node as KNode))
  }

  private marquee(x0: number, y0: number, x1: number, y1: number): void {
    const s = this.cam.scale
    const wx0 = (Math.min(x0, x1) - this.cam.x) / s
    const wy0 = (Math.min(y0, y1) - this.cam.y) / s
    const wx1 = (Math.max(x0, x1) - this.cam.x) / s
    const wy1 = (Math.max(y0, y1) - this.cam.y) / s

    const ids: string[] = []
    for (const rec of this.recs.values()) {
      if (rec.kind === 'decoration' || rec.locked || !rec.visible) continue
      let hw: number
      let hh: number
      if (rec.kind === 'pin') {
        hw = rec.r
        hh = rec.r
      } else {
        const cos = Math.abs(Math.cos(rec.rotation))
        const sin = Math.abs(Math.sin(rec.rotation))
        hw = (cos * rec.w + sin * rec.h) / 2
        hh = (sin * rec.w + cos * rec.h) / 2
      }
      if (rec.x + hw >= wx0 && rec.x - hw <= wx1 && rec.y + hh >= wy0 && rec.y - hh <= wy1) ids.push(rec.id)
    }
    this.selection = ids
    // Marquee visual persists in screen space until the next marquee/select.
    this.marqueeRect?.setAttrs({
      x: Math.min(x0, x1),
      y: Math.min(y0, y1),
      width: Math.abs(x1 - x0),
      height: Math.abs(y1 - y0),
      visible: true,
    })
  }

  private showGuides(lines: { axis: 'x' | 'y'; value: number }[]): void {
    for (const n of this.guideNodes) n.destroy()
    this.guideNodes = []
    if (!this.overlayWorld) return
    const view = this.viewWorldRect(0.25)
    for (const line of lines) {
      const points =
        line.axis === 'x'
          ? [line.value, view.y0, line.value, view.y1]
          : [view.x0, line.value, view.x1, line.value]
      const node = new this.K.Line({
        points,
        stroke: '#4cc9f0',
        strokeWidth: 1.5 / this.cam.scale,
        dash: [8 / this.cam.scale, 6 / this.cam.scale],
        listening: false,
        perfectDrawEnabled: false,
      })
      this.overlayWorld.add(node)
      this.guideNodes.push(node)
    }
  }

  private clearHighlight(): void {
    if (!this.highlighted.length) {
      // Still restore opacity in case highlight dimmed everything.
      for (const rec of this.recs.values()) {
        rec.node.opacity(1)
        rec.label?.opacity(1)
      }
      return
    }
    const was = new Set(this.highlighted)
    for (const rec of this.recs.values()) {
      rec.node.opacity(1)
      rec.label?.opacity(1)
      if (was.has(rec.id) && rec.kind !== 'decoration') rec.node.setAttrs({ stroke: undefined, strokeWidth: undefined })
    }
    this.highlighted = []
  }

  // --- background ---

  private setBackgroundImage(textureId: string | null): void {
    this.bgImageNode?.destroy()
    this.bgImageNode = null
    if (!textureId || !this.bgWorld) return
    this.bgImageNode = new this.K.Image({
      image: textureCanvas(textureId),
      listening: false,
      perfectDrawEnabled: false,
    })
    this.bgWorld.add(this.bgImageNode)
    this.bgImageNode.moveToBottom() // behind tiles
    this.applyBgTransform()
  }

  private applyBgTransform(): void {
    const t = this.bgTransform
    if (!this.bgImageNode) return
    this.bgImageNode.position({ x: t.x, y: t.y })
    this.bgImageNode.scale({ x: t.scale, y: t.scale })
    this.bgImageNode.opacity(t.opacity)
  }

  private setBackgroundColor(color: string | null): void {
    if (!this.colorRect) return
    if (color) {
      this.colorRect.fill(color)
      this.colorRect.visible(true)
    } else {
      this.colorRect.visible(false)
    }
  }

  // --- content helpers ---

  private makeLabel(text: string): KText {
    const label = new this.K.Text({
      text,
      fontSize: 13,
      fontFamily: 'system-ui, sans-serif',
      fill: '#e8e8e8',
      listening: false,
      perfectDrawEnabled: false,
    })
    label.offsetX(label.width() / 2)
    this.contentWorld?.add(label)
    return label
  }

  /** Keeps the label just below the item and applies visibility rules. */
  private updateLabel(rec: ItemRec): void {
    if (!rec.label) return
    const below = rec.kind === 'pin' ? rec.r + 3 : rec.h / 2 + 4
    rec.label.position({ x: rec.x, y: rec.y + below })
    rec.label.visible(this.labelsVisible && rec.visible)
  }

  private addDecoration(d: SceneDecoration): void {
    const K = this.K
    if (!this.contentWorld) return
    let node: KShape
    let x = 0
    let y = 0
    switch (d.kind) {
      case 'text': {
        node = new K.Text({ x: d.x, y: d.y, text: d.text, fontSize: d.size, fill: '#f1f1f1', perfectDrawEnabled: false })
        x = d.x
        y = d.y
        break
      }
      case 'rect': {
        node = new K.Rect({ x: d.x, y: d.y, width: d.w, height: d.h, stroke: d.stroke, fill: d.fill, strokeWidth: 2, perfectDrawEnabled: false })
        x = d.x + d.w / 2
        y = d.y + d.h / 2
        break
      }
      case 'ellipse': {
        node = new K.Ellipse({ x: d.x + d.w / 2, y: d.y + d.h / 2, radiusX: d.w / 2, radiusY: d.h / 2, stroke: d.stroke, fill: d.fill, strokeWidth: 2, perfectDrawEnabled: false })
        x = d.x + d.w / 2
        y = d.y + d.h / 2
        break
      }
      case 'line': {
        node = new K.Line({ points: [d.x1, d.y1, d.x2, d.y2], stroke: d.stroke, strokeWidth: 2, perfectDrawEnabled: false })
        x = (d.x1 + d.x2) / 2
        y = (d.y1 + d.y2) / 2
        break
      }
      case 'arrow': {
        // Konva.Arrow: arrowheads for free.
        node = new K.Arrow({ points: [d.x1, d.y1, d.x2, d.y2], stroke: d.stroke, fill: d.stroke, strokeWidth: 2, pointerLength: 12, pointerWidth: 10, perfectDrawEnabled: false })
        x = (d.x1 + d.x2) / 2
        y = (d.y1 + d.y2) / 2
        break
      }
      case 'freehand': {
        node = new K.Line({ points: [...d.points], stroke: d.stroke, strokeWidth: 2.5, lineCap: 'round', lineJoin: 'round', perfectDrawEnabled: false })
        x = d.points[0] ?? 0
        y = d.points[1] ?? 0
        break
      }
      case 'connector': {
        const from = this.recs.get(d.fromId)
        const to = this.recs.get(d.toId)
        const line = new K.Line({
          points: [from?.x ?? 0, from?.y ?? 0, to?.x ?? 0, to?.y ?? 0],
          stroke: d.stroke,
          strokeWidth: 2,
          perfectDrawEnabled: false,
        })
        node = line
        const conn: ConnectorRec = { fromId: d.fromId, toId: d.toId, line }
        for (const anchor of [d.fromId, d.toId]) {
          const list = this.connectorsByAnchor.get(anchor)
          if (list) list.push(conn)
          else this.connectorsByAnchor.set(anchor, [conn])
        }
        break
      }
    }
    this.contentWorld.add(node)
    // Keep selection handles above freshly drawn decorations.
    this.transformer?.moveToTop()
    this.recs.set(d.id, {
      id: d.id,
      kind: 'decoration',
      node,
      x,
      y,
      w: 0,
      h: 0,
      r: 0,
      rotation: 0,
      locked: false,
      visible: true,
    })
  }

  /** Anchored connectors track the centers of their endpoint placements. */
  private updateConnectorsFor(anchorId: string): void {
    const conns = this.connectorsByAnchor.get(anchorId)
    if (!conns) return
    for (const conn of conns) {
      const from = this.recs.get(conn.fromId)
      const to = this.recs.get(conn.toId)
      conn.line.points([from?.x ?? 0, from?.y ?? 0, to?.x ?? 0, to?.y ?? 0])
    }
  }
}

export async function createKonvaAdapter(): Promise<RendererAdapter> {
  const konva = await import('konva')
  return new KonvaSpikeAdapter(konva.default)
}
