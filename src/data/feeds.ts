// News sources for the /feed page.
// Add, remove, or reorder entries here — the feed page picks them up at build time.
// Each entry needs a name and an RSS/Atom feed URL.
export interface FeedSource {
  name: string;
  url: string;
  // max items to take from this source
  limit?: number;
}

// AI + tech news
export const NEWS_FEEDS: FeedSource[] = [
  { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', limit: 12 },
  { name: 'TechCrunch AI', url: 'https://techcrunch.com/category/artificial-intelligence/feed/', limit: 10 },
  { name: 'Simon Willison', url: 'https://simonwillison.net/atom/everything/', limit: 10 },
  { name: 'MIT Tech Review', url: 'https://www.technologyreview.com/feed/', limit: 8 },
  { name: 'Hugging Face', url: 'https://huggingface.co/blog/feed.xml', limit: 8 },
  { name: 'The Decoder', url: 'https://the-decoder.com/feed/', limit: 8 },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', limit: 8 },
];

// What people are building with Muse / AI — launches and build logs.
export const BUILDS_FEEDS: FeedSource[] = [
  { name: 'DEV · claude', url: 'https://dev.to/feed/tag/claude', limit: 12 },
  { name: 'Show HN', url: 'https://news.ycombinator.com/showrss', limit: 12 },
];

// Total items shown per section after merging + sorting by date.
export const NEWS_TOTAL_LIMIT = 50;
export const BUILDS_TOTAL_LIMIT = 30;
