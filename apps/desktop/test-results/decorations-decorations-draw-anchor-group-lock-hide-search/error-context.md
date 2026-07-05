# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: decorations.spec.ts >> decorations: draw, anchor, group, lock, hide, search
- Location: e2e/decorations.spec.ts:24:1

# Error details

```
Error: expect(received).toBeGreaterThan(expected)

Expected: > 30
Received:   19.1953125
```

# Test source

```ts
  265 |   await win.mouse.click(...at(530, 510))
  266 |   await expect
  267 |     .poll(() => win.evaluate(() => window.__ewDebug!.selection()))
  268 |     .toEqual([line.id])
  269 |   await win.getByTestId('deco-hide').click()
  270 |   await expect
  271 |     .poll(async () => (await decorations()).find((d) => d.id === line.id)?.hidden)
  272 |     .toBe(1)
  273 |   expect(await win.evaluate((id) => window.__ewDebug!.decorationVisible(id), line.id)).toBe(false)
  274 |   expect((await decorations()).some((d) => d.id === line.id)).toBe(true)
  275 |   await win.getByTestId(`deco-show-${line.id}`).click()
  276 |   await expect
  277 |     .poll(async () => (await decorations()).find((d) => d.id === line.id)?.hidden)
  278 |     .toBe(0)
  279 |   await expect
  280 |     .poll(() => win.evaluate((id) => window.__ewDebug!.decorationVisible(id), line.id))
  281 |     .toBe(true)
  282 | 
  283 |   // WHEN text is entered through the DOM overlay (§12.2)…
  284 |   const overlayFocused = () =>
  285 |     expect
  286 |       .poll(() =>
  287 |         win.evaluate(
  288 |           () => (document.activeElement as HTMLElement | null)?.dataset?.['testid'] ?? null,
  289 |         ),
  290 |       )
  291 |       .toBe('text-entry')
  292 |   await win.getByTestId('tool-text').click()
  293 |   const beforeText = await revision()
  294 |   await win.mouse.click(...at(200, 300))
  295 |   await expect(win.getByTestId('text-entry')).toBeVisible()
  296 |   await overlayFocused()
  297 |   await win.keyboard.type('ancient beacon tower')
  298 |   await win.keyboard.press('Enter')
  299 |   await expect.poll(() => revision()).toBe(beforeText + 1)
  300 |   const text = (await byKind('text'))[0]!
  301 |   expect(text.data).toMatchObject({ x: 200, y: 300, text: 'ancient beacon tower', fontSize: 16 })
  302 | 
  303 |   // …THEN it is findable via canvas_text_fts.
  304 |   const hits = await win.evaluate(async () => {
  305 |     const result = await window.ew.project.query('searchProject', { query: 'beacon' })
  306 |     if (!result.ok) throw new Error(result.message)
  307 |     return result.result as { canvasText: Array<{ decorationId: string }> }
  308 |   })
  309 |   expect(hits.canvasText).toHaveLength(1)
  310 |   expect(hits.canvasText[0]!.decorationId).toBe(text.id)
  311 | 
  312 |   // Editing via double-click commits exactly one UpdateDecoration.
  313 |   await win.getByTestId('tool-select').click()
  314 |   const beforeEdit = await revision()
  315 |   await win.mouse.dblclick(...at(202, 302))
  316 |   await expect(win.getByTestId('text-entry')).toBeVisible()
  317 |   await overlayFocused()
  318 |   // The edit overlay opens with the text selected: type to replace.
  319 |   await win.keyboard.type('renamed beacon')
  320 |   await win.keyboard.press('Enter')
  321 |   await expect.poll(() => revision()).toBe(beforeEdit + 1)
  322 |   await expect
  323 |     .poll(async () => (await byKind('text'))[0]!.data['text'])
  324 |     .toBe('renamed beacon')
  325 | 
  326 |   // AI-IMP-030: edits store measured world extents, which make the
  327 |   // text body clickable (not just the 4-unit slop at its corner)…
  328 |   const measured = (await byKind('text'))[0]!.data as {
  329 |     measuredWidth?: number
  330 |     measuredHeight?: number
  331 |   }
  332 |   expect(measured.measuredWidth).toBeGreaterThan(20)
  333 |   expect(measured.measuredHeight).toBeGreaterThan(10)
  334 |   const center: [number, number] = [
  335 |     200 + measured.measuredWidth! / 2,
  336 |     300 + measured.measuredHeight! / 2,
  337 |   ]
  338 |   await win.mouse.click(...at(...center))
  339 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  340 | 
  341 |   // …and draggable: one durable TransformContent moves the body.
  342 |   const beforeMove = await revision()
  343 |   await win.mouse.move(...at(...center))
  344 |   await win.mouse.down()
  345 |   await win.mouse.move(...at(320, 380), { steps: 5 })
  346 |   await win.mouse.up()
  347 |   await expect.poll(() => revision()).toBe(beforeMove + 1)
  348 |   const moved = (await byKind('text'))[0]!.data as { x: number; y: number }
  349 |   expect(moved.x).toBeGreaterThan(200)
  350 |   expect(moved.y).toBeGreaterThan(300)
  351 | 
  352 |   // AI-IMP-034: whole-object type controls on a single selected text.
  353 |   await expect(win.getByTestId('text-style-controls')).toBeVisible()
  354 |   await win.getByTestId('text-size').fill('32')
  355 |   await win.getByTestId('text-size').press('Enter')
  356 |   await expect
  357 |     .poll(async () => (await byKind('text'))[0]!.data['fontSize'])
  358 |     .toBe(32)
  359 |   // The toolbar composes edits from its (120ms-refreshed) snapshot —
  360 |   // wait for it to reflect the size before layering the bold toggle.
  361 |   await expect(win.getByTestId('text-size')).toHaveValue('32')
  362 |   await win.getByTestId('text-bold').click()
  363 |   await expect.poll(async () => (await byKind('text'))[0]!.data['bold']).toBe(true)
  364 |   const sizedBounds = (await byKind('text'))[0]!.data as { measuredHeight?: number }
> 365 |   expect(sizedBounds.measuredHeight).toBeGreaterThan(30)
      |                                      ^ Error: expect(received).toBeGreaterThan(expected)
  366 | 
  367 |   // AI-IMP-037: the family picker enumerates installed fonts on its
  368 |   // first user gesture and stores the choice with a stack fallback.
  369 |   await win.getByTestId('text-family').click()
  370 |   await expect
  371 |     .poll(async () => win.locator('[data-testid="text-family"] option').count(), {
  372 |       timeout: 10_000,
  373 |     })
  374 |     .toBeGreaterThan(3)
  375 |   const systemFamily = await win.evaluate(() => {
  376 |     const select = document.querySelector<HTMLSelectElement>('[data-testid="text-family"]')!
  377 |     const opt = [...select.options].find((o) => o.value.includes('",'))
  378 |     return opt?.value ?? null
  379 |   })
  380 |   expect(systemFamily).not.toBeNull()
  381 |   await win.getByTestId('text-family').selectOption(systemFamily!)
  382 |   await expect
  383 |     .poll(async () => ((await byKind('text'))[0]!.data as { fontFamily?: string }).fontFamily)
  384 |     .toBe(systemFamily)
  385 |   expect(systemFamily).toContain('sans-serif')
  386 | 
  387 |   // Art-text resize: dragging a corner scales fontSize uniformly.
  388 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  389 |   const seHandle = await win.evaluate(
  390 |     () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'resize' && h.dir === 'se')!,
  391 |   )
  392 |   const beforeScale = await revision()
  393 |   await win.mouse.move(box.x + seHandle.x, box.y + seHandle.y)
  394 |   await win.mouse.down()
  395 |   await win.mouse.move(box.x + seHandle.x + 60, box.y + seHandle.y + 10, { steps: 5 })
  396 |   await win.mouse.up()
  397 |   await expect.poll(() => revision()).toBe(beforeScale + 1)
  398 |   const scaled = (await byKind('text'))[0]!.data as { fontSize: number }
  399 |   expect(scaled.fontSize).toBeGreaterThan(32)
  400 | 
  401 |   expect((await decorations()).length).toBe(8)
  402 |   await app.close()
  403 | })
  404 | 
  405 | test('shift-constrained drawing (AI-IMP-035)', async () => {
  406 |   const projectDir = mkdtempSync(join(tmpdir(), 'ew-e2e-shift-draw-'))
  407 |   const app = await electron.launch({
  408 |     args: ['out/main/index.cjs'],
  409 |     env: { ...process.env, EW_PROJECT_DIR: projectDir },
  410 |   })
  411 |   const win = await app.firstWindow()
  412 |   await win.waitForFunction(() => window.__ewDebug !== undefined)
  413 |   const box = (await win.getByTestId('canvas-host').boundingBox())!
  414 |   const decorations = (): Promise<Array<{ kind: string; data: Record<string, number | string> }>> =>
  415 |     win.evaluate(() => window.__ewDebug!.decorations() as never)
  416 | 
  417 |   // Shift-rect commits a square from the dominant drag extent.
  418 |   await win.getByTestId('tool-rect').click()
  419 |   await win.keyboard.down('Shift')
  420 |   await win.mouse.move(box.x + 200, box.y + 200)
  421 |   await win.mouse.down()
  422 |   await win.mouse.move(box.x + 280, box.y + 230, { steps: 4 })
  423 |   await win.mouse.up()
  424 |   await win.keyboard.up('Shift')
  425 |   await expect.poll(async () => (await decorations()).length).toBe(1)
  426 |   const square = (await decorations())[0]!.data
  427 |   expect(square['width']).toBe(80)
  428 |   expect(square['height']).toBe(80)
  429 | 
  430 |   // Shift-arrow at ~50° commits at exactly 45°, length preserved.
  431 |   await win.getByTestId('tool-arrow').click()
  432 |   await win.keyboard.down('Shift')
  433 |   await win.mouse.move(box.x + 400, box.y + 200)
  434 |   await win.mouse.down()
  435 |   await win.mouse.move(box.x + 400 + 64, box.y + 200 + 77, { steps: 4 })
  436 |   await win.mouse.up()
  437 |   await win.keyboard.up('Shift')
  438 |   await expect.poll(async () => (await decorations()).length).toBe(2)
  439 |   const arrow = (await decorations()).find((d) => d.kind === 'arrow')!.data
  440 |   const dx = (arrow['x2'] as number) - (arrow['x1'] as number)
  441 |   const dy = (arrow['y2'] as number) - (arrow['y1'] as number)
  442 |   expect(Math.atan2(dy, dx)).toBeCloseTo(Math.PI / 4, 5)
  443 | 
  444 |   // AI-IMP-038: the arrow SHAPE scales with its box like any shape.
  445 |   await win.getByTestId('tool-shape-arrow').click()
  446 |   await win.mouse.move(box.x + 600, box.y + 200)
  447 |   await win.mouse.down()
  448 |   await win.mouse.move(box.x + 700, box.y + 250, { steps: 4 })
  449 |   await win.mouse.up()
  450 |   await expect.poll(async () => (await decorations()).length).toBe(3)
  451 |   const arrowShape = (await decorations()).find((d) => d.data['shape'] === 'arrow')!
  452 |   expect(arrowShape.data['width']).toBe(100)
  453 |   await win.getByTestId('tool-select').click()
  454 |   await win.mouse.click(box.x + 650, box.y + 225)
  455 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  456 |   const se = await win.evaluate(
  457 |     () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'resize' && h.dir === 'se')!,
  458 |   )
  459 |   await win.mouse.move(box.x + se.x, box.y + se.y)
  460 |   await win.mouse.down()
  461 |   await win.mouse.move(box.x + se.x + 100, box.y + se.y + 50, { steps: 5 })
  462 |   await win.mouse.up()
  463 |   await expect
  464 |     .poll(async () => {
  465 |       const d = (await decorations()).find((dd) => dd.data['shape'] === 'arrow')!.data
```