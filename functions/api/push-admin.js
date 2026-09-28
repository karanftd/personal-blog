// Internal admin API for the scheduled push sender (GitHub Actions).
// The Action talks to this instead of the Cloudflare API, so no CF API token
// is needed anywhere.
//
//   GET /api/push-admin?key=subscriptions|push_state
//   PUT /api/push-admin   { key, value }
//
// Auth: Authorization: Bearer <PUSH_ADMIN_SECRET> (Pages env var).
// Only the keys the push sender needs are allowed.
const ALLOWED_KEYS = new Set(['subscriptions', 'push_state']);

function checkAuth(request, env) {
  const secret = env.PUSH_ADMIN_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') || '';
  // Constant-time-ish compare to avoid trivial timing leaks.
  if (header.length !== secret.length + 7) return false;
  let ok = header.startsWith('Bearer ');
  const a = header.slice(7);
  for (let i = 0; i < secret.length; i++) ok = ok && a[i] === secret[i];
  return ok;
}

export async function onRequestGet({ request, env }) {
  if (!checkAuth(request, env))
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  if (!env.PUSH_KV)
    return new Response(JSON.stringify({ ok: false, error: 'no kv' }), { status: 500 });
  const key = new URL(request.url).searchParams.get('key');
  if (!ALLOWED_KEYS.has(key))
    return new Response(JSON.stringify({ ok: false, error: 'bad key' }), { status: 400 });
  const value = await env.PUSH_KV.get(key, 'json');
  return Response.json({ ok: true, value });
}

export async function onRequestPut({ request, env }) {
  if (!checkAuth(request, env))
    return new Response(JSON.stringify({ ok: false }), { status: 401 });
  if (!env.PUSH_KV)
    return new Response(JSON.stringify({ ok: false, error: 'no kv' }), { status: 500 });
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'bad json' }), { status: 400 });
  }
  if (!ALLOWED_KEYS.has(body.key))
    return new Response(JSON.stringify({ ok: false, error: 'bad key' }), { status: 400 });
  await env.PUSH_KV.put(body.key, JSON.stringify(body.value));
  return Response.json({ ok: true });
}
