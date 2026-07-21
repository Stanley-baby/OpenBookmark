import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OpenBookmark',
    description: 'A local-first bookmark manager.',
    permissions: ['activeTab', 'contextMenus', 'scripting', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    commands: {
      'save-page': {
        suggested_key: { default: 'Ctrl+Shift+S', mac: 'Command+Shift+S' },
        description: 'Save the current page',
      },
    },
  },
});
