import { expect, test } from '@playwright/test'

const errors: string[] = []

test.beforeEach(({ page }) => {
  errors.length = 0
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`))
})

test.afterEach(() => {
  // Fail loudly on uncaught client exceptions — zero-bug bar.
  expect(errors, `uncaught client errors:\n${errors.join('\n')}`).toEqual([])
})

test('landing / plan wizard renders with no crash', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Essentials/ }).first()).toBeVisible()
  await expect(page).toHaveTitle(/KenyaTrace/i)
})

test('essentials page: safety, park fees, swahili, m-pesa all functional', async ({ page }) => {
  await page.goto('/essentials', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: /Safety, Swahili/i })).toBeVisible()

  // Safety centre
  await expect(page.getByText('Safety centre')).toBeVisible()
  await expect(page.getByRole('link', { name: /National Emergency/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Copy SOS message/ })).toBeVisible()

  // Park-fee estimator reacts to residency change (Base UI select renders a listbox popup)
  const estimate = page.getByTestId('park-estimate')
  await expect(estimate).toBeVisible()
  await expect(estimate).toContainText(/USD/)
  await page.getByLabel('Residency').click()
  const citizen = page.getByText('Citizen', { exact: true }).last()
  await expect(citizen).toBeVisible({ timeout: 15_000 })
  await citizen.click()
  await expect(estimate).toContainText(/KSh/, { timeout: 10_000 })

  // Swahili kit search narrows results
  await expect(page.getByText('Swahili survival kit')).toBeVisible()
  await page.getByLabel('Search phrases').fill('M-Pesa')
  await expect(page.getByRole('button', { name: /Lipa na M-Pesa/ })).toBeVisible()
  await page.getByLabel('Search phrases').fill('xyznothinghere')
  await expect(page.getByText(/No phrases match/)).toBeVisible()
  await page.getByLabel('Search phrases').fill('')

  // M-Pesa + vault
  await expect(page.getByText('M-Pesa guide + offline vault')).toBeVisible()
  await expect(page.getByRole('link', { name: /Open M-Pesa/ })).toHaveAttribute('href', /tel:/)
  await expect(page.getByRole('button', { name: /Download GPX/ })).toBeVisible()
})

test('core routes return content, not 500s', async ({ page }) => {
  for (const path of ['/trips', '/moments', '/profile', '/discover/stays', '/privacy', '/terms']) {
    await test.step(`route ${path}`, async () => {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded' })
      expect(res?.status(), path).toBeLessThan(500)
      // Authed routes may land on Clerk sign-in (outside the app shell, so no
      // <main>); public ones render shell content — either is fine, never a crash.
      await expect(page.locator('body')).toContainText(/\S/, { timeout: 15_000 })
    })
  }
})

test('seo + 404 surfaces', async ({ page }) => {
  const robots = await page.request.get('/robots.txt')
  expect(robots.status()).toBeLessThan(500)
  const sitemap = await page.request.get('/sitemap.xml')
  expect(sitemap.status()).toBeLessThan(500)

  await page.goto('/this-route-does-not-exist-xyz', { waitUntil: 'domcontentloaded' })
  await expect(page.getByText(/This trail ends here|could not be found/i).first()).toBeVisible()
})

test('planner API validates bad input (no crash, no 500)', async ({ request }) => {
  const res = await request.post('/api/plan', { data: { origin: '', budget: -5 } })
  expect([400, 422, 429]).toContain(res.status())
})
