import { test, expect } from '@playwright/test'

// Primo giro di test automatici per NutriPlan-Pro (prima non ne esisteva
// nessuno — 51 pagine HTML senza copertura). Scope deliberatamente limitato
// a quanto è raggiungibile SENZA un account reale: login/validazione client,
// redirect di autenticazione, pagine pubbliche. Non è copertura completa —
// nessuno dei 30+ bug trovati nella sessione di bug-hunting del 2026-09-14
// sarebbe stato di per sé intercettato da questi soli test, ma è un punto di
// partenza reale su cui costruire (vedi anche scripts/check-sql-risks.js per
// il lato migrazioni SQL, non copribile da e2e).

test.describe('Login page', () => {
  test('loads with the dev notice and both login/demo entry points', async ({ page }) => {
    await page.goto('/index.html')
    await expect(page.locator('.logo h1')).toHaveText('DietPlan Pro')
    await expect(page.locator('#dev-notice')).toBeVisible()
    await expect(page.locator('button[onclick="mostraLogin()"]')).toBeVisible()
    await expect(page.locator('#demo-login-btn')).toBeVisible()
  })

  test('"Accedi" reveals the login form and hides the dev notice', async ({ page }) => {
    await page.goto('/index.html')
    await page.locator('button[onclick="mostraLogin()"]').click()
    await expect(page.locator('#auth-box')).toBeVisible()
    await expect(page.locator('#dev-notice')).toBeHidden()
    await expect(page.locator('#login-email')).toBeVisible()
  })

  test('submitting the login form with empty fields shows a client-side error, no network round-trip', async ({ page }) => {
    await page.goto('/index.html')
    await page.locator('button[onclick="mostraLogin()"]').click()
    await page.locator('#login-btn').click()
    await expect(page.locator('#login-err')).toHaveClass(/show/)
    await expect(page.locator('#login-err')).not.toBeEmpty()
  })

  test('submitting the login form with wrong credentials shows an auth error from Supabase', async ({ page }) => {
    await page.goto('/index.html')
    await page.locator('button[onclick="mostraLogin()"]').click()
    await page.locator('#login-email').fill('non-esiste-davvero@example.com')
    await page.locator('#login-pw').fill('password-sicuramente-sbagliata')
    await page.locator('#login-btn').click()
    await expect(page.locator('#login-err')).toHaveClass(/show/, { timeout: 10_000 })
  })
})

test.describe('Auth redirect', () => {
  test('an unauthenticated visit to a protected page redirects back to the login page', async ({ page }) => {
    await page.goto('/pazienti.html')
    await page.waitForURL(/index\.html/, { timeout: 10_000 })
  })
})

test.describe('Public pages', () => {
  for (const path of ['/privacy.html', '/termini.html']) {
    test(`${path} loads without a client-side error`, async ({ page }) => {
      const errors = []
      page.on('pageerror', err => errors.push(err.message))
      const response = await page.goto(path)
      expect(response.ok()).toBeTruthy()
      expect(errors).toEqual([])
    })
  }
})
