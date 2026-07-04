import {
  BackgroundSync,
  createDefaultRegistry,
  createScenePlanes,
  SceneSync,
  type CanvasScene,
  type RendererResources,
} from '@ew/canvas-engine'
import { Application, Texture } from 'pixi.js'

/**
 * Bridges the Project API to the canvas engine: mounts the Pixi
 * application, resolves the root canvas, projects `getCanvasScene`,
 * and re-projects on every project-changed event. All domain access
 * goes through window.ew (§11.1); textures arrive over ew-asset://.
 */

export interface CanvasHostHandle {
  destroy(): void
}

declare global {
  interface Window {
    __ewDebug?: {
      sceneStats: () => { total: number; placements: number; decorations: number }
      canvasId: () => string
    }
  }
}

async function runQuery<T>(name: string, args?: unknown): Promise<T> {
  const response = await window.ew.project.query(name, args)
  if (!response.ok) throw new Error(`${name} failed: ${response.code} ${response.message}`)
  return response.result as T
}

/** Decodes off the GPU path deliberately: no Pixi URL sniffing needed. */
const textureResources: RendererResources = {
  async loadTexture(url: string) {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`asset fetch failed: ${url} (${response.status})`)
    const bitmap = await createImageBitmap(await response.blob())
    return Texture.from(bitmap)
  },
}

export async function mountCanvasHost(element: HTMLElement): Promise<CanvasHostHandle> {
  const app = new Application()
  await app.init({ resizeTo: element, antialias: true, background: '#17191d' })
  element.appendChild(app.canvas)

  const planes = createScenePlanes()
  app.stage.addChild(planes.world, planes.overlay)
  const sync = new SceneSync(planes.content, createDefaultRegistry(), textureResources)
  const backgroundSync = new BackgroundSync(planes.background, textureResources)

  const project = await runQuery<{ rootNodeId: string }>('getProject')
  const rootCanvas = await runQuery<{ id: string }>('getCanvasByNode', {
    nodeId: project.rootNodeId,
  })
  const canvasId = rootCanvas.id

  let refreshing = false
  let refreshQueued = false
  async function refresh(): Promise<void> {
    // Coalesce bursts of project-changed events into one trailing query.
    if (refreshing) {
      refreshQueued = true
      return
    }
    refreshing = true
    try {
      const scene = await runQuery<CanvasScene | null>('getCanvasScene', { canvasId })
      if (!scene) {
        sync.clear()
        return
      }
      const color = backgroundSync.apply(scene.background)
      app.renderer.background.color = color ?? '#17191d'
      sync.apply(scene.items)
    } finally {
      refreshing = false
      if (refreshQueued) {
        refreshQueued = false
        void refresh()
      }
    }
  }

  await refresh()
  const unsubscribe = window.ew.project.onChanged(() => {
    void refresh()
  })

  window.__ewDebug = {
    sceneStats: () => sync.stats(),
    canvasId: () => canvasId,
  }

  return {
    destroy() {
      unsubscribe()
      delete window.__ewDebug
      app.destroy(true, { children: true })
    },
  }
}
