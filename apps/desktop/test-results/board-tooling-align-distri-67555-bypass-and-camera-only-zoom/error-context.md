# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: board-tooling.spec.ts >> align, distribute, snap with guides, Alt bypass, and camera-only zoom
- Location: e2e/board-tooling.spec.ts:137:1

# Error details

```
Error: expect(received).not.toEqual(expected) // deep equality

Expected: not {"x": 0, "y": 0, "zoom": 1}

```

# Test source

```ts
  141 |   await expect(win.getByTestId('align-left')).toBeDisabled()
  142 |   await expect(win.getByTestId('distribute-horizontal')).toBeDisabled()
  143 | 
  144 |   // Seed three 40×40 dot placements.
  145 |   const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  146 |   for (const [x, y] of [
  147 |     [150, 150],
  148 |     [260, 200],
  149 |     [380, 260],
  150 |   ] as const) {
  151 |     const nodeId = crypto.randomUUID()
  152 |     await runCommand(win, 'CreateNode', { nodeId })
  153 |     await runCommand(win, 'CreatePlacement', {
  154 |       placementId: crypto.randomUUID(),
  155 |       canvasId,
  156 |       nodeId,
  157 |       x,
  158 |       y,
  159 |       width: 40,
  160 |       height: 40,
  161 |     })
  162 |   }
  163 |   await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 3)
  164 |   const box = (await win.getByTestId('canvas-host').boundingBox())!
  165 | 
  166 |   // Marquee-select all three (camera is identity: world = screen).
  167 |   await win.mouse.move(box.x + 100, box.y + 100)
  168 |   await win.mouse.down()
  169 |   await win.mouse.move(box.x + 430, box.y + 300, { steps: 4 })
  170 |   await win.mouse.up()
  171 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 3)
  172 | 
  173 |   // Align Top: exactly one TransformContent; every center lands on 150.
  174 |   const beforeAlign = await revision(win)
  175 |   await win.getByTestId('align-top').click()
  176 |   await expect
  177 |     .poll(async () => (await scenePlacements(win)).map((p) => p.y))
  178 |     .toEqual([150, 150, 150])
  179 |   expect(await revision(win)).toBe(beforeAlign + 1)
  180 | 
  181 |   // Distribute horizontally: gaps equalize (75 each), one command.
  182 |   const beforeDistribute = await revision(win)
  183 |   await win.getByTestId('distribute-horizontal').click()
  184 |   await expect
  185 |     .poll(async () => (await scenePlacements(win)).map((p) => p.x))
  186 |     .toEqual([150, 265, 380])
  187 |   expect(await revision(win)).toBe(beforeDistribute + 1)
  188 | 
  189 |   // Drag the middle placement toward the first one's right edge
  190 |   // (world 170): at proposed left 173 the snap pulls it flush, a
  191 |   // vertical smart guide shows the matched edge, and the drop is
  192 |   // still exactly one TransformContent.
  193 |   await win.mouse.click(box.x + 600, box.y + 500) // clear selection
  194 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 0)
  195 |   await win.mouse.click(box.x + 265, box.y + 150)
  196 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  197 |   const beforeSnap = await revision(win)
  198 |   await win.mouse.move(box.x + 265, box.y + 150)
  199 |   await win.mouse.down()
  200 |   await win.mouse.move(box.x + 193, box.y + 150, { steps: 6 })
  201 |   await expect
  202 |     .poll(() =>
  203 |       win.evaluate(() =>
  204 |         window.__ewDebug!.guides().some((g) => g.axis === 'x' && g.position === 170),
  205 |       ),
  206 |     )
  207 |     .toBe(true)
  208 |   await win.mouse.up()
  209 |   await expect
  210 |     .poll(async () => (await scenePlacements(win)).map((p) => [p.x, p.y]))
  211 |     .toEqual([
  212 |       [150, 150],
  213 |       [190, 150], // left edge 170 = first placement's right edge
  214 |       [380, 150],
  215 |     ])
  216 |   expect(await revision(win)).toBe(beforeSnap + 1)
  217 |   // Guides never outlive the gesture.
  218 |   expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)
  219 | 
  220 |   // Alt-drag repeats a near-edge drop without snapping.
  221 |   const beforeAlt = await revision(win)
  222 |   await win.keyboard.down('Alt')
  223 |   await win.mouse.move(box.x + 190, box.y + 150)
  224 |   await win.mouse.down()
  225 |   await win.mouse.move(box.x + 192, box.y + 154, { steps: 2 })
  226 |   expect(await win.evaluate(() => window.__ewDebug!.guides().length)).toBe(0)
  227 |   await win.mouse.up()
  228 |   await win.keyboard.up('Alt')
  229 |   await expect
  230 |     .poll(async () => (await scenePlacements(win))[1])
  231 |     .toMatchObject({ x: 192, y: 154 }) // exact pointer delta, no snap
  232 |   expect(await revision(win)).toBe(beforeAlt + 1)
  233 | 
  234 |   // Zoom to fit / to selection: camera-only, no durable command (the
  235 |   // revision is read before the debounced camera persist can land).
  236 |   const cameraBefore = await win.evaluate(() => window.__ewDebug!.camera())
  237 |   const beforeZoom = await revision(win)
  238 |   await win.getByTestId('zoom-fit').click()
  239 |   expect(await revision(win)).toBe(beforeZoom)
  240 |   const fitted = await win.evaluate(() => window.__ewDebug!.camera())
> 241 |   expect(fitted).not.toEqual(cameraBefore)
      |                      ^ Error: expect(received).not.toEqual(expected) // deep equality
  242 |   await win.getByTestId('zoom-selection').click()
  243 |   expect(await revision(win)).toBe(beforeZoom)
  244 |   const toSelection = await win.evaluate(() => window.__ewDebug!.camera())
  245 |   expect(toSelection).not.toEqual(fitted)
  246 | 
  247 |   await app.close()
  248 | })
  249 | 
  250 | test('background lifecycle: set, edit in explicit mode, reset, replace, remove, color beneath', async () => {
  251 |   const { app, win } = await launch('ew-e2e-background-')
  252 |   const canvasId = await win.evaluate(() => window.__ewDebug!.canvasId())
  253 |   const box = (await win.getByTestId('canvas-host').boundingBox())!
  254 | 
  255 |   // Set from a selected image placement's asset (§6.7 path a).
  256 |   const asset1 = await importPng(win, '#ff0000')
  257 |   await runCommand(win, 'CreatePin', {
  258 |     nodeId: crypto.randomUUID(),
  259 |     canvasId,
  260 |     placementId: crypto.randomUUID(),
  261 |     x: 400,
  262 |     y: 300,
  263 |     appearance: { kind: 'image', assetId: asset1, crop: null },
  264 |   })
  265 |   await win.waitForFunction(() => window.__ewDebug!.sceneStats().placements === 1)
  266 |   await win.mouse.click(box.x + 400, box.y + 300)
  267 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  268 |   await expect(win.getByTestId('bg-set-from-selection')).toBeEnabled()
  269 |   const beforeSet = await revision(win)
  270 |   await win.getByTestId('bg-set-from-selection').click()
  271 |   await expect.poll(async () => (await sceneBackground(win)).assetId).toBe(asset1)
  272 |   expect(await revision(win)).toBe(beforeSet + 1)
  273 |   // §6.7 rev 0.11: from-selection preserves the placed world rect —
  274 |   // the 8×8 image at natural size centered on (400, 300).
  275 |   expect((await sceneBackground(win)).settings).toEqual({ x: 396, y: 296, scale: 1, opacity: 1 })
  276 |   await expect
  277 |     .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
  278 |     .not.toBeNull()
  279 |   // Neutralize the framing flight so the drag math below stays in
  280 |   // identity screen space.
  281 |   await win.evaluate(() => window.__ewDebug!.setCamera({ x: 0, y: 0, zoom: 1 }))
  282 | 
  283 |   // Edit Background Position: explicit mode, ephemeral drag, ONE
  284 |   // SetCanvasBackground on Done.
  285 |   await win.getByTestId('bg-edit').click()
  286 |   await expect
  287 |     .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
  288 |     .toBe(true)
  289 |   const beforeEdit = await revision(win)
  290 |   await win.mouse.move(box.x + 600, box.y + 400)
  291 |   await win.mouse.down()
  292 |   await win.mouse.move(box.x + 640, box.y + 420, { steps: 4 })
  293 |   await win.mouse.up()
  294 |   await expect
  295 |     .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
  296 |     .toMatchObject({ x: 436, y: 316 })
  297 |   // Still ephemeral: nothing durable happened while dragging.
  298 |   expect(await revision(win)).toBe(beforeEdit)
  299 |   expect((await sceneBackground(win)).settings).toMatchObject({ x: 396, y: 296 })
  300 |   await win.getByTestId('bg-edit-done').click()
  301 |   await expect
  302 |     .poll(async () => (await sceneBackground(win)).settings)
  303 |     .toEqual({ x: 436, y: 316, scale: 1, opacity: 1 })
  304 |   expect(await revision(win)).toBe(beforeEdit + 1)
  305 |   expect(await win.evaluate(() => window.__ewBoardDebug!.backgroundMode())).toBe(false)
  306 | 
  307 |   // Escape reverts the sprite and commits nothing.
  308 |   await win.getByTestId('bg-edit').click()
  309 |   await expect
  310 |     .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
  311 |     .toBe(true)
  312 |   const beforeCancel = await revision(win)
  313 |   await win.mouse.move(box.x + 600, box.y + 400)
  314 |   await win.mouse.down()
  315 |   await win.mouse.move(box.x + 560, box.y + 380, { steps: 4 })
  316 |   await win.mouse.up()
  317 |   await expect
  318 |     .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundSprite()))
  319 |     .toMatchObject({ x: 396, y: 296 })
  320 |   await win.keyboard.press('Escape')
  321 |   await expect
  322 |     .poll(() => win.evaluate(() => window.__ewBoardDebug!.backgroundMode()))
  323 |     .toBe(false)
  324 |   expect(await win.evaluate(() => window.__ewBoardDebug!.backgroundSprite())).toMatchObject({
  325 |     x: 436,
  326 |     y: 316,
  327 |   })
  328 |   expect(await revision(win)).toBe(beforeCancel)
  329 | 
  330 |   // Reset Background Transform: one command back to the normalized
  331 |   // stage default (§6.7 rev 0.11): 2048 / 8 native px = scale 256.
  332 |   const beforeReset = await revision(win)
  333 |   await win.getByTestId('bg-reset').click()
  334 |   await expect
  335 |     .poll(async () => (await sceneBackground(win)).settings)
  336 |     .toEqual({ x: 0, y: 0, scale: 256, opacity: 1 })
  337 |   expect(await revision(win)).toBe(beforeReset + 1)
  338 | 
  339 |   // Background color sits beneath the image: both fields coexist.
  340 |   const beforeColor = await revision(win)
  341 |   await win.getByTestId('bg-color').fill('#336699')
```