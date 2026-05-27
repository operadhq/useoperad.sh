import type { APIRoute } from 'astro'

export const prerender = false

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB

const BASE62 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

function generateHash(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  let hash = ''
  for (let i = 0; i < 8; i++) {
    hash += BASE62[bytes[i] % 62]
  }
  return hash
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env

  // ── Auth ────────────────────────────────────────────────────────────
  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ') || authHeader.slice(7) !== env.SHARE_API_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Size check ──────────────────────────────────────────────────────
  const contentLength = Number(request.headers.get('Content-Length') ?? 0)
  if (contentLength > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'Payload too large (5 MB max)' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const body = await request.text()
  if (body.length > MAX_SIZE) {
    return new Response(JSON.stringify({ error: 'Payload too large (5 MB max)' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!body.trim()) {
    return new Response(JSON.stringify({ error: 'Empty body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Generate hash & store ───────────────────────────────────────────
  const hash = generateHash()
  const now = new Date()
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 7 days
  const graphId = request.headers.get('X-Graph-Id') ?? 'unknown'

  await env.SESSION_SHARES.put(`s/${hash}.html`, body, {
    httpMetadata: { contentType: 'text/html; charset=utf-8' },
    customMetadata: {
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      graphId,
    },
  })

  const host = new URL(request.url).origin
  return new Response(
    JSON.stringify({
      url: `${host}/s/${hash}`,
      hash,
      expiresAt: expiresAt.toISOString(),
    }),
    {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    },
  )
}

// Block GET on the index (POST-only endpoint)
export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ error: 'Method not allowed. POST to upload a session.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  })
}
