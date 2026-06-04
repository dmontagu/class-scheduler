// Drives the REAL WebKit (Safari) engine through the flow and reports the exact
// filename the browser assigns to the download (download.suggestedFilename()).
// Usage: node scripts/verify-download.mjs   (dev server must be running on :5174)
import { fileURLToPath } from 'node:url'

import { webkit } from 'playwright'

const good = fileURLToPath(
  new URL('../../.playwright-mcp/fixtures/cjai-good.xlsx', import.meta.url),
)
const out = fileURLToPath(new URL('../../.playwright-mcp/webkit-download.xlsx', import.meta.url))

const browser = await webkit.launch()
const ctx = await browser.newContext({ acceptDownloads: true })
const page = await ctx.newPage()
await page.goto('http://localhost:5174/')
await page.setInputFiles('input[type=file]', good)
await page.getByRole('button', { name: /Generate schedule/i }).click()
const [download] = await Promise.all([
  page.waitForEvent('download'),
  page.getByRole('button', { name: /Download schedule/i }).click(),
])
console.log('WebKit/Safari suggestedFilename ->', download.suggestedFilename())
await download.saveAs(out)
console.log('saved to', out)
await browser.close()
