import { copy } from '../../src/web/content/copy.ts';
import { ADMIN } from './server.ts';
import { VISITOR_VIEWPORT, expect, login, newPage, test } from './fixtures.ts';

test('admin signs in, creates a service and a counter, and the service shows on /take', async ({ browser, server }) => {
  void server;
  const admin = await newPage(browser, { width: 1280, height: 800 });
  const visitor = await newPage(browser, VISITOR_VIEWPORT);
  const { page } = admin;
  const serviceName = 'Kasir';

  await login(page, ADMIN);
  await page.goto('/admin/services');
  await expect(page.getByText(copy.admin.services.empty)).toBeVisible();

  // Service.
  await page.getByRole('button', { name: copy.admin.services.add }).click();
  const serviceDialog = page.getByRole('dialog', { name: copy.admin.services.addTitle });
  await serviceDialog.getByLabel(copy.admin.services.name).fill(serviceName);
  await serviceDialog.getByLabel(copy.admin.services.prefix).fill('K');
  await serviceDialog.getByRole('button', { name: copy.admin.services.submit }).click();
  await expect(serviceDialog).toBeHidden();
  await expect(page.getByRole('cell', { name: serviceName, exact: true })).toBeVisible();

  // Counter serving that service.
  await page.getByRole('link', { name: copy.admin.nav.counters, exact: true }).click();
  await page.getByRole('button', { name: copy.admin.counters.add }).click();
  const counterDialog = page.getByRole('dialog', { name: copy.admin.counters.addTitle });
  await counterDialog.getByLabel(copy.admin.counters.name).fill('Loket Kasir');
  await counterDialog.getByLabel(serviceName).check();
  await counterDialog.getByRole('button', { name: copy.admin.counters.submit }).click();
  await expect(counterDialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Loket Kasir', exact: true })).toBeVisible();
  await expect(page.getByRole('cell', { name: serviceName, exact: true })).toBeVisible();

  // The visitor sees the new service and its first number prefix.
  await visitor.page.goto('/take');
  await expect(visitor.page.getByRole('button', { name: copy.take.takeLabel(serviceName) })).toBeVisible();
  await expect(visitor.page.getByText('K', { exact: true })).toBeVisible();

  await Promise.all([admin, visitor].map((c) => c.context.close()));
});
