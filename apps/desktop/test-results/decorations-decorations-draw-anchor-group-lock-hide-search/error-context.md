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
  262 |   // WHEN the line is hidden it stays in the scene, invisible, and the
  263 |   // hidden list restores it.
  264 |   const line = (await byKind('line'))[0]!
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
  359 |   await win.getByTestId('text-bold').click()
  360 |   await expect.poll(async () => (await byKind('text'))[0]!.data['bold']).toBe(true)
  361 |   const sizedBounds = (await byKind('text'))[0]!.data as { measuredHeight?: number }
> 362 |   expect(sizedBounds.measuredHeight).toBeGreaterThan(30)
      |                                      ^ Error: expect(received).toBeGreaterThan(expected)
  363 | 
  364 |   // Art-text resize: dragging a corner scales fontSize uniformly.
  365 |   await win.waitForFunction(() => window.__ewDebug!.selection().length === 1)
  366 |   const seHandle = await win.evaluate(
  367 |     () => window.__ewGestureDebug!.handles().find((h) => h.kind === 'resize' && h.dir === 'se')!,
  368 |   )
  369 |   const beforeScale = await revision()
  370 |   await win.mouse.move(box.x + seHandle.x, box.y + seHandle.y)
  371 |   await win.mouse.down()
  372 |   await win.mouse.move(box.x + seHandle.x + 60, box.y + seHandle.y + 10, { steps: 5 })
  373 |   await win.mouse.up()
  374 |   await expect.poll(() => revision()).toBe(beforeScale + 1)
  375 |   const scaled = (await byKind('text'))[0]!.data as { fontSize: number }
  376 |   expect(scaled.fontSize).toBeGreaterThan(32)
  377 | 
  378 |   expect((await decorations()).length).toBe(8)
  379 |   await app.close()
  380 | })
  381 | 
```