/// <reference path="../.astro/types.d.ts" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  SESSION_SHARES: R2Bucket
  SHARE_API_KEY: string
  GITHUB_TOKEN: string
}>

declare namespace App {
  interface Locals extends Runtime {}
}
