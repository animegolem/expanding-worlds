// AI-IMP-217 throwaway driver: launches REAL Google Chrome (headed,
// hardware GPU — never headless SwiftShader, per the EPIC-004 rule),
// runs the 30s sweep, and prints the JSON summary. Safari cannot be
// driven this way without `safaridriver --enable` (admin auth), so the
// Safari cell is a manual PENDING-OWNER pass — see the spike report.
//
//   node drive.mjs http://localhost:5199 [imageCount]
//
import { chromium } from 'playwright-core'

const url = process.argv[2] ?? 'http://localhost:5199'
const count = process.argv[3]

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false, // headed → real Metal/ANGLE GPU, not SwiftShader
  args: [
    // A backgrounded Chrome throttles rAF to ~1Hz, which starves the
    // ticker and voids the sweep — keep it rendering at full rate.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion',
  ],
})
// deviceScaleFactor 2 = the M1 Pro's built-in Retina display (4× the
// fragments of DPR 1) — the realistic desktop case.
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
})
await page.goto(url, { waitUntil: 'networkidle' })
await page.bringToFront()

if (count) {
  await page.fill('#count', String(count))
  await page.click('#rebuild')
  await page.waitForTimeout(1500)
}

const gl = await page.textContent('#gl')
console.error(`GL renderer: ${gl}`)

await page.click('#run')
// 30s sweep + build/settle margin.
await page.waitForFunction(() => document.getElementById('copy')?.disabled === false, null, {
  timeout: 45000,
})
const json = await page.inputValue('#json')
console.log(json)

await browser.close()
