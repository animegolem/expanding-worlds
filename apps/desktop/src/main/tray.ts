/**
 * The tray perch (AI-IMP-278): a quiet OS-level presence whose one
 * job is telling a stale install it is stale — the owner's preferred
 * surface at testing cadence. Idle it is furniture; when a check
 * finds a release it swaps to the badged glyph (win32) / gains a •
 * title (macOS template image convention) and its menu offers the
 * download. Linux is deliberately trayless (AppImage tray support is
 * a swamp); the launch check + Settings row still cover it.
 */
import { join } from 'node:path'
import { Menu, Tray, nativeImage, shell } from 'electron'
import type { UpdateStatus } from './update-check'

export interface TrayHandle {
  setStatus(status: UpdateStatus | null): void
  dispose(): void
}

export function initTray(options: {
  /** Directory holding the generated tray PNGs (see resources/icons/tray). */
  iconDir: string
  appVersion: string
  onCheckRequested: () => Promise<UpdateStatus>
  onOpenRequested: () => void
}): TrayHandle | null {
  const { iconDir, appVersion, onCheckRequested, onOpenRequested } = options
  const mac = process.platform === 'darwin'
  const idleIcon = nativeImage.createFromPath(
    join(iconDir, mac ? 'trayTemplate.png' : 'tray-idle.png'),
  )
  const updateIcon = mac ? idleIcon : nativeImage.createFromPath(join(iconDir, 'tray-update.png'))
  if (idleIcon.isEmpty()) return null
  if (mac) idleIcon.setTemplateImage(true)

  let tray: Tray
  try {
    tray = new Tray(idleIcon)
  } catch {
    // A tray is a courtesy surface — environments without one
    // (some CI, stripped desktops) just do without.
    return null
  }
  let current: UpdateStatus | null = null
  let checking = false

  function rebuild(): void {
    const update = current?.state === 'update-available' ? current : null
    tray.setToolTip(
      update
        ? `Expanding Worlds — v${update.latest} is out`
        : `Expanding Worlds v${appVersion}`,
    )
    if (mac) tray.setTitle(update ? '•' : '')
    else tray.setImage(update ? updateIcon : idleIcon)
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: update
            ? `v${update.latest} is out (running v${appVersion})`
            : `Expanding Worlds v${appVersion}`,
          enabled: false,
        },
        ...(update
          ? [
              {
                label: `Download v${update.latest}…`,
                click: () => void shell.openExternal(update.downloadUrl ?? ''),
              },
            ]
          : []),
        {
          label: checking ? 'Checking…' : 'Check for updates',
          enabled: !checking,
          click: () => {
            checking = true
            rebuild()
            void onCheckRequested()
              .then((status) => (current = status))
              .catch(() => undefined)
              .finally(() => {
                checking = false
                rebuild()
              })
          },
        },
        { type: 'separator' },
        { label: 'Open Expanding Worlds', click: () => onOpenRequested() },
      ]),
    )
  }

  rebuild()
  return {
    setStatus(status) {
      current = status
      rebuild()
    },
    dispose() {
      tray.destroy()
    },
  }
}
