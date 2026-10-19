import { test as base, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { copy } from '../../src/web/content/copy.ts';
import { ADMIN, Api, ORIGIN, STAFF, ServerHandle } from './server.ts';

export const SERVICE = { name: 'Pendaftaran', prefix: 'A' };
export const COUNTER = { name: 'Loket 1' };

interface World {
  server: ServerHandle;
  /** Admin, one service (A), one counter serving it, one staff account. */
  seeded: { serviceId: number; counterId: number };
}

export const test = base.extend<World>({
  // Fresh database and server for every test, so ticket numbers always start at A001.
  // eslint-disable-next-line no-empty-pattern
  server: async ({}, use) => {
    const server = new ServerHandle();
    server.resetDatabase();
    await server.createAdmin();
    await server.start();
    try {
      await use(server);
    } finally {
      await server.stop();
    }
  },
  seeded: async ({ server }, use) => {
    void server;
    const api = new Api();
    await api.login(ADMIN.username, ADMIN.password);
    const service = await api.request<{ id: number }>('POST', '/api/admin/services', SERVICE);
    const counter = await api.request<{ id: number }>('POST', '/api/admin/counters', {
      name: COUNTER.name,
      serviceIds: [service.id],
    });
    await api.request('POST', '/api/admin/users', { ...STAFF, role: 'staff' });
    await use({ serviceId: service.id, counterId: counter.id });
  },
});

export { expect };

export const VISITOR_VIEWPORT = { width: 360, height: 780 };
export const TV_VIEWPORT = { width: 1920, height: 1080 };
export const STAFF_VIEWPORT = { width: 1280, height: 800 };

export async function newPage(
  browser: Browser,
  viewport: { width: number; height: number },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ viewport, baseURL: ORIGIN, locale: 'id-ID' });
  return { context, page: await context.newPage() };
}

/** Visitor takes a number for the service and lands on the ticket page. */
export async function takeNumber(page: Page, serviceName = SERVICE.name): Promise<void> {
  await page.goto('/take');
  await page.getByRole('button', { name: copy.take.takeLabel(serviceName) }).click();
  await expect(page).toHaveURL(/\/ticket\//);
}

/** Opens the TV page and presses Start, which unlocks audio. */
export async function openDisplay(page: Page): Promise<void> {
  await page.goto('/display');
  await page.getByRole('button', { name: copy.display.startButton }).click();
  await expect(page.getByRole('dialog', { name: copy.display.startTitle })).toBeHidden();
}

export async function login(page: Page, user: { username: string; password: string }): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(copy.login.username).fill(user.username);
  await page.getByLabel(copy.login.password, { exact: true }).fill(user.password);
  await page.getByRole('button', { name: copy.login.submit }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

/** Staff logs in and picks the counter. */
export async function openStaffPanel(page: Page, counterName = COUNTER.name): Promise<void> {
  await login(page, STAFF);
  await expect(page).toHaveURL(/\/staff/);
  await page.getByRole('button', { name: copy.staff.pickButton(counterName) }).click();
  await expect(page.getByRole('heading', { name: copy.staff.counterHeading(counterName) })).toBeVisible();
}

/** The TV plate for one counter. */
export function counterPlate(display: Page, counterName: string) {
  // The recent-calls list also names counters, so scope to the counters section.
  const section = display
    .locator('section')
    .filter({ has: display.getByRole('heading', { name: copy.display.countersHeading, exact: true }) });
  return section.getByRole('listitem').filter({ hasText: counterName });
}
