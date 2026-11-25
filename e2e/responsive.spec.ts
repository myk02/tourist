import { expect, test } from '@playwright/test'

const viewports = [
  { name: 'small mobile', width: 320, height: 740 },
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 834, height: 1112 },
  { name: 'tablet landscape', width: 1024, height: 900 },
  { name: 'compact desktop', width: 1280, height: 900 },
  { name: 'desktop', width: 1440, height: 900 },
]

for (const viewport of viewports) {
  test(`shell fits ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/', { waitUntil: 'load' })
    const mobileNav = page.locator('nav[aria-label="Mobile navigation"]')
    const desktopNav = page.locator('nav[aria-label="Main navigation"]')
    await expect(mobileNav).toHaveCount(1)
    await expect(desktopNav).toHaveCount(1)

    const widths = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(widths.document, `horizontal overflow at ${viewport.width}px`).toBeLessThanOrEqual(widths.viewport)

    if (viewport.width < 1280) {
      await expect(mobileNav).toBeVisible()
      await expect(desktopNav).toBeHidden()
    } else {
      await expect(mobileNav).toBeHidden()
      await expect(desktopNav).toBeVisible()
    }
  })
}
