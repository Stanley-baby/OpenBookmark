import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'OpenBookmark',
    description: 'A local-first bookmark manager.',
    permissions: ['activeTab', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
  },
});
