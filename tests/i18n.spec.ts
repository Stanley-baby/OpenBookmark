import { expect, test } from '@playwright/test';
import { translate } from '../lib/i18n';

test('message interpolation preserves placeholder-shaped user text', () => {
  expect(translate('en', 'deleteImpact', { title: '{bookmarks}', bookmarks: 3, children: 0 })).toContain('“{bookmarks}”');
});
