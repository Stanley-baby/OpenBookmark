import { expect, test, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve('.output/chrome-mv3');

async function launch(profile: string) {
  return chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
}

async function getExtensionWorker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

test('fixed viewport screenshots cover popup and Manager empty states without copied branding', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-ui-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const popup = await context.newPage();
    await popup.setViewportSize({ width: 420, height: 600 });
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('body')).not.toContainText(/raindrop/i);
    expect((await popup.screenshot()).byteLength).toBeGreaterThan(1_000);

    const manager = await context.newPage();
    await manager.setViewportSize({ width: 1280, height: 800 });
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);
    await expect(manager.locator('body')).not.toContainText(/raindrop/i);
    await manager.getByRole('button', { name: 'Open settings' }).click();
    await expect(manager.getByRole('heading', { name: 'Backup and restore' })).toBeVisible();
    expect((await manager.screenshot()).byteLength).toBeGreaterThan(1_000);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
