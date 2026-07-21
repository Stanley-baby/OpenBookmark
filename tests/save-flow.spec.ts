import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve('.output/chrome-mv3');
let fixtureServer: Server;
let fixtureUrl: string;

test.beforeAll(async () => {
  fixtureServer = createServer((_, response) => {
    response.setHeader('Content-Type', 'text/html');
    response.end('<!doctype html><title>Offline fixture</title><h1>Fixture page</h1>');
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  const address = fixtureServer.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not start');
  fixtureUrl = `http://127.0.0.1:${address.port}/bookmark`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve, reject) => fixtureServer.close((error) => error ? reject(error) : resolve()));
});

async function launch(profile: string) {
  return chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
}

async function getExtensionId(context: BrowserContext) {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
  return new URL(worker.url()).host;
}

test('save is visible in Manager and survives a browser restart', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = await getExtensionId(context);
    const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8')) as { action?: { default_popup?: string } };
    expect(manifest.action?.default_popup).toBe('popup.html');
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);
    await expect(manager.getByText('No bookmarks yet.')).toBeVisible();

    const fixture = await context.newPage();
    await fixture.goto(fixtureUrl);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();

    await expect(popup.getByLabel('Title')).toHaveValue('Offline fixture');
    await expect(popup.getByLabel('URL')).toHaveValue(fixtureUrl);
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(popup.getByRole('status')).toHaveText('Saved');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    await expect(manager.getByRole('link', { name: 'Offline fixture' })).toBeVisible();
    await expect(manager.getByText(fixtureUrl)).toBeVisible();
    await expect(manager.locator('time')).toContainText('Saved');
    await expect(manager.getByRole('listitem')).toHaveCount(1);
    await context.close();
    context = undefined;

    context = await launch(profile);
    const reopenedManager = await context.newPage();
    await reopenedManager.goto(`chrome-extension://${extensionId}/manager.html`);
    await expect(reopenedManager.getByRole('link', { name: 'Offline fixture' })).toBeVisible();
    await expect(reopenedManager.getByText(fixtureUrl)).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
