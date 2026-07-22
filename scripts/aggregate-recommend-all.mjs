#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFeedOutline, buildOpmlDocument, buildStationOutline, sortFeedsByLabel } from './lib/opml.mjs';
import { COMMON_CATEGORIES } from './lib/categories.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const CATEGORY_LABELS = {
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

const xmlUnescape = (value) =>
  String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const parseFeedOutlines = (opmlText) => {
  const feeds = [];
  const pattern = /<outline\b([^>]*type="rss"[^>]*)\/>/g;
  let match;

  while ((match = pattern.exec(opmlText)) !== null) {
    const attrs = match[1];
    const readAttr = (name) => {
      const attrMatch = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return attrMatch ? xmlUnescape(attrMatch[1]) : '';
    };

    const xmlUrl = readAttr('xmlUrl');
    if (!xmlUrl || xmlUrl.endsWith('.opml')) continue;

    feeds.push({
      title: readAttr('title') || readAttr('text') || xmlUrl,
      url: xmlUrl,
      emoji: readAttr('kijiEmoji') || readAttr('kijiFeedEmoji') || readAttr('kijiStationEmoji'),
    });
  }

  return feeds;
};

export const buildRecommendedOpml = async (outputRoot = root) => {
  const feedsDir = path.join(outputRoot, 'feeds');
  const bodyLines = [];
  let stationCount = 0;
  let feedCount = 0;

  for (const slug of COMMON_CATEGORIES) {
    const text = await readFile(path.join(feedsDir, `${slug}.opml`), 'utf8');
    const feeds = parseFeedOutlines(text);
    if (feeds.length === 0) continue;
    bodyLines.push(...buildStationOutline({ name: CATEGORY_LABELS[slug], emoji: '' }, feeds));
    stationCount += 1;
    feedCount += feeds.length;
  }

  const document = buildOpmlDocument('KiJi Recommended Feeds', bodyLines, {
    includeDateModified: false,
  });
  const outputPath = path.join(outputRoot, 'recommended.opml');
  await writeFile(outputPath, document, 'utf8');

  return { outputPath, stationCount, feedCount };
};

export const aggregateRecommendAll = async (outputRoot = root) => {
  const feedsDir = path.join(outputRoot, 'feeds');
  const byUrl = new Map();

  for (const slug of COMMON_CATEGORIES) {
    const filePath = path.join(feedsDir, `${slug}.opml`);
    const text = await readFile(filePath, 'utf8');
    for (const feed of parseFeedOutlines(text)) {
      if (!byUrl.has(feed.url)) {
        byUrl.set(feed.url, feed);
      }
    }
  }

  const mergedFeeds = sortFeedsByLabel([...byUrl.values()]);
  const bodyLines = mergedFeeds.map((feed) => `  ${buildFeedOutline(feed)}`);
  const document = buildOpmlDocument('KiJi Recommend All', bodyLines, {
    includeDateModified: false,
  });
  const outputPath = path.join(feedsDir, 'recommend-all.opml');
  await writeFile(outputPath, document, 'utf8');

  return {
    outputPath,
    feedCount: mergedFeeds.length,
    sourceCategories: COMMON_CATEGORIES.length,
  };
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = await aggregateRecommendAll();
  console.log(`Wrote ${result.outputPath} (${result.feedCount} feeds from ${result.sourceCategories} categories)`);
  const recommended = await buildRecommendedOpml();
  console.log(`Wrote ${recommended.outputPath} (${recommended.feedCount} feeds in ${recommended.stationCount} category stations)`);
}
