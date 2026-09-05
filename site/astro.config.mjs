import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://candril.github.io',
  base: '/presto',
  integrations: [
    starlight({
      title: 'presto',
      description: 'Pull requests in the terminal. Every repo you watch, one list, and whose move it is.',
      logo: {
        src: './src/assets/logo.svg',
      },
      favicon: '/logo.svg',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/candril/presto',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/candril/presto/edit/main/site/',
      },
      sidebar: [
        {
          label: 'Guide',
          items: [
            { label: 'Installation', slug: 'guide/installation' },
            { label: 'Getting Started', slug: 'guide/getting-started' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'Status Columns', slug: 'reference/status-columns' },
            { label: 'Tabs', slug: 'reference/tabs' },
            { label: 'Filtering', slug: 'reference/filtering' },
            { label: 'Actions', slug: 'reference/actions' },
            { label: 'Marks & Unread', slug: 'reference/marks-unread' },
            { label: 'Key Bindings', slug: 'reference/key-bindings' },
            { label: 'Configuration', slug: 'reference/configuration' },
            { label: 'CLI', slug: 'reference/cli' },
          ],
        },
      ],
      customCss: ['./src/styles/custom.css'],
    }),
  ],
})
