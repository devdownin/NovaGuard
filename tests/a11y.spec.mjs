import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../index.html', import.meta.url));

async function openApp(page) {
  await page.goto(`file://${APP}`);
  await page.waitForSelector('.sn-hero');
}

/** Report violations with their nodes, so a failure says what to fix. */
function describe(violations) {
  return violations.map((v) =>
    `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes.map((n) => n.target.join(' ')).join('\n    ')}`
  ).join('\n');
}

async function scan(page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  return violations;
}

const TABS = ['home', 'cameras', 'events', 'settings'];

for (const tab of TABS) {
  test(`${tab} tab has no accessibility violations`, async ({ page }) => {
    await openApp(page);
    await page.locator(`.sn-tab[data-tab="${tab}"]`).click();
    await page.waitForTimeout(100);

    const violations = await scan(page);
    expect(describe(violations)).toBe('');
  });
}

/* The alarm is the state that matters most and the one least likely to be
   checked by hand. */
test('the alarm state has no accessibility violations', async ({ page }) => {
  await openApp(page);
  await page.locator('.sn-row[data-sensor="s6"]').click();
  await expect(page.locator('.sn-hero__label')).toHaveText('Alarm');

  const violations = await scan(page);
  expect(describe(violations)).toBe('');
});

test('a state change is announced to assistive technology', async ({ page }) => {
  await openApp(page);

  const live = page.locator('[role="status"][aria-live="assertive"]');
  await expect(live).toHaveCount(1);
  await expect(live).toHaveText('System disarmed.');

  await page.locator('.sn-row[data-sensor="s6"]').click();
  await expect(live).toContainText('Alarm.');
});

test('the tab bar is operable by keyboard', async ({ page }) => {
  await openApp(page);

  /* Roving tabindex: the tablist is a single tab stop. */
  await expect(page.locator('.sn-tab[tabindex="0"]')).toHaveCount(1);

  await page.locator('.sn-tab[data-tab="home"]').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('.sn-tab[data-tab="cameras"]')).toBeFocused();
  await expect(page.locator('.sn-cam')).toHaveCount(4);

  await page.keyboard.press('End');
  await expect(page.locator('.sn-tab[data-tab="settings"]')).toBeFocused();
  await expect(page.locator('.sn-set__row')).toHaveCount(6);
});

test('settings rows are real buttons, not divs with a role', async ({ page }) => {
  await openApp(page);
  await page.locator('.sn-tab[data-tab="settings"]').click();

  const row = page.locator('.sn-set__row').first();
  await expect(row).toHaveJSProperty('tagName', 'BUTTON');

  await row.focus();
  await expect(row).toBeFocused();
});

test('focus survives a re-render', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { window.Support.EXIT_DELAY = 1; });

  const away = page.locator('.sn-mode[data-mode="away"]');
  await away.focus();
  await away.press('Enter');

  /* Arming re-renders the whole panel; focus must not fall to <body>. */
  await expect(away).toBeFocused();
});
