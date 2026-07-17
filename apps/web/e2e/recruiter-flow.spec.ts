import { expect, test } from '@playwright/test'

test('completes the server-backed recruiter workflow', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('Interactive portfolio demo')).toBeVisible()

  await page.getByRole('button', { name: 'Open form builder' }).click()
  await page.getByLabel('Field label').fill('Expense details for the recruiter demo')
  await page.getByRole('button', { name: 'Publish version' }).click()
  await expect(page.getByRole('button', { name: 'Version published' })).toBeVisible()

  await page.getByRole('button', { name: 'Submission', exact: true }).first().click()
  await page.getByRole('button', { name: 'Continue' }).click()
  const reviewHeading = page.getByRole('heading', { name: 'Review and collaboration' })
  const submitButton = page.getByRole('button', { name: 'Submit request' })
  await expect(submitButton.or(reviewHeading)).toBeVisible()
  if (await submitButton.isVisible()) await submitButton.click()
  await expect(reviewHeading).toBeVisible()

  const role = page.getByLabel('Viewing as')
  await role.selectOption('reviewer')
  await page.getByRole('button', { name: 'Request clarification' }).click()
  await expect(page.getByText('Clarification needed')).toBeVisible()

  await role.selectOption('applicant')
  await page.getByRole('button', { name: 'Reply and resubmit' }).click()

  await role.selectOption('reviewer')
  await page.getByRole('button', { name: 'Approve operations review' }).click()

  await role.selectOption('management')
  await page.getByRole('button', { name: 'Approve as management' }).click()
  await expect(page.getByText('This request has completed the approval workflow')).toBeVisible()
  await expect(page.locator('.status-pill')).toHaveText('Approved')
})
