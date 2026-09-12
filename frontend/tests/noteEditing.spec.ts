import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = fileURLToPath(new URL('../../../../analysis_outputs/552c8d531cf8f_row_03.png', import.meta.url));
async function openEditor(page: Page, text: string) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add images', exact: true })).toBeEnabled();
  await page.getByTestId('image-input').setInputFiles(fixture);
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  const bounds = (await canvas.boundingBox())!;
  await page.mouse.move(bounds.x + 2, bounds.y + 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width - 2, bounds.y + bounds.height - 2, { steps: 10 });
  await page.mouse.up();
  await page.getByRole('textbox', { name: 'Transcription for line 1' }).fill(text);
  await expect(page.getByRole('listbox', { name: 'Notes for line 1' })).toBeVisible();
}
const editor = (page: Page) => page.getByRole('textbox', { name: 'Transcription for line 1' });
const notes = (page: Page) => page.getByRole('listbox', { name: 'Notes for line 1' }).getByRole('option');

test('context menu preserves a range; keyboard and menu assign exact subdivisions with one-step undo', async ({ page }) => {
  await openEditor(page, '#4_/// 6.// 0/ | ?');
  await notes(page).nth(0).click();
  await notes(page).nth(1).click({ modifiers: ['Shift'] });
  await notes(page).nth(0).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '2 notes selected', exact: true })).toBeVisible();
  await page.getByRole('menuitem', { name: /^Subdivision · Mixed/ }).hover();
  await page.getByRole('menuitem', { name: /No underline \(quarter\)/ }).click();
  await expect(editor(page)).toHaveValue('#4_ 6. 0/ | ?');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveValue('#4_/// 6.// 0/ | ?');
  await page.keyboard.press('r');
  await expect(page.locator('.rhythm-picker-hint')).toContainText('Press 1–4');
  await page.keyboard.press('2');
  await expect(editor(page)).toHaveValue('#4_/ 6./ 0/ | ?');
  await page.keyboard.press('r');
  await page.keyboard.press('1');
  await expect(editor(page)).toHaveValue('#4_ 6. 0/ | ?');
  await page.getByRole('button', { name: 'Subdivision for line 1' }).click();
  await expect(page.getByRole('menuitem', { name: /✓ No underline/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByText('Saved locally', { exact: true })).toBeVisible();
  await page.reload();
  await expect(editor(page)).toHaveValue('#4_ 6. 0/ | ?');
});

test('right-clicking an unselected rest selects only it and disables pitch-only attributes', async ({ page }) => {
  await openEditor(page, '1_// 2^/ 0/ ?');
  await notes(page).nth(0).click();
  await notes(page).nth(1).click({ modifiers: ['Shift'] });
  await notes(page).nth(2).click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: '1 note selected', exact: true })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /Raise octave/ })).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByRole('menuitem', { name: /^Accidental/ })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Escape');
  await expect(notes(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('listbox').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(editor(page)).toHaveValue('1_// 2^/ 0/ ?');
  await page.keyboard.press('Shift+F10');
  const keyboardMenu = page.getByRole('menu', { name: 'Note context menu', exact: true });
  await expect(keyboardMenu.getByRole('menuitem', { name: '1 note selected', exact: true })).toBeVisible();
  await keyboardMenu.getByRole('menuitem', { name: /^Subdivision right$/ }).hover();
  await page.getByRole('menuitem', { name: /Two underlines/ }).click();
  await expect(editor(page)).toHaveValue('1_// 2^/ 0// ?');
});

test('pitch corrections preserve marks, rest conversion clears pitch attributes, and insertion/edit/duplicate are undoable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openEditor(page, '#4_./ 5');
  await notes(page).nth(0).click();
  await page.keyboard.press('6');
  await expect(editor(page)).toHaveValue('#6_./ 5');
  await page.keyboard.press('0');
  await expect(editor(page)).toHaveValue('0./ 5');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveValue('#6_./ 5');
  await page.keyboard.press('Shift+Enter');
  await expect(editor(page)).toHaveValue('#6_./ ? 5');
  await page.keyboard.press('Enter');
  await page.getByRole('textbox', { name: 'Note markup', exact: true }).fill('8');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByText(/Enter exactly one valid note/)).toBeVisible();
  await page.getByRole('textbox', { name: 'Note markup', exact: true }).fill('b3_//');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(editor(page)).toHaveValue('#6_./ b3_// 5');
  await page.getByRole('button', { name: 'Note actions for line 1' }).click();
  await page.getByRole('menuitem', { name: 'Duplicate selection', exact: true }).click();
  await expect(editor(page)).toHaveValue('#6_./ b3_// b3_// 5');
  await page.keyboard.press('Backspace');
  await expect(editor(page)).toHaveValue('#6_./ b3_// 5');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(editor(page)).toHaveValue('#6_./ b3_// b3_// 5');
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(editor(page)).toHaveValue('#6_./ b3_// 5');
  expect(errors).toEqual([]);
});

test('plain text keeps native typing and invalid input; note navigation and advance are scoped to note controls', async ({ page }) => {
  await openEditor(page, '1 2 ? 4 ?');
  await editor(page).fill('r123');
  await expect(editor(page)).toHaveValue('r123');
  await expect(page.getByText(/Unsupported notation near character/)).toBeVisible();
  await editor(page).fill('1 2 ? 4 ?');
  await editor(page).click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await notes(page).nth(0).click();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(notes(page).nth(0)).toHaveAttribute('aria-selected', 'true');
  await expect(notes(page).nth(1)).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('6');
  await expect(editor(page)).toHaveValue('1 2 ? 4 ?');
  await page.keyboard.press('F8');
  await expect(notes(page).nth(2)).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('checkbox', { name: 'Advance after digit correction' }).check();
  await page.getByRole('listbox').focus();
  await page.keyboard.press('3');
  await expect(editor(page)).toHaveValue('1 2 3 4 ?');
  await expect(notes(page).nth(3)).toHaveAttribute('aria-selected', 'true');
});

test('drag range selection, mixed dots, and noncontiguous selections apply attributes only to selected notes', async ({ page }) => {
  await openEditor(page, '1. 2 3 4');
  const first = (await notes(page).nth(0).boundingBox())!;
  const third = (await notes(page).nth(2).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + third.width / 2, third.y + third.height / 2, { steps: 12 });
  await page.mouse.up();
  await expect(page.getByText('3 selected', { exact: true })).toBeVisible();
  await page.keyboard.press('.');
  await expect(editor(page)).toHaveValue('1. 2. 3. 4');
  await notes(page).nth(0).click();
  await notes(page).nth(2).click({ modifiers: ['ControlOrMeta'] });
  await page.keyboard.press('Alt+ArrowDown');
  await expect(editor(page)).toHaveValue('1_. 2. 3_. 4');
  await page.getByRole('button', { name: 'Note actions for line 1' }).click();
  await page.getByRole('menuitem', { name: /^Subdivision right$/ }).hover();
  await expect(page.getByRole('menuitem', { name: /Three underlines/ })).toBeVisible();
  await page.screenshot({ path: 'test-results/note-context-menu.png', fullPage: true, animations: 'disabled' });
});

test('the keyboard can open and navigate the menu without a prior right-click', async ({ page }) => {
  await openEditor(page, '4_// 5');
  await notes(page).nth(0).click();
  await page.keyboard.press('Shift+F10');
  const menu = page.getByRole('menu', { name: 'Note context menu', exact: true });
  await expect(menu).toBeVisible();
  await expect(menu).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu.getByRole('menuitem', { name: /Edit note markup/ })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('textbox', { name: 'Note markup', exact: true })).toHaveValue('4_//');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveValue('4_// 5');
});
