// Scheduled push sender (GitHub Actions, every 30 min).
// Fetches the feed sources, diffs against KV state, and sends Web Push
// notifications to stored subscriptions for new items.
//
// Env required:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. "mailto:you@example.com")
//   CF_ACCOUNT_ID, CF_API_TOKEN (Workers KV Storage: Edit), PUSH_KV_NAMESPACE_ID
import webpush from 'web-push';
import Parser from 'rss-parser';
import fs from 'node:fs';

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  CF_ACCOUNT_ID,
  CF_API_TOKEN,
  PUSH_KV_NAMESPACE_ID,
} = process.env;

for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CF_ACCOUNT_ID', 'CF_API_TOKEN', 'PUSH_KV_NAMESPACE_ID']) {
  if (!process.env[k]) {
    console.error(`missing env ${k}`);
    process.exit(1);
  }
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const KV_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${PUSH_KV_NAMESPACE_ID}/values`;
const kvHeaders = { Authorization: `Bearer ${CF_API_TOKEN}` };

async function kvGet(key, fallback) {
  const r = await fetch(`${KV_BASE}/${key}`, { headers: kvHeaders });
  if (!r.ok) return fallback;
  try {
    return await r.json();
  } catch {
    return fallback;
  }
}

async function kvPut(key, value) {
  const r = await fetch(`${KV_BASE}/${key}`, {
    method: 'PUT',
    headers: { ...kvHeaders, 'content-type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!r.ok) throw new Error(`KV put ${key} failed: ${r.status}`);
}

// Pull { name, url } entries out of a named array in feeds.ts.
function sourcesFrom(feedsTs, arrayName, isBuild) {
  const m = feedsTs.match(new RegExp(`${arrayName}\\s*:\\s*FeedSource\\[\\]\\s*=\\s*\\[([\\s\\S]*?)\\];`));
  if (!m) return [];
  return [...m[1].matchAll(/\{\s*name:\s*'([^']+)'\s*,\s*url:\s*'([^']+)'/g)].map((x) => ({
    name: x[1],
    url: x[2],
    isBuild,
  }));
}

const parser = new Parser({ timeout: 20000 });
const UA = 'karanftd-push/1.0 (+https://karanftd.com/feed)';

async function fetchItems(src) {
  const res = await fetch(src.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const feed = await parser.parseString(await res.text());
  return (feed.items || []).slice(0, 15).map((item) => ({
    title: item.title ?? '(untitled)',
    link: item.link ?? '',
    pubDate: item.isoDate ? new Date(item.isoDate) : item.pubDate ? new Date(item.pubDate) : null,
    source: src.name,
    isBuild: src.isBuild,
  }));
}

const MAX_PUSHES_PER_RUN = 5;

async function main() {
  const feedsTs = fs.readFileSync(new URL('../src/data/feeds.ts', import.meta.url), 'utf8');
  const sources = [
    ...sourcesFrom(feedsTs, 'NEWS_FEEDS', false),
    ...sourcesFrom(feedsTs, 'BUILDS_FEEDS', true),
  ];

  const [subs, state] = await Promise.all([
    kvGet('subscriptions', []),
    kvGet('push_state', null),
  ]);
  const subscriptions = Array.isArray(subs) ? subs.filter((s) => s && s.endpoint) : [];

  const now = new Date();
  if (!state) {
    // First run: seed state, don't blast notifications for old items.
    await kvPut('push_state', { lastCheck: now.toISOString(), seen: [] });
    console.log('seeded push_state; no subscriptions notified on first run');
    return;
  }

  const lastCheck = new Date(state.lastCheck);
  const seen = new Set(Array.isArray(state.seen) ? state.seen : []);
  const fresh = [];

  for (const src of sources) {
    let items;
    try {
      items = await fetchItems(src);
    } catch (e) {
      console.log(`skip ${src.name}: ${e.message}`);
      continue;
    }
    for (const it of items) {
      if (!it.link || seen.has(it.link)) continue;
      if (!it.pubDate || it.pubDate <= lastCheck) continue;
      fresh.push(it);
    }
  }
  fresh.sort((a, b) => b.pubDate - a.pubDate);
  const toPush = fresh.slice(0, MAX_PUSHES_PER_RUN);

  console.log(`subscriptions=${subscriptions.length} fresh=${fresh.length} pushing=${toPush.length}`);

  const dead = new Set();
  for (const item of toPush) {
    const payload = JSON.stringify({
      title: item.isBuild ? `🔨 ${item.title}` : item.title,
      body: `${item.source} · ${item.pubDate.toLocaleString('en-SG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}`,
      url: item.isBuild ? '/feed#builds' : '/feed#news',
      tag: `article-${Buffer.from(item.link).toString('base64').slice(0, 32)}`,
    });
    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: sub.keys },
            payload,
            { TTL: 60 * 60 * 6 }
          );
        } catch (e) {
          console.log(`send failed (${e.statusCode}): ${sub.endpoint.slice(0, 60)}`);
          if (e.statusCode === 404 || e.statusCode === 410) dead.add(sub.endpoint);
        }
      })
    );
  }

  const liveSubs = subscriptions.filter((s) => !dead.has(s.endpoint));
  if (dead.size) await kvPut('subscriptions', liveSubs);

  for (const it of fresh) seen.add(it.link);
  await kvPut('push_state', {
    lastCheck: now.toISOString(),
    seen: [...seen].slice(-600),
  });
  console.log(`done; removed ${dead.size} dead subscriptions`);
}

main().catch((e) => {
  console.error('push-check failed:', e);
  process.exit(1);
});
