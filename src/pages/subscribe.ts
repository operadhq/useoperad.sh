import type { APIRoute } from 'astro'

export const prerender = false

// Simple rate limit: 5 subscribes per IP per hour
const subs = new Map<string, { count: number; resetAt: number }>()

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const now = Date.now()
  const entry = subs.get(ip)
  if (entry && now < entry.resetAt && entry.count >= 5) {
    return new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
  }
  if (!entry || now > entry.resetAt) subs.set(ip, { count: 1, resetAt: now + 3600_000 })
  else entry.count++

  // ── CORS (shared sessions open from any origin) ─────────────────────
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  let body: { email?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@') || email.length > 254) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400, headers })
  }

  // ── Store in R2 as a simple append log ──────────────────────────────
  // Key: subscribers/{email} — deduplicated by design
  await env.SESSION_SHARES.put(`subscribers/${email}`, JSON.stringify({
    email,
    subscribedAt: new Date().toISOString(),
    source: request.headers.get('Referer') ?? 'direct',
  }), {
    customMetadata: { email, subscribedAt: new Date().toISOString() },
  })

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers })
}

// ── CORS preflight ────────────────────────────────────────────────────
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
    },
  })
}
