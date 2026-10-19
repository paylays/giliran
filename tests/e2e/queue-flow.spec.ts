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

// Propagation budget from the plan: a staff action shows on TV and phone within 2 s.
const SYNC = { timeout: 2_000 };

test('staff call reaches the display and the visitor within 2 s', async ({ browser, seeded }) => {
  void seeded;
  const visitor = await newPage(browser, VISITOR_VIEWPORT);
  const staff = await newPage(browser, STAFF_VIEWPORT);
  const tv = await newPage(browser, TV_VIEWPORT);

  await openDisplay(tv.page);
  await expect(counterPlate(tv.page, COUNTER.name)).toContainText(copy.display.counterNoTicket);

  await takeNumber(visitor.page);
  await expect(visitor.page.getByText('A001').first()).toBeVisible();
  await expect(visitor.page.getByText(copy.status.waiting)).toBeVisible();
  await expect(visitor.page.getByText(copy.ticket.frontTitle)).toBeVisible();

  await openStaffPanel(staff.page);
  await expect(staff.page.getByText(copy.staff.waitingForCounter(1))).toBeVisible();
  await staff.page.getByRole('button', { name: copy.staff.callNext }).click();
  await expect(staff.page.getByText(copy.staff.resultCalled('A001', COUNTER.name))).toBeVisible();

  // Display: right number at the right counter, in the plate and in the focal field.
  await expect(counterPlate(tv.page, COUNTER.name)).toContainText('A001', SYNC);
  const field = tv.page.locator('section').filter({ hasText: copy.display.latestLabel });
  await expect(field).toContainText('A001', SYNC);
  await expect(field).toContainText(COUNTER.name, SYNC);

  // Visitor: full-screen called message with the counter name, then the inline state after dismissing it.
  const overlay = visitor.page.getByRole('alertdialog', { name: copy.ticket.calledTitle });
  await expect(overlay).toBeVisible(SYNC);
  await expect(overlay).toContainText('A001');
  await expect(overlay).toContainText(COUNTER.name);
  await overlay.getByRole('button', { name: copy.ticket.dismissCalled }).click();
  await expect(visitor.page.getByRole('heading', { name: copy.ticket.calledInlineTitle(COUNTER.name) })).toBeVisible();
  await expect(visitor.page.getByText(copy.status.called, { exact: true })).toBeVisible();

  await Promise.all([visitor, staff, tv].map((c) => c.context.close()));
});

test('recall, skip and done show on display and visitor pages', async ({ browser, seeded }) => {
  void seeded;
  const first = await newPage(browser, VISITOR_VIEWPORT);
  const second = await newPage(browser, VISITOR_VIEWPORT);
  const staff = await newPage(browser, STAFF_VIEWPORT);
  const tv = await newPage(browser, TV_VIEWPORT);
  const plate = counterPlate(tv.page, COUNTER.name);

  await openDisplay(tv.page);
  await takeNumber(first.page);
  await takeNumber(second.page);
  await openStaffPanel(staff.page);
  await expect(staff.page.getByText(copy.staff.waitingForCounter(2))).toBeVisible();

  // Call A001.
  await staff.page.getByRole('button', { name: copy.staff.callNext }).click();
  await expect(plate).toContainText('A001', SYNC);
  await expect(first.page.getByRole('alertdialog', { name: copy.ticket.calledTitle })).toBeVisible(SYNC);

  // Recall: the visitor gets the "called again" message with call count 2.
  await staff.page.getByRole('button', { name: copy.staff.recall, exact: true }).click();
  await expect(staff.page.getByText(copy.staff.resultRecalled('A001', 2))).toBeVisible();
  const recalled = first.page.getByRole('alertdialog', { name: copy.ticket.recalledTitle });
  await expect(recalled).toBeVisible(SYNC);
  await expect(recalled).toContainText(copy.ticket.callCount(2));
  await expect(plate).toContainText('A001');

  // Skip needs the confirm dialog. Cancel first: nothing changes.
  await staff.page.getByRole('button', { name: copy.staff.skip, exact: true }).click();
  const confirm = staff.page.getByRole('dialog', { name: copy.staff.skipConfirmTitle('A001') });
  await expect(confirm).toBeVisible();
  await confirm.getByRole('button', { name: copy.common.cancel }).click();
  await expect(confirm).toBeHidden();
  await expect(plate).toContainText('A001');

  await staff.page.getByRole('button', { name: copy.staff.skip, exact: true }).click();
  await staff.page.getByRole('button', { name: copy.staff.skipConfirmButton('A001') }).click();
  await expect(staff.page.getByText(copy.staff.resultSkipped('A001'))).toBeVisible();
  await expect(first.page.getByRole('heading', { name: copy.ticket.skippedTitle })).toBeVisible(SYNC);
  await expect(plate).not.toContainText('A001', SYNC);
  await expect(plate).toContainText(copy.display.counterNoTicket);

  // Next number, then Done.
  await staff.page.getByRole('button', { name: copy.staff.callNext }).click();
  await expect(plate).toContainText('A002', SYNC);
  await expect(second.page.getByRole('alertdialog', { name: copy.ticket.calledTitle })).toBeVisible(SYNC);

  await staff.page.getByRole('button', { name: copy.staff.done, exact: true }).click();
  await expect(staff.page.getByText(copy.staff.resultDone('A002'))).toBeVisible();
  await expect(second.page.getByRole('heading', { name: copy.ticket.doneTitle })).toBeVisible(SYNC);
  await expect(plate).not.toContainText('A002', SYNC);
  await expect(plate).toContainText(copy.display.counterNoTicket);

  await Promise.all([first, second, staff, tv].map((c) => c.context.close()));
});
