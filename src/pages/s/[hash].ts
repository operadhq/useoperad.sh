import type { APIRoute } from 'astro'

export const prerender = false

export const GET: APIRoute = async ({ params, locals }) => {
  const { hash } = params
  if (!hash || !/^[a-zA-Z0-9]{1,16}$/.test(hash)) {
    return new Response('Not found', { status: 404 })
  }

  const env = locals.runtime.env
  const object = await env.SESSION_SHARES.get(`s/${hash}.html`)

  if (!object) {
    return new Response('Not found', { status: 404 })
  }

  // ── Expiry check ──────────────────────────────────────────────────
  const expiresAt = object.customMetadata?.expiresAt
  if (expiresAt && new Date(expiresAt) < new Date()) {
    // Clean up expired object in the background
    await env.SESSION_SHARES.delete(`s/${hash}.html`)
    return new Response('This shared session has expired.', { status: 410 })
  }

  // ── Serve HTML ────────────────────────────────────────────────────
  const body = await object.text()
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'origin-when-cross-origin',
      // Allow inline scripts (needed for self-contained HTML) but block external loads
      'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src https://operad.sh; img-src data:",
    },
  })
}
