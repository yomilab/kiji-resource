#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

import {
  buildFeedOutline,
  buildOpmlDocument,
  buildStationOutline,
  sortFeedsByLabel,
  sortTagsByName,
} from './lib/opml.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { COMMON_CATEGORIES, TAG_TO_CATEGORY } from './lib/categories.mjs';

const defaultDbPath =
  process.env.KIJI_DB_PATH ||
  path.join(process.env.HOME || '', 'Library/Application Support/com.yomilab.kiji/kiji.db');

const resolveDbPath = () => {
  const configured = process.argv[2] || defaultDbPath;
  return path.resolve(configured);
};

const hasSuccessfulFetch = (feed) => Boolean(feed.last_fetched);

export const loadFeedsFromDb = (dbPath) => {
  const db = new DatabaseSync(dbPath, { readOnly: true });

  const feeds = db
    .prepare(
      `SELECT id, title, url, emoji, last_fetched, tags_json
       FROM feeds
       ORDER BY title COLLATE NOCASE`,
    )
    .all()
    .map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      emoji: row.emoji || '',
      last_fetched: row.last_fetched,
      tags: JSON.parse(row.tags_json || '[]'),
    }));

  const tags = db
    .prepare('SELECT name, emoji FROM tags ORDER BY name COLLATE NOCASE')
    .all()
    .map((row) => ({
      name: row.name,
      emoji: row.emoji || '',
      feedIds: db
        .prepare('SELECT feed_id FROM feed_tags WHERE tag_name = ? ORDER BY feed_id')
        .all(row.name)
        .map((entry) => entry.feed_id),
    }));

  db.close();
  return { feeds, tags };
};

export const resolveCategoryForFeed = (feed) => {
  for (const tagName of feed.tags) {
    const category = TAG_TO_CATEGORY[tagName];
    if (category) return category;
  }
  return null;
};

export const buildStationedOpml = (title, feeds, tags) => {
  const feedById = new Map(feeds.map((feed) => [feed.id, feed]));
  const tagByName = new Map(tags.map((tag) => [tag.name, tag]));
  const stationNamesByFeedId = new Map();

  for (const tag of tags) {
    for (const feedId of tag.feedIds) {
      const existing = stationNamesByFeedId.get(feedId) || [];
      existing.push(tag.name);
      stationNamesByFeedId.set(feedId, existing);
    }
  }

  const bodyLines = [];

  for (const tag of sortTagsByName(tags)) {
    const memberFeeds = sortFeedsByLabel(
      tag.feedIds.map((feedId) => feedById.get(feedId)).filter(Boolean),
    );
    if (memberFeeds.length === 0) continue;
    bodyLines.push(...buildStationOutline(tag, memberFeeds));
  }

  const unstationedFeeds = sortFeedsByLabel(
    feeds.filter((feed) => {
      const stationNames = stationNamesByFeedId.get(feed.id) || [];
      return stationNames.map((name) => tagByName.get(name)).filter(Boolean).length === 0;
    }),
  );

  for (const feed of unstationedFeeds) {
    bodyLines.push(`  ${buildFeedOutline(feed)}`);
  }

  return buildOpmlDocument(title, bodyLines);
};

export const buildFlatCategoryOpml = (title, feeds) => {
  const bodyLines = sortFeedsByLabel(feeds).map((feed) => `  ${buildFeedOutline(feed)}`);
  return buildOpmlDocument(title, bodyLines);
};

export const buildRecommendedIndexOpml = () => {
  const categoryLabels = {
    tech: 'Tech',
    daily: 'Daily',
    ai: 'AI',
    security: 'Security',
    dev: 'Dev',
    coins: 'Coins',
    news: 'News',
    korea: 'Korea',
    japan: 'Japan',
  };

  const commonLines = COMMON_CATEGORIES.map(
    (slug) =>
      `  <outline text="${categoryLabels[slug]}" title="${categoryLabels[slug]}" type="rss" xmlUrl="feeds/${slug}.opml" />`,
  );

  const specialLines = [
    '  <outline text="HN Popular" title="HN Popular" type="rss" xmlUrl="feeds/hn-popular.opml" />',
    '  <outline text="Recommend 1" title="Recommend 1" type="rss" xmlUrl="feeds/recommend-1.opml" />',
    '  <outline text="Recommend 2" title="Recommend 2" type="rss" xmlUrl="feeds/recommend-2.opml" />',
    '  <outline text="Recommend All" title="Recommend All" type="rss" xmlUrl="feeds/recommend-all.opml" />',
  ];

  return buildOpmlDocument('KiJi Recommended Feeds', [...commonLines, ...specialLines]);
};

export const exportFromAppDb = async (dbPath, outputRoot = root) => {
  const { feeds, tags } = loadFeedsFromDb(dbPath);
  const fetchedFeeds = feeds.filter(hasSuccessfulFetch);

  const categoryBuckets = Object.fromEntries(COMMON_CATEGORIES.map((slug) => [slug, []]));

  for (const feed of fetchedFeeds) {
    const category = resolveCategoryForFeed(feed);
    if (category) {
      categoryBuckets[category].push(feed);
    }
  }

  const feedsDir = path.join(outputRoot, 'feeds');
  await mkdir(feedsDir, { recursive: true });

  const writes = [];

  for (const slug of COMMON_CATEGORIES) {
    const categoryFeeds = categoryBuckets[slug];
    const title = `KiJi ${slug.charAt(0).toUpperCase()}${slug.slice(1)} Feeds`;
    writes.push(
      writeFile(
        path.join(feedsDir, `${slug}.opml`),
        buildFlatCategoryOpml(title, categoryFeeds),
        'utf8',
      ),
    );
  }

  writes.push(
    writeFile(
      path.join(feedsDir, 'recommend-1.opml'),
      buildStationedOpml('KiJi Recommend 1 (all app feeds)', feeds, tags),
      'utf8',
    ),
    writeFile(
      path.join(feedsDir, 'recommend-2.opml'),
      buildStationedOpml('KiJi Recommend 2 (successfully fetched)', fetchedFeeds, tags),
      'utf8',
    ),
    writeFile(path.join(outputRoot, 'recommended.opml'), buildRecommendedIndexOpml(), 'utf8'),
  );

  await Promise.all(writes);

  const stats = {
    total: feeds.length,
    fetched: fetchedFeeds.length,
    neverFetched: feeds.length - fetchedFeeds.length,
    byCategory: Object.fromEntries(
      COMMON_CATEGORIES.map((slug) => [slug, categoryBuckets[slug].length]),
    ),
  };

  return stats;
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dbPath = resolveDbPath();
  const stats = await exportFromAppDb(dbPath);
  console.log(`Exported from ${dbPath}`);
  console.log(`Total feeds: ${stats.total}`);
  console.log(`Successfully fetched: ${stats.fetched}`);
  console.log(`Never fetched (excluded from categories): ${stats.neverFetched}`);
  for (const [slug, count] of Object.entries(stats.byCategory)) {
    console.log(`  ${slug}: ${count}`);
  }
  console.log('Wrote category OPML files, recommend-1, recommend-2, and recommended.opml');
  console.log('Run npm run aggregate to build recommend-all.opml');
}
