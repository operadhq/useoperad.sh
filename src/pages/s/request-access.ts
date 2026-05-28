import type { APIRoute } from 'astro'

export const prerender = false

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env

  let body: { email?: string; graphId?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const email = (body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return new Response(JSON.stringify({ error: 'Invalid email' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'
  const now = new Date().toISOString()

  // ── Save to R2 ──────────────────────────────────────────────────────
  await env.SESSION_SHARES.put(`access-requests/${email}.json`, JSON.stringify({
    email,
    graphId: body.graphId ?? 'unknown',
    ip,
    requestedAt: now,
  }), {
    customMetadata: { email, requestedAt: now },
  })

  // ── Notify Slack ────────────────────────────────────────────────────
  const slackUrl = (env as Record<string, string>).SLACK_WEBHOOK_URL
  if (slackUrl) {
    fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: `🔥 *Share access request*\n• Email: \`${email}\`\n• Graph: \`${body.graphId ?? 'unknown'}\`\n• IP: \`${ip}\`\n• Time: ${now}`,
      }),
    }).catch(() => {})
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
