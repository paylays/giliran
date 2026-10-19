import { copy } from '../../src/web/content/copy.ts';
import {
  COUNTER,
  STAFF_VIEWPORT,
  TV_VIEWPORT,
  VISITOR_VIEWPORT,
  counterPlate,
  expect,
  newPage,
  openDisplay,
  openStaffPanel,
  takeNumber,
  test,
} from './fixtures.ts';

test('display and ticket page resync after a server restart without reloading', async ({ browser, server, seeded }) => {
  void seeded;
  const visitor = await newPage(browser, VISITOR_VIEWPORT);
  const staff = await newPage(browser, STAFF_VIEWPORT);
  const tv = await newPage(browser, TV_VIEWPORT);

  await openDisplay(tv.page);
  await takeNumber(visitor.page);
  await openStaffPanel(staff.page);
  await expect(visitor.page.getByText(copy.ticket.frontTitle)).toBeVisible();

  // Mark the documents so a reload would be detected later.
  await tv.page.evaluate(() => ((window as unknown as { __keep: boolean }).__keep = true));
  await visitor.page.evaluate(() => ((window as unknown as { __keep: boolean }).__keep = true));

  await server.stop();

  // The client shows the reconnecting state after 3 s without a connection.
  await expect(visitor.page.getByText(copy.connection.reconnectingTitle, { exact: true })).toBeVisible({ timeout: 10_000 });
  await expect(tv.page.getByText(copy.connection.reconnectingTitle)).toBeVisible({ timeout: 10_000 });

  await server.start();

  // Both pages reconnect on their own and show the live state again.
  await expect(visitor.page.getByText(copy.connection.reconnectingTitle, { exact: true })).toBeHidden({ timeout: 20_000 });
  await expect(tv.page.getByText(copy.connection.reconnectingTitle)).toBeHidden({ timeout: 20_000 });
  await expect(tv.page.getByText(copy.connection.connected)).toBeVisible();

  // The restarted server keeps the data (SQLite) and the pages receive new changes: the call made now arrives.
  await staff.page.getByRole('button', { name: copy.staff.callNext }).click();
  await expect(staff.page.getByText(copy.staff.resultCalled('A001', COUNTER.name))).toBeVisible();
  await expect(counterPlate(tv.page, COUNTER.name)).toContainText('A001', { timeout: 5_000 });
  const overlay = visitor.page.getByRole('alertdialog', { name: copy.ticket.calledTitle });
  await expect(overlay).toBeVisible({ timeout: 5_000 });
  await expect(overlay).toContainText(COUNTER.name);

  const kept = async (page: typeof tv.page) =>
    page.evaluate(() => (window as unknown as { __keep?: boolean }).__keep === true);
  expect(await kept(tv.page)).toBe(true);
  expect(await kept(visitor.page)).toBe(true);

  await Promise.all([visitor, staff, tv].map((c) => c.context.close()));
});
