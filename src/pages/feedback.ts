import type { APIRoute } from 'astro'

export const prerender = false

const GITHUB_REPO = 'operadhq/operad'

const corsHeaders: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export const POST: APIRoute = async ({ request, locals }) => {
  const env = locals.runtime.env

  let body: { type?: string; message?: string; sessionUrl?: string }
  try {
    body = await request.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), { status: 400, headers: corsHeaders })
  }

  const { type, message, sessionUrl } = body
  if (!message?.trim()) {
    return new Response(JSON.stringify({ error: 'Message is required' }), { status: 400, headers: corsHeaders })
  }

  if (type === 'feedback') {
    // ── Product feedback → GitHub Discussion ──────────────────────────
    const ghToken = (env as Record<string, string>).GITHUB_TOKEN
    if (!ghToken) {
      // Fallback: store in R2 if no GitHub token configured
      await storeFeedbackInR2(env.SESSION_SHARES, message, sessionUrl)
      return new Response(JSON.stringify({ ok: true, destination: 'stored' }), { status: 200, headers: corsHeaders })
    }

    try {
      // Get the Discussion category ID (General)
      const repoId = await getRepoId(ghToken)
      const categoryId = await getDiscussionCategoryId(ghToken, repoId)

      await createDiscussion(ghToken, repoId, categoryId, message, sessionUrl)
      return new Response(JSON.stringify({ ok: true, destination: 'github' }), { status: 200, headers: corsHeaders })
    } catch {
      // Fallback to R2 if GitHub API fails
      await storeFeedbackInR2(env.SESSION_SHARES, message, sessionUrl)
      return new Response(JSON.stringify({ ok: true, destination: 'stored' }), { status: 200, headers: corsHeaders })
    }
  }

  // ── Session comment → R2 ────────────────────────────────────────────
  const hash = extractHash(sessionUrl)
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  await env.SESSION_SHARES.put(`comments/${hash}/${id}.json`, JSON.stringify({
    message: message.trim(),
    sessionUrl,
    createdAt: new Date().toISOString(),
  }), {
    customMetadata: {
      sessionHash: hash,
      createdAt: new Date().toISOString(),
    },
  })

  return new Response(JSON.stringify({ ok: true, destination: 'session' }), { status: 200, headers: corsHeaders })
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

// ── Helpers ───────────────────────────────────────────────────────────

function extractHash(url?: string): string {
  if (!url) return 'unknown'
  const match = url.match(/\/s\/([a-zA-Z0-9]+)/)
  return match?.[1] ?? 'unknown'
}

async function storeFeedbackInR2(bucket: R2Bucket, message: string, sessionUrl?: string) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  await bucket.put(`feedback/${id}.json`, JSON.stringify({
    message: message.trim(),
    sessionUrl,
    createdAt: new Date().toISOString(),
  }))
}

// ── GitHub GraphQL helpers ────────────────────────────────────────────

async function getRepoId(token: string): Promise<string> {
  const [owner, name] = GITHUB_REPO.split('/')
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'operad-feedback' },
    body: JSON.stringify({
      query: `query { repository(owner: "${owner}", name: "${name}") { id } }`,
    }),
  })
  const data = (await res.json()) as { data: { repository: { id: string } } }
  return data.data.repository.id
}

async function getDiscussionCategoryId(token: string, repoId: string): Promise<string> {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'operad-feedback' },
    body: JSON.stringify({
      query: `query { node(id: "${repoId}") { ... on Repository { discussionCategories(first: 10) { nodes { id name } } } } }`,
    }),
  })
  const data = (await res.json()) as { data: { node: { discussionCategories: { nodes: { id: string; name: string }[] } } } }
  const categories = data.data.node.discussionCategories.nodes
  // Prefer "Feedback" category, fall back to "General"
  const cat = categories.find(c => c.name === 'Feedback') ?? categories.find(c => c.name === 'General') ?? categories[0]
  return cat.id
}

async function createDiscussion(token: string, repoId: string, categoryId: string, message: string, sessionUrl?: string) {
  const title = message.trim().slice(0, 80) + (message.length > 80 ? '...' : '')
  const body = `${message.trim()}${sessionUrl ? `\n\n---\n_Submitted from shared session: ${sessionUrl}_` : ''}`

  await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'operad-feedback' },
    body: JSON.stringify({
      query: `mutation($input: CreateDiscussionInput!) { createDiscussion(input: $input) { discussion { url } } }`,
      variables: {
        input: { repositoryId: repoId, categoryId, title, body },
      },
    }),
  })
}
