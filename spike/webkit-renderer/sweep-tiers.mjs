// AI-IMP-241 throwaway driver: launches REAL Google Chrome (headed,
// hardware GPU — never headless SwiftShader, per EPIC-004) and runs the
// 30s sweep across BOTH texture modes (off / tiered) × three scene sizes
// (100 / 300 / 500 images), printing one JSON array plus a compact table
// on stderr. Mode/budget/count ride the query string so each cell is a
// fresh page load with a clean budget.
//
//   node sweep-tiers.mjs [http://localhost:5199] [budgetMB]
//
// Verify gl.renderer in the output is a real GPU (ANGLE Metal / Apple
// GPU), never SwiftShader/llvmpipe, or the numbers are void.
import { chromium } from 'playwright-core'
import os from 'node:os'

const base = process.argv[2] ?? 'http://localhost:5199'
const budgetMB = Number(process.argv[3] ?? 1536)
const MODES = ['off', 'tiered']
const SIZES = [100, 300, 500]

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false, // headed → real Metal/ANGLE GPU (never SwiftShader)
  args: [
    // SILENT: park the window fully off-screen and never activate it, so
    // the run does not steal focus on the owner's machine. The throttling
    // flags (217's driver) keep rAF at full rate even unfocused/occluded —
    // validated: gl.renderer stays real Metal and mean fps stays ~90–115.
    '--window-position=4000,200',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
})

const fmtGB = (b) => `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`
const results = []

for (const mode of MODES) {
  for (const count of SIZES) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    })
    const url = `${base}/?mode=${mode}&budget=${budgetMB}&count=${count}`
    await page.goto(url, { waitUntil: 'networkidle' })
    // Deliberately no bringToFront: the window stays off-screen and never
    // activates (owner focus-steal fix). The throttling flags keep rAF hot.
    // Let the initial fit/acquire settle (tiered builds N downscaled
    // bitmaps at load).
    await page.waitForTimeout(2500)
    const gl = await page.textContent('#gl')
    console.error(`[${mode} ${count}] GL: ${gl}`)
    await page.click('#run')
    await page.waitForFunction(
      () => document.getElementById('copy')?.disabled === false,
      null,
      { timeout: 60000 },
    )
    const json = await page.inputValue('#json')
    const parsed = JSON.parse(json)
    // Record load average beside every row (coordinator note): sibling
    // agents building/testing on this box suppress fps/frame-time. Memory
    // metrics (peakResidentBytes, tierHistogram) are load-insensitive.
    const load = os.loadavg() // [1m, 5m, 15m]
    parsed.loadavg = { '1m': load[0], '5m': load[1], '15m': load[2], cores: os.cpus().length }
    results.push(parsed)
    const t = parsed.tiering
    const h = t.tierHistogram
    console.error(
      `[${mode} ${count}] loadavg ${load[0].toFixed(1)} · mean ${parsed.sweep.meanFps}fps · p95 ${parsed.sweep.p95Ms}ms · ` +
        `peakResident ${fmtGB(t.peakResidentBytes)} · swaps ${t.swapCount} · ` +
        `worst ${t.swapWorstMs}ms · tiers full/${h.full} 1024/${h['1024']} 512/${h['512']} 256/${h['256']}`,
    )
    await page.close()
  }
}

await browser.close()

// Full JSON array on stdout for the report.
console.log(JSON.stringify(results, null, 2))
