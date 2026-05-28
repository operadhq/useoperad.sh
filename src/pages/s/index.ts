import type { APIRoute } from 'astro'

export const prerender = false

const MAX_SIZE = 5 * 1024 * 1024 // 5 MB
const RATE_LIMIT = 3 // max uploads per IP per day

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

// In-memory rate limit (resets on Worker cold start — good enough for early stage)
const uploads = new Map<string, { count: number; resetAt: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = uploads.get(ip)
  if (!entry || now > entry.resetAt) {
    uploads.set(ip, { count: 1, resetAt: now + 86_400_000 }) // 24 hours
    return true
  }
  if (entry.count >= RATE_LIMIT) return false
  entry.count++
  return true
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env

  // ── Rate limit by IP ────────────────────────────────────────────────
  const ip = request.headers.get('CF-Connecting-IP') ?? request.headers.get('X-Forwarded-For') ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({
      error: 'Free tier limit reached (3 shares/day). Need more? Email hello@operad.sh',
      upgrade: 'mailto:hello@operad.sh?subject=Operad%20Share%20—%20need%20more%20uploads',
    }), {
      status: 429,
      headers: { 'Content-Type': 'application/json', 'Retry-After': '86400' },
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
