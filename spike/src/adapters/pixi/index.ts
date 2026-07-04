import type { Op, RendererAdapter, Scene, SceneDecoration, TileSpec } from '../../adapter'
import { textureCanvas, tileCanvas } from '../../textures'

/**
 * PixiJS (v8) implementation of RendererAdapter for AI-IMP-002.
 *
 * Structure:
 *   stage
 *     ├─ bgColor   (screen-space rect, behind everything)
 *     ├─ world     (camera container: position = pan, scale = zoom)
 *     │    ├─ bgSprite?    (background image, world-anchored)
 *     │    ├─ tileLayer    (culled tile pyramid sprites)
 *     │    ├─ contentLayer (images, pins, decorations; child order = z)
 *     │    └─ guideLayer   (smart-guide overlay, world coords)
 *     └─ marqueeLayer (screen-space marquee rect overlay)
 *
 * pixi.js is dynamically imported inside the factory so the base
 * bundle stays lean; only type-level imports appear at module scope.
 */

type Pixi = typeof import('pixi.js')
type Application = import('pixi.js').Application
type Container = import('pixi.js').Container
type Graphics = import('pixi.js').Graphics
type Sprite = import('pixi.js').Sprite
type Text = import('pixi.js').Text
type Texture = import('pixi.js').Texture

interface ItemRecord {
  id: string
  kind: 'image' | 'pin' | 'decoration'
  /** Positioned container in the content layer (or the graphics itself). */
  root: Container
  /** World center for images/pins; root position for decorations. */
  x: number
  y: number
  w: number
  h: number
  r: number
  rotation: number
  locked: boolean
  /** Rotatable/scalable child (sprite or pin circle); labels stay upright. */
  body?: Sprite | Graphics
  label?: Text
  pinColor?: string
}

interface ConnectorRecord {
  gfx: Graphics
  fromId: string
  toId: string
  stroke: string
}

const LABEL_STYLE = { fontFamily: 'sans-serif', fontSize: 12, fill: 0xffffff } as const
const HIGHLIGHT_TINT = 0xffd166
const DIM_ALPHA = 0.25

class PixiAdapter implements RendererAdapter {
  readonly name = 'pixi'

  private readonly px: Pixi
  private app: Application | null = null
  private viewW = 0
  private viewH = 0

  private world!: Container
  private tileLayer!: Container
  private contentLayer!: Container
  private guideLayer!: Graphics
  private marqueeLayer!: Graphics
  private bgColor!: Graphics
  private bgSprite: Sprite | null = null
  private bgTransform = { x: 0, y: 0, scale: 1, opacity: 1 }

  private items = new Map<string, ItemRecord>()
  private connectors: ConnectorRecord[] = []
  private selection = new Set<string>()
  private labelsVisible = true

  /** Shared image textures for the current scene, keyed by textureId. */
  private sceneTextures = new Map<string, Texture>()
  private tileSpec: TileSpec | null = null
  /** Live tile sprites keyed by `level:col:row`; each owns its texture. */
  private tileSprites = new Map<string, Sprite>()

  constructor(px: Pixi) {
    this.px = px
  }

  async mount(host: HTMLElement, width: number, height: number): Promise<void> {
    const app = new this.px.Application()
    await app.init({
      width,
      height,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
      background: '#101418',
      antialias: true,
    })
    host.appendChild(app.canvas)
    this.app = app
    this.viewW = width
    this.viewH = height

    this.bgColor = new this.px.Graphics()
    this.world = new this.px.Container()
    this.tileLayer = new this.px.Container()
    this.contentLayer = new this.px.Container()
    this.guideLayer = new this.px.Graphics()
    this.marqueeLayer = new this.px.Graphics()
    this.world.addChild(this.tileLayer, this.contentLayer, this.guideLayer)
    app.stage.addChild(this.bgColor, this.world, this.marqueeLayer)
  }

  loadScene(scene: Scene): Promise<void> {
    this.clearSceneContent()
    this.labelsVisible = scene.labelsVisible
    this.tileSpec = scene.tiles ?? null

    for (const img of scene.images) {
      const root = new this.px.Container()
      root.position.set(img.x, img.y)
      const sprite = new this.px.Sprite(this.sceneTexture(img.textureId))
      sprite.anchor.set(0.5)
      sprite.width = img.w
      sprite.height = img.h
      sprite.rotation = img.rotation
      root.addChild(sprite)
      const rec: ItemRecord = {
        id: img.id,
        kind: 'image',
        root,
        x: img.x,
        y: img.y,
        w: img.w,
        h: img.h,
        r: 0,
        rotation: img.rotation,
        locked: false,
        body: sprite,
      }
      if (img.label) rec.label = this.makeLabel(root, img.label, img.h / 2 + 4)
      this.contentLayer.addChild(root)
      this.items.set(img.id, rec)
    }

    for (const pin of scene.pins) {
      const root = new this.px.Container()
      root.position.set(pin.x, pin.y)
      const gfx = new this.px.Graphics()
      gfx.circle(0, 0, pin.r).fill(pin.color)
      root.addChild(gfx)
      const rec: ItemRecord = {
        id: pin.id,
        kind: 'pin',
        root,
        x: pin.x,
        y: pin.y,
        w: pin.r * 2,
        h: pin.r * 2,
        r: pin.r,
        rotation: 0,
        locked: false,
        body: gfx,
        pinColor: pin.color,
      }
      if (pin.label) rec.label = this.makeLabel(root, pin.label, pin.r + 3)
      this.contentLayer.addChild(root)
      this.items.set(pin.id, rec)
    }

    for (const dec of scene.decorations) this.addDecoration(dec)

    if (scene.background) {
      this.bgTransform = {
        x: scene.background.x,
        y: scene.background.y,
        scale: scene.background.scale,
        opacity: scene.background.opacity,
      }
      if (scene.background.color) this.setBackgroundColor(scene.background.color)
      if (scene.background.textureId) this.setBackgroundImage(scene.background.textureId)
    }

    this.updateTiles()
    return Promise.resolve()
  }

  applyOp(op: Op): void {
    switch (op.t) {
      case 'pan': {
        this.world.position.set(this.world.position.x + op.dx, this.world.position.y + op.dy)
        this.updateTiles()
        break
      }
      case 'zoom': {
        const s = this.world.scale.x
        const wx = (op.cx - this.world.position.x) / s
        const wy = (op.cy - this.world.position.y) / s
        this.world.scale.set(op.scale)
        this.world.position.set(op.cx - wx * op.scale, op.cy - wy * op.scale)
        this.updateTiles()
        break
      }
      case 'marquee':
        this.marquee(op.x0, op.y0, op.x1, op.y1)
        break
      case 'select':
        this.marqueeLayer.clear()
        this.selection = new Set(op.ids.filter((id) => !(this.items.get(id)?.locked ?? false)))
        break
      case 'moveSelection': {
        for (const rec of this.selectedRecords()) {
          rec.x += op.dx
          rec.y += op.dy
          rec.root.position.set(rec.x, rec.y)
        }
        this.updateConnectors()
        break
      }
      case 'scaleSelection': {
        for (const rec of this.selectedRecords()) {
          if (rec.kind === 'image' && rec.body) {
            rec.w *= op.factor
            rec.h *= op.factor
            const sprite = rec.body as Sprite
            sprite.width = rec.w
            sprite.height = rec.h
            if (rec.label) rec.label.position.y = rec.h / 2 + 4
          } else if (rec.kind === 'pin' && rec.body) {
            rec.r *= op.factor
            rec.w = rec.h = rec.r * 2
            const gfx = rec.body as Graphics
            gfx.clear()
            gfx.circle(0, 0, rec.r).fill(rec.pinColor ?? '#ffffff')
            if (rec.label) rec.label.position.y = rec.r + 3
          }
        }
        break
      }
      case 'rotateSelection': {
        for (const rec of this.selectedRecords()) {
          rec.rotation += op.radians
          if (rec.body) rec.body.rotation = rec.rotation
        }
        break
      }
      case 'setLabelsVisible': {
        this.labelsVisible = op.visible
        for (const rec of this.items.values()) {
          if (rec.label) rec.label.visible = op.visible
        }
        break
      }
      case 'highlight': {
        const keep = new Set(op.ids)
        for (const rec of this.items.values()) {
          if (keep.has(rec.id)) {
            rec.root.alpha = 1
            if (rec.body) rec.body.tint = HIGHLIGHT_TINT
          } else {
            rec.root.alpha = DIM_ALPHA
          }
        }
        break
      }
      case 'clearHighlight': {
        for (const rec of this.items.values()) {
          rec.root.alpha = 1
          if (rec.body) rec.body.tint = 0xffffff
        }
        break
      }
      case 'setBackgroundImage':
        this.setBackgroundImage(op.textureId)
        break
      case 'setBackgroundTransform': {
        this.bgTransform = { x: op.x, y: op.y, scale: op.scale, opacity: op.opacity }
        this.applyBackgroundTransform()
        break
      }
      case 'setBackgroundColor':
        this.setBackgroundColor(op.color)
        break
      case 'showGuides':
        this.showGuides(op.lines)
        break
      case 'hideGuides':
        this.guideLayer.clear()
        break
      case 'addDecoration':
        this.addDecoration(op.d)
        break
      case 'removeById': {
        const rec = this.items.get(op.id)
        if (rec) {
          rec.root.destroy({ children: true })
          this.items.delete(op.id)
          this.selection.delete(op.id)
          this.connectors = this.connectors.filter((c) => {
            if (c.gfx === rec.root) return false
            return true
          })
        }
        break
      }
      case 'bringToFront': {
        for (const id of op.ids) {
          const rec = this.items.get(id)
          if (rec) this.contentLayer.addChild(rec.root)
        }
        break
      }
      case 'sendToBack': {
        for (let i = op.ids.length - 1; i >= 0; i--) {
          const id = op.ids[i]
          const rec = id !== undefined ? this.items.get(id) : undefined
          if (rec) this.contentLayer.addChildAt(rec.root, 0)
        }
        break
      }
      case 'setVisible': {
        for (const id of op.ids) {
          const rec = this.items.get(id)
          if (rec) rec.root.visible = op.visible
        }
        break
      }
      case 'setLocked': {
        for (const id of op.ids) {
          const rec = this.items.get(id)
          if (rec) rec.locked = op.locked
        }
        break
      }
      case 'commitGesture':
      case 'loadScene':
      case 'wait':
        break
    }
  }

  unmount(): Promise<void> {
    this.clearSceneContent()
    if (this.app) {
      this.app.destroy(
        { removeView: true },
        { children: true, texture: true, textureSource: true },
      )
      this.app = null
    }
    this.bgSprite = null
    return Promise.resolve()
  }

  // ── scene lifecycle ────────────────────────────────────────────────

  /** Destroy all display objects and textures owned by the current scene. */
  private clearSceneContent(): void {
    if (!this.app) return
    for (const rec of this.items.values()) rec.root.destroy({ children: true })
    this.items.clear()
    this.connectors = []
    this.selection.clear()
    for (const sprite of this.tileSprites.values()) sprite.destroy({ texture: true, textureSource: true })
    this.tileSprites.clear()
    this.tileSpec = null
    for (const tex of this.sceneTextures.values()) tex.destroy(true)
    this.sceneTextures.clear()
    if (this.bgSprite) {
      this.bgSprite.destroy({ texture: true, textureSource: true })
      this.bgSprite = null
    }
    this.bgColor.clear()
    this.guideLayer.clear()
    this.marqueeLayer.clear()
    this.bgTransform = { x: 0, y: 0, scale: 1, opacity: 1 }
    this.world.position.set(0, 0)
    this.world.scale.set(1)
  }

  /** Adapter-owned texture from a fixture canvas (bypasses Pixi's global cache). */
  private makeTexture(canvas: HTMLCanvasElement): Texture {
    return new this.px.Texture({ source: new this.px.CanvasSource({ resource: canvas }) })
  }

  private sceneTexture(textureId: string): Texture {
    let tex = this.sceneTextures.get(textureId)
    if (!tex) {
      tex = this.makeTexture(textureCanvas(textureId))
      this.sceneTextures.set(textureId, tex)
    }
    return tex
  }

  private makeLabel(root: Container, text: string, offsetY: number): Text {
    const label = new this.px.Text({ text, style: { ...LABEL_STYLE } })
    label.anchor.set(0.5, 0)
    label.position.set(0, offsetY)
    label.visible = this.labelsVisible
    root.addChild(label)
    return label
  }

  // ── camera helpers ─────────────────────────────────────────────────

  private viewportWorldRect(): { x0: number; y0: number; x1: number; y1: number } {
    const s = this.world.scale.x
    const x0 = -this.world.position.x / s
    const y0 = -this.world.position.y / s
    return { x0, y0, x1: x0 + this.viewW / s, y1: y0 + this.viewH / s }
  }

  // ── tiles ──────────────────────────────────────────────────────────

  /**
   * Renders only the pyramid level whose scale best matches 1/zoom and
   * only tiles intersecting the viewport. Tile sprites (and their
   * textures) are created/destroyed as the view moves. REQUIRED culling.
   */
  private updateTiles(): void {
    const spec = this.tileSpec
    if (!spec) return
    const zoom = this.world.scale.x
    const target = Math.log2(1 / zoom)
    let levelIdx = 0
    let bestDist = Infinity
    for (let i = 0; i < spec.levels.length; i++) {
      const lv = spec.levels[i]
      if (!lv) continue
      const d = Math.abs(Math.log2(lv.scale) - target)
      if (d < bestDist) {
        bestDist = d
        levelIdx = i
      }
    }
    const level = spec.levels[levelIdx]
    if (!level) return
    const tws = spec.tileSize * level.scale
    const view = this.viewportWorldRect()
    const c0 = Math.max(0, Math.floor(view.x0 / tws))
    const c1 = Math.min(level.cols - 1, Math.floor(view.x1 / tws))
    const r0 = Math.max(0, Math.floor(view.y0 / tws))
    const r1 = Math.min(level.rows - 1, Math.floor(view.y1 / tws))

    const wanted = new Set<string>()
    for (let col = c0; col <= c1; col++) {
      for (let row = r0; row <= r1; row++) {
        const key = `${levelIdx}:${col}:${row}`
        wanted.add(key)
        if (!this.tileSprites.has(key)) {
          const tex = this.makeTexture(tileCanvas(levelIdx, col, row, spec.tileSize))
          const sprite = new this.px.Sprite(tex)
          sprite.position.set(col * tws, row * tws)
          sprite.width = tws
          sprite.height = tws
          this.tileLayer.addChild(sprite)
          this.tileSprites.set(key, sprite)
        }
      }
    }
    for (const [key, sprite] of this.tileSprites) {
      if (!wanted.has(key)) {
        sprite.destroy({ texture: true, textureSource: true })
        this.tileSprites.delete(key)
      }
    }
  }

  // ── selection & transforms ─────────────────────────────────────────

  private *selectedRecords(): Iterable<ItemRecord> {
    for (const id of this.selection) {
      const rec = this.items.get(id)
      if (rec && !rec.locked) yield rec
    }
  }

  /** Screen-space marquee: select images+pins intersecting the world rect. */
  private marquee(x0: number, y0: number, x1: number, y1: number): void {
    const s = this.world.scale.x
    const toWorldX = (sx: number) => (sx - this.world.position.x) / s
    const toWorldY = (sy: number) => (sy - this.world.position.y) / s
    const wx0 = Math.min(toWorldX(x0), toWorldX(x1))
    const wx1 = Math.max(toWorldX(x0), toWorldX(x1))
    const wy0 = Math.min(toWorldY(y0), toWorldY(y1))
    const wy1 = Math.max(toWorldY(y0), toWorldY(y1))

    this.selection.clear()
    for (const rec of this.items.values()) {
      if (rec.kind === 'decoration' || rec.locked) continue
      const hw = rec.w / 2
      const hh = rec.h / 2
      if (rec.x + hw >= wx0 && rec.x - hw <= wx1 && rec.y + hh >= wy0 && rec.y - hh <= wy1) {
        this.selection.add(rec.id)
      }
    }

    this.marqueeLayer.clear()
    this.marqueeLayer
      .rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0))
      .fill({ color: 0x4dabf7, alpha: 0.15 })
      .stroke({ color: 0x4dabf7, width: 1 })
  }

  // ── background ─────────────────────────────────────────────────────

  private setBackgroundImage(textureId: string | null): void {
    if (this.bgSprite) {
      this.bgSprite.destroy({ texture: true, textureSource: true })
      this.bgSprite = null
    }
    if (textureId !== null) {
      const sprite = new this.px.Sprite(this.makeTexture(textureCanvas(textureId)))
      this.world.addChildAt(sprite, 0)
      this.bgSprite = sprite
      this.applyBackgroundTransform()
    }
  }

  private applyBackgroundTransform(): void {
    if (!this.bgSprite) return
    this.bgSprite.position.set(this.bgTransform.x, this.bgTransform.y)
    this.bgSprite.scale.set(this.bgTransform.scale)
    this.bgSprite.alpha = this.bgTransform.opacity
  }

  private setBackgroundColor(color: string | null): void {
    this.bgColor.clear()
    if (color !== null) this.bgColor.rect(0, 0, this.viewW, this.viewH).fill(color)
  }

  // ── guides ─────────────────────────────────────────────────────────

  private showGuides(lines: { axis: 'x' | 'y'; value: number }[]): void {
    this.guideLayer.clear()
    const view = this.viewportWorldRect()
    const width = 1 / this.world.scale.x
    for (const line of lines) {
      if (line.axis === 'x') {
        this.guideLayer.moveTo(line.value, view.y0).lineTo(line.value, view.y1)
      } else {
        this.guideLayer.moveTo(view.x0, line.value).lineTo(view.x1, line.value)
      }
    }
    this.guideLayer.stroke({ color: 0xff5c8a, width })
  }

  // ── decorations ────────────────────────────────────────────────────

  private addDecoration(d: SceneDecoration): void {
    const gfx = new this.px.Graphics()
    let root: Container = gfx
    let x = 0
    let y = 0

    switch (d.kind) {
      case 'text': {
        const text = new this.px.Text({
          text: d.text,
          style: { fontFamily: 'sans-serif', fontSize: d.size, fill: 0xe8e8e8 },
        })
        text.position.set(d.x, d.y)
        root = text
        x = d.x
        y = d.y
        break
      }
      case 'rect': {
        gfx.rect(0, 0, d.w, d.h)
        if (d.fill) gfx.fill(d.fill)
        gfx.stroke({ color: d.stroke, width: 2 })
        gfx.position.set(d.x, d.y)
        x = d.x + d.w / 2
        y = d.y + d.h / 2
        break
      }
      case 'ellipse': {
        gfx.ellipse(d.w / 2, d.h / 2, d.w / 2, d.h / 2)
        if (d.fill) gfx.fill(d.fill)
        gfx.stroke({ color: d.stroke, width: 2 })
        gfx.position.set(d.x, d.y)
        x = d.x + d.w / 2
        y = d.y + d.h / 2
        break
      }
      case 'line': {
        gfx.moveTo(d.x1, d.y1).lineTo(d.x2, d.y2).stroke({ color: d.stroke, width: 2 })
        x = (d.x1 + d.x2) / 2
        y = (d.y1 + d.y2) / 2
        break
      }
      case 'arrow': {
        gfx.moveTo(d.x1, d.y1).lineTo(d.x2, d.y2)
        const angle = Math.atan2(d.y2 - d.y1, d.x2 - d.x1)
        const headLen = 14
        gfx.moveTo(d.x2, d.y2).lineTo(
          d.x2 - headLen * Math.cos(angle - Math.PI / 6),
          d.y2 - headLen * Math.sin(angle - Math.PI / 6),
        )
        gfx.moveTo(d.x2, d.y2).lineTo(
          d.x2 - headLen * Math.cos(angle + Math.PI / 6),
          d.y2 - headLen * Math.sin(angle + Math.PI / 6),
        )
        gfx.stroke({ color: d.stroke, width: 2 })
        x = (d.x1 + d.x2) / 2
        y = (d.y1 + d.y2) / 2
        break
      }
      case 'freehand': {
        const [px0, py0] = [d.points[0], d.points[1]]
        if (px0 !== undefined && py0 !== undefined) {
          gfx.moveTo(px0, py0)
          for (let i = 2; i + 1 < d.points.length; i += 2) {
            gfx.lineTo(d.points[i] ?? 0, d.points[i + 1] ?? 0)
          }
          gfx.stroke({ color: d.stroke, width: 2 })
          x = px0
          y = py0
        }
        break
      }
      case 'connector': {
        const rec: ConnectorRecord = { gfx, fromId: d.fromId, toId: d.toId, stroke: d.stroke }
        this.connectors.push(rec)
        this.drawConnector(rec)
        break
      }
    }

    this.contentLayer.addChild(root)
    this.items.set(d.id, {
      id: d.id,
      kind: 'decoration',
      root,
      x,
      y,
      w: 0,
      h: 0,
      r: 0,
      rotation: 0,
      locked: false,
    })
  }

  /** Connector endpoints track the CENTERS of the referenced placements. */
  private drawConnector(c: ConnectorRecord): void {
    const from = this.items.get(c.fromId)
    const to = this.items.get(c.toId)
    c.gfx.clear()
    if (!from || !to) return
    c.gfx.moveTo(from.x, from.y).lineTo(to.x, to.y).stroke({ color: c.stroke, width: 2 })
  }

  private updateConnectors(): void {
    for (const c of this.connectors) this.drawConnector(c)
  }
}

export async function createPixiAdapter(): Promise<RendererAdapter> {
  const px = await import('pixi.js')
  return new PixiAdapter(px)
}
