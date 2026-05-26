import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

import cloudflare from "@astrojs/cloudflare";

export default defineConfig({
  integrations: [
    starlight({
      title: 'Operad',
      customCss: ['./src/styles/docs-custom.css'],
      sidebar: [
        { label: 'Overview', link: '/docs/' },
        { label: 'Quickstart', link: '/docs/quickstart/' },
        {
          label: 'Concepts',
          items: [
            { label: 'Graph', link: '/docs/concepts/graph/' },
            { label: 'Events', link: '/docs/concepts/events/' },
            { label: 'Behaviors', link: '/docs/concepts/behaviors/' },
            { label: 'Decisions', link: '/docs/concepts/decisions/' },
            { label: 'Branching', link: '/docs/concepts/branching/' },
          ],
        },
        {
          label: 'Reference',
          items: [
            { label: 'API', link: '/docs/reference/api/' },
          ],
        },
      ],
    }),
  ],

  output: "hybrid",
  adapter: cloudflare()
})