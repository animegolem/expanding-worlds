import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { uuidv7 } from '@ew/domain'
import type { ProjectService } from '@ew/persistence'

/**
 * First-open library seed (RFC-0001 §14.4, AI-IMP-094): when the
 * create-new-library path makes a FRESH library project, it is
 * pre-seeded with a small example arranged the intended way — a root
 * board of artists whose nodes dive into per-artist boards with
 * placed works, notes, and tags — so the user sees what the surface
 * is for before owning it.
 *
 * The seed is ordinary records built through ordinary commands
 * (importAsset + CreatePin + CreateCanvas + CreateTag + …): no SQL
 * fixtures, no special content class. Every seed node carries the
 * shared 'example' tag, which is the whole clear-the-example
 * contract — `clearLibraryExample` below enumerates by that tag and
 * trashes through ordinary TrashNode commands, so the example is
 * recoverable from Trash and purgeable like anything else.
 *
 * Runs INSIDE the utility process against the freshly created
 * service directly: execute has no cross-process verb for
 * secondaries (deliberately — a secondary-execute door is much wider
 * than this ticket), and seeding at creation is the one moment the
 * writable service is already in hand.
 */

interface Artist {
  name: string
  blurb: string
  flavorTag: string
  works: string[]
}

/** Fictional artists — the images are generated placeholders (see
 * resources/seed/LICENSE.md); no real artist is implied. Works map
 * onto the seed directory's images in filename order. */
const ARTISTS: Artist[] = [
  {
    name: 'Aster Vale',
    blurb: 'Atmosphere studies — horizons and hours of the day.',
    flavorTag: 'atmosphere',
    works: ['Dawn Study', 'Dusk Study', 'Sea Bands'],
  },
  {
    name: 'Juniper Brandt',
    blurb: 'Hard-edged geometry — stripes, grids, and rings.',
    flavorTag: 'geometry',
    works: ['Stripe Set', 'Checker Field', 'Ring Cut'],
  },
  {
    name: 'Milo Ferren',
    blurb: 'Radial and diagonal light fields.',
    flavorTag: 'light',
    works: ['Glow Core', 'Slant Field', 'Ember Fall'],
  },
]

const EXAMPLE_TAG = 'example'

const EXPLAINER_TITLE = 'Start here — this library is an example'
const EXPLAINER_BODY = `This library was seeded with a small example so the surface explains itself: each pinned artist on this board dives into their own board of placed works, and everything carries tags you can filter by in the gallery.

None of it is special — every record here is an ordinary node, note, board, or tag, made the same way your own material will be.

Everything in the example (including this note) carries the tag "${EXAMPLE_TAG}". When you want it gone, open the gallery's *everything* scope and press "Clear the example set": only example-tagged records are trashed, they land in Trash like any ordinary delete, and your own material is never touched.`

type Exec = (commandType: string, payload: unknown) => void

function execFor(service: ProjectService): Exec {
  const projectId = service.info().projectId
  return (commandType, payload) => {
    const result = service.execute({
      commandId: uuidv7(),
      projectId,
      commandType,
      commandVersion: 1,
      issuedAt: new Date().toISOString(),
      payload,
    })
    if (result.status !== 'committed') {
      const detail = result.status === 'error' ? `${result.code}: ${result.message}` : result.status
      throw new Error(`seed ${commandType} failed — ${detail}`)
    }
  }
}

/** Seed the example world into a FRESHLY CREATED library project.
 * Throws on any failure; the caller decides whether a failed seed
 * fails the open (it should not — the library itself is fine). */
export async function seedLibrary(service: ProjectService, seedDir: string): Promise<void> {
  const files = readdirSync(seedDir)
    .filter((name) => /\.(png|webp|jpe?g)$/i.test(name))
    .sort()
  if (files.length === 0) throw new Error(`no seed images in ${seedDir}`)

  const exec = execFor(service)
  const rootCanvasId = service.info().rootCanvasId

  const exampleTagId = uuidv7()
  exec('CreateTag', { tagId: exampleTagId, name: EXAMPLE_TAG })

  let fileIndex = 0
  let artistX = 120
  for (const artist of ARTISTS) {
    const flavorTagId = uuidv7()
    exec('CreateTag', { tagId: flavorTagId, name: artist.flavorTag })

    // Import this artist's works first: the artist pin borrows the
    // first work's image as its appearance (a board with a face).
    const assetIds: string[] = []
    for (let i = 0; i < artist.works.length; i++) {
      const file = files[fileIndex % files.length]!
      fileIndex += 1
      const bytes = readFileSync(join(seedDir, file))
      const { assetId } = await service.importAsset({
        bytes: new Uint8Array(bytes),
        originalFilename: file,
      })
      assetIds.push(assetId)
    }

    // The artist node on the root board: image face, named by its
    // note, diving into an owned canvas (§14.4's intended shape).
    const artistNodeId = uuidv7()
    exec('CreatePin', {
      nodeId: artistNodeId,
      canvasId: rootCanvasId,
      placementId: uuidv7(),
      x: artistX,
      y: 260,
      appearance: { kind: 'image', assetId: assetIds[0]!, crop: null },
      note: { kind: 'create', noteId: uuidv7(), title: artist.name, body: artist.blurb },
    })
    const artistCanvasId = uuidv7()
    exec('CreateCanvas', { canvasId: artistCanvasId, nodeId: artistNodeId })
    exec('AssignTagToNode', { tagId: exampleTagId, nodeId: artistNodeId })
    exec('AssignTagToNode', { tagId: flavorTagId, nodeId: artistNodeId })

    // The works, placed on the artist's board: image pins named by
    // their notes, each tagged 'example' plus the artist's flavor.
    let workX = 120
    for (let i = 0; i < artist.works.length; i++) {
      const workNodeId = uuidv7()
      exec('CreatePin', {
        nodeId: workNodeId,
        canvasId: artistCanvasId,
        placementId: uuidv7(),
        x: workX,
        y: 160,
        appearance: { kind: 'image', assetId: assetIds[i]!, crop: null },
        note: {
          kind: 'create',
          noteId: uuidv7(),
          title: `${artist.works[i]!} (${artist.name})`,
        },
      })
      exec('AssignTagToNode', { tagId: exampleTagId, nodeId: workNodeId })
      exec('AssignTagToNode', { tagId: flavorTagId, nodeId: workNodeId })
      workX += 460
    }

    artistX += 520
  }

  // The explainer: an ordinary pinned note, placed prominently at
  // the top of the root board, rendered as a card so the lesson is
  // open the moment the board is. Tagged 'example' like the rest —
  // clearing removes it with the records it explains.
  const explainerNodeId = uuidv7()
  exec('CreatePin', {
    nodeId: explainerNodeId,
    canvasId: rootCanvasId,
    placementId: uuidv7(),
    x: 120,
    y: 40,
    appearance: { kind: 'dot', color: '#e8c450' },
    note: { kind: 'create', noteId: uuidv7(), title: EXPLAINER_TITLE, body: EXPLAINER_BODY },
  })
  exec('SetNodeAppearance', { nodeId: explainerNodeId, appearance: { kind: 'card' } })
  exec('AssignTagToNode', { tagId: exampleTagId, nodeId: explainerNodeId })
}

/**
 * Clear the example (§14.4): find every ACTIVE node carrying the
 * 'example' tag and trash it through ordinary TrashNode commands —
 * artist boards (their canvas aggregate rides along), works, and the
 * explainer alike. Returns the number of nodes trashed; 0 when no
 * example remains (idempotent). User material never carries the seed
 * tag assignments, so it is never touched.
 */
export function clearLibraryExample(service: ProjectService): number {
  const tags = service.query('listTags')
  if (!tags.ok) throw new Error(`listTags failed — ${tags.code}: ${tags.message}`)
  const example = (tags.result as Array<{ id: string; name: string }>).find(
    (tag) => tag.name.trim().toLowerCase() === EXAMPLE_TAG,
  )
  if (!example) return 0

  const index = service.query('getGalleryIndex', { tagIds: [example.id] })
  if (!index.ok) throw new Error(`getGalleryIndex failed — ${index.code}: ${index.message}`)
  const nodeIds = (index.result as Array<{ nodeId: string }>).map((entry) => entry.nodeId)

  const exec = execFor(service)
  for (const nodeId of nodeIds) exec('TrashNode', { nodeId })
  return nodeIds.length
}
