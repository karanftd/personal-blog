// POST /api/subscribe — store a Web Push subscription in KV.
// DELETE /api/subscribe — remove a subscription by endpoint.
// Requires a KV namespace bound as PUSH_KV (Pages → Settings → Functions → KV bindings).
const MAX_SUBS = 100;

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function validSub(sub) {
  return (
    sub &&
    typeof sub.endpoint === 'string' &&
    sub.endpoint.startsWith('https://') &&
    sub.keys &&
    typeof sub.keys.p256dh === 'string' &&
    typeof sub.keys.auth === 'string'
  );
}

export async function onRequestPost({ request, env }) {
  if (!env.PUSH_KV) return json({ ok: false, error: 'push storage not configured' }, 500);
  let sub;
  try {
    sub = await request.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  if (!validSub(sub)) return json({ ok: false, error: 'invalid subscription' }, 400);

  const subs = (await env.PUSH_KV.get('subscriptions', 'json')) || [];
  const rest = subs.filter((s) => s && s.endpoint !== sub.endpoint);
  rest.push({
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    createdAt: new Date().toISOString(),
  });
  await env.PUSH_KV.put('subscriptions', JSON.stringify(rest.slice(-MAX_SUBS)));
  return json({ ok: true, count: rest.length });
}

export async function onRequestDelete({ request, env }) {
  if (!env.PUSH_KV) return json({ ok: false, error: 'push storage not configured' }, 500);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'bad json' }, 400);
  }
  const subs = (await env.PUSH_KV.get('subscriptions', 'json')) || [];
  const rest = subs.filter((s) => s && s.endpoint !== body.endpoint);
  await env.PUSH_KV.put('subscriptions', JSON.stringify(rest));
  return json({ ok: true, count: rest.length });
}
