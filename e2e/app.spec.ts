import { expect, test } from '@playwright/test'

test.describe('FlirtGPT', () => {
  test('loads and shows the signed-in chat surface', async ({ page }) => {
    await page.goto('/')

    // The app should render the brand and the composer once the dev user is
    // recognized (loopback origin, no client ID configured).
    await page.waitForSelector('text=FlirtGPT', { timeout: 10_000 })

    // The empty-state prompt should be visible when there is no chat yet.
    await expect(page.getByRole('heading', { name: /what are we talking about/i })).toBeVisible()
  })

  test('sends a message and shows a reply error when no API key is set', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=FlirtGPT', { timeout: 10_000 })

    // Pick one of the empty-state suggestions so we do not have to type.
    await page.getByRole('button', { name: /flirt a little and tell me a clever compliment/i }).first().click()

    // The composer should now contain the suggestion text.
    const composer = page.locator('textarea[aria-label="Message"]')
    await composer.waitFor({ state: 'attached', timeout: 5_000 })
    await expect(composer).toHaveValue(/flirt a little/i)

    // Send it.
    await page.getByRole('button', { name: 'Send' }).click()

    // Without a Groq key the server returns a clear "not configured" error, and
    // the UI shows that error under the last assistant message.
    await page.waitForFunction(
      () => {
        const el = document.querySelector('[class*="text-danger"]')
        return el && el.textContent?.includes('Groq API key')
      },
      { timeout: 15_000 },
    )
  })

  test('the model picker lists the configured models', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('text=FlirtGPT', { timeout: 10_000 })

    await page.getByRole('button', { name: /gpt oss 20b/i }).click()
    await expect(page.getByText('Llama 4 Scout')).toBeVisible()
  })
})
