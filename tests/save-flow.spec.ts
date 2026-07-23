import { test, expect, chromium, type BrowserContext } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseBrowserBookmarksHtml } from '../lib/browser-html';

const extensionPath = path.resolve('.output/chrome-mv3');
let fixtureServer: Server;
let fixtureUrl: string;
let fixtureRequests = new Map<string, number>();

test.beforeAll(async () => {
  fixtureServer = createServer((request, response) => {
    const url = request.url ?? '/';
    fixtureRequests.set(url, (fixtureRequests.get(url) ?? 0) + 1);
    response.setHeader('Content-Type', 'text/html');
    if (url.startsWith('/metadata')) {
      response.end(`<!doctype html>
        <title>Document fallback</title>
        <meta name="twitter:title" content="Twitter title">
        <meta property="og:description" content="Open Graph description">
        <meta property="og:image" content="/cover.jpg">
        <h1>Metadata fixture</h1>`);
    } else if (url.startsWith('/slow-metadata')) {
      const timer = setTimeout(() => response.end(`<!doctype html>
        <title>Slow fallback</title>
        <meta name="twitter:title" content="Should not refresh">`), 5_000);
      request.on('close', () => clearTimeout(timer));
    } else if (url.startsWith('/missing')) {
      response.statusCode = 500;
      response.end('<!doctype html><title>Broken refresh</title>');
    } else if (url.startsWith('/empty-metadata')) {
      response.end('<!doctype html><h1>No metadata here</h1>');
    } else if (url.startsWith('/broken')) {
      response.end(`<!doctype html>
        <title>Fallback title</title>
        <script type="application/ld+json">{broken</script>
        <h1>Broken metadata fixture</h1>`);
    } else {
      response.end('<!doctype html><title>Offline fixture</title><h1>Fixture page</h1>');
    }
  });
  await new Promise<void>((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
  const address = fixtureServer.address();
  if (!address || typeof address === 'string') throw new Error('Fixture server did not start');
  fixtureUrl = `http://localhost:${address.port}/bookmark`;
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

async function getExtensionWorker(context: BrowserContext) {
  return context.serviceWorkers()[0] ?? context.waitForEvent('serviceworker');
}

test('save is visible in Manager and survives a browser restart', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const worker = await getExtensionWorker(context);
    const extensionId = new URL(worker.url()).host;
    const manifest = JSON.parse(await readFile(path.join(extensionPath, 'manifest.json'), 'utf8')) as {
      action?: { default_popup?: string };
      commands?: Record<string, { suggested_key?: { default?: string } }>;
      content_scripts?: unknown;
      permissions?: string[];
    };
    expect(manifest.action?.default_popup).toBe('popup.html');
    expect(manifest.commands?.['save-page']?.suggested_key?.default).toBe('Ctrl+Shift+S');
    expect(manifest.permissions).toEqual(expect.arrayContaining(['contextMenus', 'scripting']));
    expect(manifest.content_scripts).toBeUndefined();
    const listeners = await worker.evaluate(() => {
      const extensionApi = (globalThis as unknown as {
        chrome: { commands: { onCommand: { hasListeners(): boolean } }; contextMenus: { onClicked: { hasListeners(): boolean } } };
      }).chrome;
      return {
        commands: extensionApi.commands.onCommand.hasListeners(),
        contextMenus: extensionApi.contextMenus.onClicked.hasListeners(),
      };
    });
    expect(listeners).toEqual({ commands: true, contextMenus: true });
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
    await popup.getByLabel('Title').fill('Updated fixture');
    await popup.getByLabel('URL').fill(fixtureUrl.replace('localhost', 'LOCALHOST'));
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    await expect(manager.getByRole('link', { name: 'Updated fixture' })).toBeVisible();
    await expect(manager.locator('time')).toContainText('Saved');
    await expect(manager.getByRole('listitem')).toHaveCount(1);

    await fixture.goto(`${fixtureUrl}?view=compact`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Query variant');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(manager.getByRole('listitem')).toHaveCount(2);
    await context.close();
    context = undefined;

    context = await launch(profile);
    const reopenedExtensionId = new URL((await getExtensionWorker(context)).url()).host;
    const reopenedManager = await context.newPage();
    await reopenedManager.goto(`chrome-extension://${reopenedExtensionId}/manager.html`);
    await expect(reopenedManager.getByRole('link', { name: 'Updated fixture' })).toBeVisible();
    await expect(reopenedManager.getByRole('link', { name: 'Query variant' })).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('metadata is editable and malformed metadata falls back to the document', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const fixture = await context.newPage();
    await fixture.goto(fixtureUrl.replace('/bookmark', '/metadata'));
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();

    await expect(popup.getByLabel('Title')).toHaveValue('Twitter title');
    await expect(popup.getByLabel('Description')).toHaveValue('Open Graph description');
    await expect(popup.getByLabel('Cover')).toHaveValue(fixtureUrl.replace('/bookmark', '/cover.jpg'));
    await popup.getByLabel('Title').fill('Edited title');
    await popup.getByLabel('Note').fill('Remember this');
    await popup.getByLabel('Favorite').check();
    await popup.getByLabel('Unread').check();
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(popup.getByRole('status')).toHaveText('Saved');

    await fixture.bringToFront();
    await popup.reload();
    await expect(popup.getByLabel('Title')).toHaveValue('Edited title');
    await expect(popup.getByLabel('Note')).toHaveValue('Remember this');
    await expect(popup.getByLabel('Favorite')).toBeChecked();
    await expect(popup.getByLabel('Unread')).toBeChecked();

    await fixture.goto(fixtureUrl.replace('/bookmark', '/broken'));
    await fixture.bringToFront();
    await popup.reload();
    await expect(popup.getByLabel('Title')).toHaveValue('Fallback title');
    await expect(popup.getByLabel('Description')).toHaveValue('');
    await popup.getByLabel('Title').fill('Manual fallback');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(popup.getByRole('status')).toHaveText('Saved');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('collections stay in sync, reject cycles, and persist organization', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);
    const fixture = await context.newPage();
    await fixture.goto(fixtureUrl);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();

    const createCollection = async (title: string, parent = 'Unsorted') => {
      await manager.getByLabel('New collection name').fill(title);
      await manager.getByLabel('Parent collection').selectOption({ label: parent });
      await manager.getByRole('button', { name: 'Create collection' }).click();
      await expect(manager.getByRole('button', { name: title, exact: true })).toBeVisible();
    };
    await createCollection('Inbox');
    await createCollection('Projects', 'Inbox');
    await createCollection('Reading', 'Inbox / Projects');
    await createCollection('Archive');

    await expect(popup.getByLabel('Collection').getByRole('option', { name: 'Inbox / Projects / Reading' })).toBeAttached();
    await manager.getByLabel('Parent for Projects').selectOption({ label: 'Archive' });
    await expect(popup.getByLabel('Collection').getByRole('option', { name: 'Archive / Projects / Reading' })).toBeAttached();
    await expect(manager.getByLabel('Parent for Archive').getByRole('option', { name: 'Archive / Projects', exact: true })).toHaveAttribute('disabled');

    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Collection').selectOption({ label: 'Archive / Projects / Reading' });
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(manager.getByLabel('Collection for Offline fixture')).toHaveValue(await popup.getByLabel('Collection').inputValue());
    await manager.getByLabel('Collection for Offline fixture').selectOption({ label: 'Inbox' });
    await expect(popup.getByLabel('Collection')).toHaveValue(await manager.getByLabel('Collection for Offline fixture').inputValue());
    await manager.getByRole('button', { name: 'Move Archive up' }).click();
    await expect(manager.locator('.collection-item > button[data-collection-id]').first()).toHaveText('Archive');
    await createCollection('Notes', 'Archive');
    await manager.getByLabel('Parent for Projects').selectOption({ label: 'Inbox' });
    await manager.getByLabel('Parent for Projects').selectOption({ label: 'Archive' });
    await manager.getByRole('button', { name: 'Move Projects up' }).click();
    await expect(manager.locator('.collection-item > button[data-collection-id]').nth(1)).toHaveText('Projects');

    manager.once('dialog', async (dialog) => {
      expect(dialog.type()).toBe('prompt');
      await dialog.accept('Library');
    });
    await manager.getByRole('button', { name: 'Rename Archive' }).click();
    await expect(manager.getByRole('button', { name: 'Library', exact: true })).toBeVisible();
    await manager.getByLabel('Language').selectOption('zh');
    await expect(manager.getByLabel('Projects 的父收藏夹')).toBeVisible();
    await manager.getByLabel('语言').selectOption('en');
    await context.close();
    context = undefined;

    context = await launch(profile);
    const reopenedExtensionId = new URL((await getExtensionWorker(context)).url()).host;
    const reopenedManager = await context.newPage();
    await reopenedManager.goto(`chrome-extension://${reopenedExtensionId}/manager.html`);
    await expect(reopenedManager.getByRole('button', { name: 'Library', exact: true })).toBeVisible();
    const libraryId = await reopenedManager.getByRole('button', { name: 'Library', exact: true }).getAttribute('data-collection-id');
    expect(libraryId).not.toBeNull();
    await expect(reopenedManager.getByLabel('Parent for Projects')).toHaveValue(
      libraryId!,
    );
    await expect(reopenedManager.getByLabel('Collection for Offline fixture').locator('option:checked')).toHaveText('Inbox');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('safe collection deletion preserves bookmarks and normalized tags', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);
    await manager.getByLabel('New collection name').fill('Temporary');
    await manager.getByRole('button', { name: 'Create collection' }).click();
    await expect(manager.getByRole('button', { name: 'Temporary', exact: true })).toBeVisible();
    await manager.getByRole('button', { name: 'Temporary', exact: true }).click();

    const fixture = await context.newPage();
    await fixture.goto(fixtureUrl);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Collection').selectOption({ label: 'Temporary' });
    await popup.getByLabel('Tags').fill(' research, research , work ');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    await expect(manager.getByLabel('Tags for Offline fixture')).toHaveValue('research, work');
    await manager.getByRole('button', { name: 'Remove work from Offline fixture' }).click();
    await expect(manager.getByLabel('Tags for Offline fixture')).toHaveValue('research');
    await manager.getByLabel('Tags for Offline fixture').fill('work, work, research');
    await manager.getByRole('button', { name: 'Update tags' }).click();
    await expect(manager.getByLabel('Tags for Offline fixture')).toHaveValue('work, research');
    await manager.getByRole('button', { name: 'research', exact: true }).click();
    await expect(manager.getByRole('link', { name: 'Offline fixture' })).toBeVisible();

    const cancelledDelete = manager.waitForEvent('dialog');
    await manager.getByRole('button', { name: 'Delete Temporary', exact: true }).click({ noWaitAfter: true });
    const cancelledDialog = await cancelledDelete;
    expect(cancelledDialog.message()).toContain('1 bookmark');
    await cancelledDialog.dismiss();
    await expect(manager.getByRole('button', { name: 'Temporary', exact: true })).toBeVisible();
    await expect(manager.getByLabel('Collection for Offline fixture').locator('option:checked')).toHaveText('Temporary');

    const confirmedDelete = manager.waitForEvent('dialog');
    await manager.getByRole('button', { name: 'Delete Temporary' }).click({ noWaitAfter: true });
    await (await confirmedDelete).accept();
    await expect(manager.getByRole('button', { name: 'Temporary', exact: true })).toHaveCount(0);
    await expect(manager.getByRole('link', { name: 'Offline fixture' })).toBeVisible();
    await expect(manager.getByLabel('Collection for Offline fixture').locator('option:checked')).toHaveText('Unsorted');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(manager.getByLabel('Collection for Offline fixture').locator('option:checked')).toHaveText('Unsorted');
    await context.close();
    context = undefined;

    context = await launch(profile);
    const reopenedExtensionId = new URL((await getExtensionWorker(context)).url()).host;
    const reopenedManager = await context.newPage();
    await reopenedManager.goto(`chrome-extension://${reopenedExtensionId}/manager.html`);
    await reopenedManager.getByRole('button', { name: 'research', exact: true }).click();
    await expect(reopenedManager.getByRole('link', { name: 'Offline fixture' })).toBeVisible();
    await expect(reopenedManager.getByLabel('Tags for Offline fixture')).toHaveValue('work, research');
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Manager searches every agreed field and combines filters', async () => {
  test.setTimeout(60_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);
    await manager.getByLabel('New collection name').fill('Focus');
    await manager.getByRole('button', { name: 'Create collection' }).click();
    await expect(manager.getByRole('button', { name: 'Focus', exact: true })).toBeVisible();

    const fixture = await context.newPage();
    const popup = await context.newPage();
    const saveBookmark = async (item: string, values: {
      title: string;
      description?: string;
      note?: string;
      tags: string;
      favorite?: boolean;
      unread?: boolean;
    }) => {
      await fixture.goto(`${fixtureUrl}?item=${item}`);
      if (popup.url() === 'about:blank') await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await fixture.bringToFront();
      await popup.reload();
      await popup.getByLabel('Title').fill(values.title);
      await popup.getByLabel('Description').fill(values.description ?? '');
      await popup.getByLabel('Note').fill(values.note ?? '');
      await popup.getByLabel('Collection').selectOption({ label: 'Focus' });
      await popup.getByLabel('Tags').fill(values.tags);
      if (values.favorite) await popup.getByLabel('Favorite').check();
      if (values.unread) await popup.getByLabel('Unread').check();
      await popup.getByRole('button', { name: 'Save bookmark' }).click();
      await expect(popup.getByRole('status')).toHaveText('Saved');
    };

    await saveBookmark('url-needle', { title: 'Title Needle', tags: 'red', favorite: true, unread: true });
    await saveBookmark('description', { title: 'Second bookmark', description: 'Description Needle', tags: 'red', unread: true });
    await saveBookmark('note', { title: 'Blue bookmark', note: 'Note Needle', tags: 'blue, tag-needle', favorite: true, unread: true });
    await saveBookmark('equal-title', { title: 'Blue bookmark', tags: 'blue', favorite: true, unread: true });

    const search = manager.getByLabel('Search bookmarks');
    for (const [term, title] of [
      ['title needle', 'Title Needle'],
      ['url-needle', 'Title Needle'],
      ['description needle', 'Second bookmark'],
      ['note needle', 'Blue bookmark'],
      ['tag-needle', 'Blue bookmark'],
    ] as const) {
      await search.fill(term);
      await expect(manager.getByRole('link', { name: title })).toBeVisible();
      await expect(manager.locator('.bookmark-list > li')).toHaveCount(1);
    }

    await manager.getByRole('button', { name: 'Focus', exact: true }).click();
    await search.fill('missing');
    await expect(manager.getByText('No bookmarks match your filters.')).toBeVisible();
    await search.fill('');
    await expect(manager.locator('.bookmark-list > li')).toHaveCount(4);

    await manager.getByRole('button', { name: 'red', exact: true }).click();
    await manager.getByLabel('Favorite only').check();
    await manager.getByLabel('Unread only').check();
    await expect(manager.getByRole('link', { name: 'Title Needle' })).toBeVisible();
    await expect(manager.locator('.bookmark-list > li')).toHaveCount(1);
    await search.fill('blue');
    await expect(manager.getByText('No bookmarks match your filters.')).toBeVisible();
    await manager.getByRole('button', { name: 'Clear all filters' }).click();
    await expect(manager.locator('.bookmark-list > li')).toHaveCount(4);

    const sort = manager.getByLabel('Sort bookmarks');
    await expect(sort).toBeVisible();
    await search.focus();
    await search.press('Tab');
    await expect(sort).toBeFocused();
    await sort.selectOption('title');
    const listLinks = [
      `${fixtureUrl}?item=note`,
      `${fixtureUrl}?item=equal-title`,
      `${fixtureUrl}?item=description`,
      `${fixtureUrl}?item=url-needle`,
    ];
    await expect.poll(() => manager.locator('.bookmark-list > li > a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).toEqual(listLinks);
    await sort.press('Tab');
    await expect(manager.getByRole('button', { name: 'List view' })).toBeFocused();
    await manager.getByRole('button', { name: 'List view' }).press('Tab');
    const cardView = manager.getByRole('button', { name: 'Card view' });
    await expect(cardView).toBeFocused();
    await cardView.press('Enter');
    await expect(cardView).toHaveAttribute('aria-pressed', 'true');
    await expect(manager.locator('.bookmark-list > li > a')).toHaveCount(4);
    await expect.poll(() => manager.locator('.bookmark-list > li > a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).toEqual(listLinks);
    await manager.getByRole('button', { name: 'Focus', exact: true }).click();
    await manager.getByRole('button', { name: 'blue', exact: true }).click();
    await manager.getByLabel('Favorite only').check();
    await manager.getByLabel('Unread only').check();
    await expect.poll(() => manager.locator('.bookmark-list > li > a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).toEqual(listLinks.slice(0, 2));
    await context.close();
    context = undefined;

    context = await launch(profile);
    const reopenedExtensionId = new URL((await getExtensionWorker(context)).url()).host;
    const reopenedManager = await context.newPage();
    await reopenedManager.goto(`chrome-extension://${reopenedExtensionId}/manager.html`);
    await expect(reopenedManager.getByLabel('Sort bookmarks')).toHaveValue('title');
    await expect(reopenedManager.getByRole('button', { name: 'Card view' })).toHaveAttribute('aria-pressed', 'true');
    await expect(reopenedManager.getByRole('button', { name: 'Focus', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(reopenedManager.getByRole('button', { name: 'blue', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(reopenedManager.getByLabel('Favorite only')).toBeChecked();
    await expect(reopenedManager.getByLabel('Unread only')).toBeChecked();
    await expect.poll(() => reopenedManager.locator('.bookmark-list > li > a').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href))).toEqual(listLinks.slice(0, 2));
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Manager bulk edits selected bookmarks and refreshes metadata on demand', async () => {
  test.setTimeout(60_000);
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;
  fixtureRequests = new Map();

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const fixture = await context.newPage();
    const popup = await context.newPage();
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);

    const saveBookmark = async (pathSuffix: string, title: string, tags: string) => {
      await fixture.goto(`${fixtureUrl.replace('/bookmark', pathSuffix)}`);
      if (popup.url() === 'about:blank') await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await fixture.bringToFront();
      await popup.reload();
      await popup.getByLabel('Title').fill(title);
      await popup.getByLabel('Description').fill(`Old ${title}`);
      await popup.getByLabel('Tags').fill(tags);
      await popup.getByRole('button', { name: 'Save bookmark' }).click();
      await expect(popup.getByRole('status')).toHaveText('Saved');
    };

    await saveBookmark('/metadata?bulk=alpha', 'Alpha old', 'red');
    await saveBookmark('/metadata?bulk=beta', 'Beta old', 'red');
    await saveBookmark('/metadata?bulk=gamma', 'Gamma old', 'blue');
    await saveBookmark('/missing?bulk=broken', 'Broken old', 'red');
    await saveBookmark('/empty-metadata?bulk=empty', 'Empty old', 'red');

    await manager.getByRole('button', { name: 'red', exact: true }).click();
    await manager.getByLabel('Select visible').check();
    await manager.locator('.bulk-actions').getByLabel('Tags').fill('batched');
    await manager.getByRole('button', { name: 'Add tags to selected' }).click();
    await manager.getByRole('button', { name: 'Clear filter' }).click();
    await expect(manager.getByLabel('Tags for Gamma old')).toHaveValue('blue');
    await manager.getByRole('button', { name: 'batched', exact: true }).click();
    await expect(manager.locator('.bookmark-list > li')).toHaveCount(4);

    await manager.getByLabel('Select visible').check();
    await manager.getByRole('button', { name: 'Move selected to Trash' }).click();
    await expect(manager.getByRole('status')).toHaveText('Moved 4 bookmarks to Trash.');
    await manager.getByRole('button', { name: 'Trash', exact: true }).click();
    for (const title of ['Alpha old', 'Beta old', 'Broken old', 'Empty old']) {
      await manager.getByRole('button', { name: `Restore ${title}` }).click();
    }
    await manager.getByRole('button', { name: 'All bookmarks' }).click();

    const alphaBeforeRefresh = fixtureRequests.get('/metadata?bulk=alpha') ?? 0;
    await manager.getByLabel('Sort bookmarks').selectOption('oldest');
    await manager.getByLabel('Select Alpha old').check();
    await manager.getByLabel('Select Broken old').check();
    await manager.getByLabel('Select Empty old').check();
    await expect.poll(() => fixtureRequests.get('/metadata?bulk=alpha') ?? 0).toBe(alphaBeforeRefresh);
    await manager.getByRole('button', { name: 'Refresh metadata' }).click();
    await expect(manager.getByRole('status')).toContainText('Metadata refresh: 3/3, 1 succeeded, 2 failed.');
    await expect(manager.getByRole('link', { name: 'Twitter title' })).toBeVisible();
    await expect(manager.getByLabel('Tags for Broken old')).toHaveValue('red, batched');
    await expect(manager.getByLabel('Tags for Empty old')).toHaveValue('red, batched');
    await expect(manager.getByLabel('Tags for Empty old')).toBeVisible();
    await expect(manager.getByRole('link', { name: 'Empty old' })).toBeVisible();
    await expect(manager.getByText('Metadata refresh failed: HTTP 500')).toBeVisible();
    await expect(manager.getByText('Metadata refresh failed: No readable metadata')).toBeVisible();
    await expect(manager.getByLabel('Tags for Twitter title')).toHaveValue('red, batched');

    await saveBookmark('/metadata?bulk=cancel-one', 'Cancel one old', 'cancel');
    await saveBookmark('/slow-metadata?bulk=cancel-two', 'Cancel two old', 'cancel');
    await saveBookmark('/metadata?bulk=cancel-three', 'Cancel three old', 'cancel');
    await manager.getByRole('button', { name: 'cancel', exact: true }).click();
    await manager.getByLabel('Sort bookmarks').selectOption('oldest');
    await manager.getByLabel('Select visible').check();
    await manager.getByRole('button', { name: 'Refresh metadata' }).click();
    await expect(manager.getByRole('status')).toContainText('Metadata refresh: 1/3, 1 succeeded, 0 failed.');
    await manager.getByRole('button', { name: 'Cancel refresh' }).click();
    await expect(manager.getByRole('status')).toContainText('Metadata refresh canceled: 1/3, 1 succeeded, 0 failed.');
    await expect(manager.getByRole('link', { name: 'Should not refresh' })).toHaveCount(0);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Manager imports and exports browser bookmark HTML', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  const files = await mkdtemp(path.join(tmpdir(), 'openbookmark-html-'));
  let context: BrowserContext | undefined;

  try {
    const importFile = path.join(files, 'bookmarks.html');
    await writeFile(importFile, `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Work</H3>
  <DL><p>
    <DT><H3>Nested</H3>
    <DL><p>
      <DT><A HREF="https://example.com/imported">Imported child</A>
    </DL><p>
    <DT><A>Broken child</A>
  </DL><p>
  <DT><A HREF="https://example.com/root">Imported root</A>
</DL><p>`);

    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);

    await manager.getByRole('button', { name: 'Open settings' }).click();
    await manager.getByLabel('Import browser HTML').setInputFiles(importFile);
    await expect(manager.getByRole('status')).toHaveText('Browser import complete: 2/2, 1 skipped.');
    await expect(manager.getByRole('link', { name: 'Imported root' })).toBeVisible();
    await expect(manager.getByRole('link', { name: 'Imported child' })).toBeVisible();
    await expect(manager.getByLabel('Collection for Imported child').locator('option:checked')).toHaveText('Work / Nested');

    const downloadPromise = manager.waitForEvent('download');
    await manager.getByRole('button', { name: 'Export browser HTML' }).click();
    const download = await downloadPromise;
    const exportedPath = await download.path();
    expect(exportedPath).toBeTruthy();
    const parsed = parseBrowserBookmarksHtml(await readFile(exportedPath!, 'utf8'));
    expect(parsed.bookmarks.map(({ title, url, path }) => ({ title, url, path }))).toEqual([
      { title: 'Imported root', url: 'https://example.com/root', path: [] },
      { title: 'Imported child', url: 'https://example.com/imported', path: ['Work', 'Nested'] },
    ]);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
    await rm(files, { recursive: true, force: true });
  }
});

test('Trash hides bookmarks and restores every field to a safe collection', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);
    await manager.getByLabel('New collection name').fill('Temporary');
    await manager.getByRole('button', { name: 'Create collection' }).click();
    await expect(manager.getByRole('button', { name: 'Temporary', exact: true })).toBeVisible();

    const fixture = await context.newPage();
    await fixture.goto(`${fixtureUrl}?trash=restore`);
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Restorable bookmark');
    await popup.getByLabel('Description').fill('Preserved description');
    await popup.getByLabel('Note').fill('Preserved note');
    await popup.getByLabel('Collection').selectOption({ label: 'Temporary' });
    await popup.getByLabel('Tags').fill('preserved');
    await popup.getByLabel('Favorite').check();
    await popup.getByLabel('Unread').check();
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    const moveToTrash = manager.getByRole('button', { name: 'Move Restorable bookmark to Trash' });
    await expect(moveToTrash).toBeVisible();
    await moveToTrash.click();
    await expect(manager.getByRole('link', { name: 'Restorable bookmark' })).toHaveCount(0);

    await popup.getByLabel('Title').fill('Temporary replacement');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();
    await expect(popup.getByRole('status')).toHaveText('Saved');
    await expect(manager.getByRole('link', { name: 'Temporary replacement' })).toBeVisible();

    await manager.getByRole('button', { name: 'Trash', exact: true }).click();
    await expect(manager.getByRole('button', { name: 'Temporary', exact: true })).toHaveAttribute('aria-pressed', 'false');
    await expect(manager.getByRole('link', { name: 'Restorable bookmark' })).toBeVisible();
    await manager.getByRole('button', { name: 'Restore Restorable bookmark' }).click();
    await expect(manager.getByRole('status')).toHaveText('This URL is already saved. Move the active bookmark to Trash before restoring.');
    await expect(manager.getByRole('link', { name: 'Restorable bookmark' })).toBeVisible();

    await manager.getByRole('button', { name: 'All bookmarks' }).click();
    await manager.getByRole('button', { name: 'Move Temporary replacement to Trash' }).click();
    await manager.getByRole('button', { name: 'Trash', exact: true }).click();
    await expect(manager.getByRole('link', { name: 'Temporary replacement' })).toBeVisible();

    const deleteCollection = manager.waitForEvent('dialog');
    await manager.getByRole('button', { name: 'Delete Temporary', exact: true }).click({ noWaitAfter: true });
    await (await deleteCollection).accept();
    await manager.getByRole('button', { name: 'Restore Restorable bookmark' }).click();
    await expect(manager.getByRole('status')).toHaveText('Original collection is unavailable. Restored to Unsorted.');
    await manager.getByRole('button', { name: 'All bookmarks' }).click();
    await expect(manager.getByRole('link', { name: 'Restorable bookmark' })).toBeVisible();
    await expect(manager.getByRole('link', { name: 'Temporary replacement' })).toHaveCount(0);
    await expect(manager.getByLabel('Collection for Restorable bookmark').locator('option:checked')).toHaveText('Unsorted');

    await fixture.bringToFront();
    await popup.reload();
    await expect(popup.getByLabel('Title')).toHaveValue('Restorable bookmark');
    await expect(popup.getByLabel('Description')).toHaveValue('Preserved description');
    await expect(popup.getByLabel('Note')).toHaveValue('Preserved note');
    await expect(popup.getByLabel('Tags')).toHaveValue('preserved');
    await expect(popup.getByLabel('Favorite')).toBeChecked();
    await expect(popup.getByLabel('Unread')).toBeChecked();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('Trash requires confirmation before permanently deleting bookmarks', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const fixture = await context.newPage();
    const popup = await context.newPage();
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);

    await fixture.goto(`${fixtureUrl}?trash=permanent`);
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Delete permanently');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    await fixture.goto(`${fixtureUrl}?trash=empty-one`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Empty one');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    await fixture.goto(`${fixtureUrl}?trash=empty-two`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Empty two');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    for (const title of ['Delete permanently', 'Empty one', 'Empty two']) {
      await manager.getByRole('button', { name: `Move ${title} to Trash` }).click();
    }
    await manager.getByRole('button', { name: 'Trash', exact: true }).click();

    const cancelPermanent = manager.waitForEvent('dialog');
    const cancelPermanentClick = manager.getByRole('button', { name: 'Permanently delete Delete permanently' }).click({ noWaitAfter: true });
    await (await cancelPermanent).dismiss();
    await cancelPermanentClick;
    await expect(manager.getByRole('link', { name: 'Delete permanently' })).toBeVisible();

    const confirmPermanent = manager.waitForEvent('dialog');
    const confirmPermanentClick = manager.getByRole('button', { name: 'Permanently delete Delete permanently' }).click({ noWaitAfter: true });
    await (await confirmPermanent).accept();
    await confirmPermanentClick;
    await expect(manager.getByRole('link', { name: 'Delete permanently' })).toHaveCount(0);

    const cancelEmpty = manager.waitForEvent('dialog');
    const cancelEmptyClick = manager.getByRole('button', { name: 'Empty Trash' }).click({ noWaitAfter: true });
    await (await cancelEmpty).dismiss();
    await cancelEmptyClick;
    await expect(manager.getByRole('link', { name: 'Empty one' })).toBeVisible();
    await expect(manager.getByRole('link', { name: 'Empty two' })).toBeVisible();

    const confirmEmpty = manager.waitForEvent('dialog');
    const confirmEmptyClick = manager.getByRole('button', { name: 'Empty Trash' }).click({ noWaitAfter: true });
    await (await confirmEmpty).accept();
    await confirmEmptyClick;
    await expect(manager.getByText('Trash is empty.')).toBeVisible();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('automatic cleanup retains recent Trash items and purges items older than 30 days', async () => {
  const profile = await mkdtemp(path.join(tmpdir(), 'openbookmark-'));
  let context: BrowserContext | undefined;

  try {
    context = await launch(profile);
    const extensionId = new URL((await getExtensionWorker(context)).url()).host;
    const fixture = await context.newPage();
    const popup = await context.newPage();
    const manager = await context.newPage();
    await manager.goto(`chrome-extension://${extensionId}/manager.html`);

    await fixture.goto(`${fixtureUrl}?trash=recent`);
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Recent trash');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    await fixture.goto(`${fixtureUrl}?trash=expired`);
    await fixture.bringToFront();
    await popup.reload();
    await popup.getByLabel('Title').fill('Expired trash');
    await popup.getByRole('button', { name: 'Save bookmark' }).click();

    const day = 24 * 60 * 60 * 1000;
    await manager.clock.install({ time: new Date(Date.now() - 29 * day) });
    await manager.getByRole('button', { name: 'Move Recent trash to Trash' }).click();
    await manager.clock.setFixedTime(new Date(Date.now() - 31 * day));
    await manager.getByRole('button', { name: 'Move Expired trash to Trash' }).click();

    await context.close();
    context = await launch(profile);
    const worker = await getExtensionWorker(context);
    const alarm = await worker.evaluate(async () => {
      const extensionApi = (globalThis as unknown as { chrome: { alarms: { get(name: string): Promise<{ name: string } | undefined> } } }).chrome;
      return extensionApi.alarms.get('trash-cleanup');
    });
    expect(alarm?.name).toBe('trash-cleanup');

    const reopenedManager = await context.newPage();
    await reopenedManager.goto(`chrome-extension://${extensionId}/manager.html`);
    await reopenedManager.getByRole('button', { name: 'Trash', exact: true }).click();
    await expect(reopenedManager.getByRole('link', { name: 'Recent trash' })).toBeVisible();
    await expect(reopenedManager.getByRole('link', { name: 'Expired trash' })).toHaveCount(0);
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
