// Scheduled push sender (GitHub Actions, every 30 min).
// Fetches the feed sources, diffs against KV state, and sends Web Push
// notifications to stored subscriptions for new items.
//
// State + subscriptions live in Cloudflare KV, reached through the site's own
// /api/push-admin endpoint (so no Cloudflare API token is needed).
//
// Env required:
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (e.g. "mailto:you@example.com")
//   PUSH_ADMIN_URL (e.g. "https://karanftd.com"), PUSH_ADMIN_SECRET
import webpush from 'web-push';
import Parser from 'rss-parser';
import fs from 'node:fs';

const {
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY,
  VAPID_SUBJECT,
  PUSH_ADMIN_URL,
  PUSH_ADMIN_SECRET,
} = process.env;

for (const k of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'PUSH_ADMIN_URL', 'PUSH_ADMIN_SECRET']) {
  if (!process.env[k]) {
    console.error(`missing env ${k}`);
    process.exit(1);
  }
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const adminHeaders = { Authorization: `Bearer ${PUSH_ADMIN_SECRET}` };

async function adminGet(key) {
  const r = await fetch(`${PUSH_ADMIN_URL}/api/push-admin?key=${key}`, { headers: adminHeaders });
  if (r.status === 401) throw new Error('push-admin: unauthorized (bad PUSH_ADMIN_SECRET?)');
  if (!r.ok) throw new Error(`push-admin GET ${key}: ${r.status}`);
  return (await r.json()).value;
}

async function adminPut(key, value) {
  const r = await fetch(`${PUSH_ADMIN_URL}/api/push-admin`, {
    method: 'PUT',
    headers: { ...adminHeaders, 'content-type': 'application/json' },
    body: JSON.stringify({ key, value }),
  });
  if (!r.ok) throw new Error(`push-admin PUT ${key}: ${r.status}`);
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
    adminGet('subscriptions').catch(() => []),
    adminGet('push_state').catch(() => null),
  ]);
  const subscriptions = Array.isArray(subs) ? subs.filter((s) => s && s.endpoint) : [];

  const now = new Date();

  // Manual test mode (workflow_dispatch with test=true): send a test push to
  // every subscription and exit. Fails loudly if nobody is subscribed.
  if (process.env.SEND_TEST === 'true') {
    const testSubs = await adminGet('subscriptions').catch(() => []);
    const live = Array.isArray(testSubs) ? testSubs.filter((s) => s && s.endpoint) : [];
    console.log(`test mode: subscriptions=${live.length}`);
    if (!live.length) {
      console.error('no subscriptions — tap "Enable notifications" on /feed first');
      process.exit(1);
    }
    const payload = JSON.stringify({
      title: '🔔 Test from Sonu',
      body: 'Web push is working — you’ll get pinged when new articles land.',
      url: '/feed',
      tag: 'push-test',
    });
    let ok = 0;
    for (const sub of live) {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload);
        ok++;
      } catch (e) {
        console.log(`test send failed (${e.statusCode})`);
      }
    }
    console.log(`test push sent to ${ok}/${live.length}`);
    process.exit(0);
  }

  if (!state) {
    // First run: seed state, don't blast notifications for old items.
    await adminPut('push_state', { lastCheck: now.toISOString(), seen: [] });
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
  if (dead.size) await adminPut('subscriptions', liveSubs);

  for (const it of fresh) seen.add(it.link);
  await adminPut('push_state', {
    lastCheck: now.toISOString(),
    seen: [...seen].slice(-600),
  });
  console.log(`done; removed ${dead.size} dead subscriptions`);
}

main().catch((e) => {
  console.error('push-check failed:', e);
  process.exit(1);
});
