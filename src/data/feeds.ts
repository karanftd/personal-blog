// News sources for the /feed page.
// Add, remove, or reorder entries here — the feed page picks them up at build time.
// Each entry needs a name and an RSS/Atom feed URL.
export interface FeedSource {
  name: string;
  url: string;
  // max items to take from this source
  limit?: number;
}

export const FEED_SOURCES: FeedSource[] = [
  { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', limit: 12 },
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', limit: 10 },
  { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', limit: 10 },
  { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', limit: 10 },
];

// Total items shown on the page after merging + sorting by date.
export const FEED_TOTAL_LIMIT = 50;
