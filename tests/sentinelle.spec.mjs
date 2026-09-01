import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../index.html', import.meta.url));

/** Navigate to the app and collect anything the page logs as an error. */
async function openApp(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`file://${APP}`);
  await page.waitForSelector('.sn-hero');
  return errors;
}

/** Arming normally runs a 10s exit delay; shorten it so tests stay fast. */
async function setExitDelay(page, seconds) {
  await page.evaluate((s) => { window.Support.EXIT_DELAY = s; }, seconds);
}

/* Select chrome by data attribute: the Activity tab's label picks up the
   unseen-event badge, so matching on text is not stable. */
const mode = (page, id) => page.locator(`.sn-mode[data-mode="${id}"]`);
const tab = (page, id) => page.locator(`.sn-tab[data-tab="${id}"]`);
const sensorRow = (page, name) => page.locator('.sn-row', { hasText: name });

test.describe('Sentinelle', () => {
  test('loads the disarmed home screen without console errors', async ({ page }) => {
    const errors = await openApp(page);

    await expect(page.locator('.sn-header__title')).toHaveText('Sentinelle');
    await expect(page.locator('.sn-hero__label')).toHaveText('Disarmed');
    await expect(page.locator('.sn-hero__sub')).toHaveText('All sensors resting');
    await expect(page.locator('.sn-hero')).toHaveClass(/sn-hero--disarmed/);
    await expect(page.locator('.sn-list .sn-row')).toHaveCount(6);

    expect(errors).toEqual([]);
  });

  test('every tab renders its own content', async ({ page }) => {
    const errors = await openApp(page);

    await tab(page, 'cameras').click();
    await expect(page.locator('.sn-cam')).toHaveCount(4);
    await expect(page.locator('.sn-cam__live')).toHaveCount(3);

    await tab(page, 'events').click();
    await expect(page.locator('.sn-event')).toHaveCount(5);

    await tab(page, 'settings').click();
    await expect(page.locator('.sn-set__row')).toHaveCount(6);

    await tab(page, 'home').click();
    await expect(page.locator('.sn-hero')).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('arming runs an exit delay that can be cancelled', async ({ page }) => {
    await openApp(page);
    await setExitDelay(page, 5);

    await mode(page, 'away').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Arming…');
    await expect(page.locator('.sn-hero__count')).toBeVisible();

    /* The countdown must actually run down, not just render once. */
    await expect(page.locator('.sn-hero__count')).toHaveText('5s');
    await expect(page.locator('.sn-hero__count')).toHaveText('3s', { timeout: 4000 });

    await page.locator('.sn-hero__actions .n-btn', { hasText: 'Cancel' }).click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Disarmed');
    await expect(page.locator('.sn-hero__count')).toHaveCount(0);
  });

  test('arming completes and reports the active mode', async ({ page }) => {
    await openApp(page);
    await setExitDelay(page, 1);

    await mode(page, 'away').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Armed', { timeout: 5000 });
    await expect(page.locator('.sn-hero__sub')).toHaveText('All zones active');

    await tab(page, 'events').click();
    await expect(page.locator('.sn-event__text').first()).toHaveText('Armed — Away');
  });

  test('tripping an armed sensor raises the alarm', async ({ page }) => {
    await openApp(page);
    await setExitDelay(page, 1);

    await mode(page, 'away').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Armed', { timeout: 5000 });

    await sensorRow(page, 'Front Door').click();

    await expect(page.locator('.sn-hero__label')).toHaveText('Alarm');
    await expect(page.locator('.sn-hero')).toHaveClass(/sn-hero--alarm/);
    await expect(sensorRow(page, 'Front Door')).toHaveClass(/sn-row--breach/);

    await tab(page, 'events').click();
    await expect(page.locator('.sn-event__text').first())
      .toHaveText('Breach — Front Door (Entry)');
  });

  test('dismissing the alarm disarms the system', async ({ page }) => {
    await openApp(page);
    await setExitDelay(page, 1);

    await mode(page, 'away').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Armed', { timeout: 5000 });
    await sensorRow(page, 'Front Door').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Alarm');

    await page.locator('.sn-hero__actions .n-btn', { hasText: 'Dismiss' }).click();

    await expect(page.locator('.sn-hero__label')).toHaveText('Disarmed');
    await expect(mode(page, 'off')).toHaveAttribute('aria-pressed', 'true');
  });

  /* The point of Home mode: you are inside, so interior motion must not
     trigger, while the perimeter stays live. */
  test('Home mode ignores interior motion but still arms the perimeter', async ({ page }) => {
    await openApp(page);
    await setExitDelay(page, 1);

    await mode(page, 'home').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Armed', { timeout: 5000 });
    await expect(page.locator('.sn-hero__sub'))
      .toHaveText('Perimeter active · interior ignored');
    await expect(sensorRow(page, 'Living Room')).toContainText('ignored in Home');

    await sensorRow(page, 'Living Room').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Armed');

    await sensorRow(page, 'Front Door').click();
    await expect(page.locator('.sn-hero__label')).toHaveText('Alarm');
  });

  /* Smoke is life-safety: it does not care whether the system is armed. */
  test('smoke alarms even while disarmed', async ({ page }) => {
    await openApp(page);

    await expect(page.locator('.sn-hero__label')).toHaveText('Disarmed');
    await sensorRow(page, 'Kitchen Smoke').click();

    await expect(page.locator('.sn-hero__label')).toHaveText('Alarm');
    await tab(page, 'events').click();
    await expect(page.locator('.sn-event__text').first())
      .toHaveText('Smoke detected — Kitchen Smoke');
  });

  test('the activity tab badges unseen events and clears on view', async ({ page }) => {
    await openApp(page);

    await expect(page.locator('.sn-tab__badge')).toHaveCount(0);

    await sensorRow(page, 'Garage Door').click();
    await expect(page.locator('.sn-tab__badge')).toHaveText('1');

    await tab(page, 'events').click();
    await expect(page.locator('.sn-tab__badge')).toHaveCount(0);
  });
});
