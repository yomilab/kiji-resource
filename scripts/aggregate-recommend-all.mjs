#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildFeedOutline, buildOpmlDocument, sortFeedsByLabel } from './lib/opml.mjs';
import { COMMON_CATEGORIES } from './lib/categories.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const parseFeedOutlines = (opmlText) => {
  const feeds = [];
  const pattern = /<outline\b([^>]*type="rss"[^>]*)\/>/g;
  let match;

  while ((match = pattern.exec(opmlText)) !== null) {
    const attrs = match[1];
    const readAttr = (name) => {
      const attrMatch = attrs.match(new RegExp(`${name}="([^"]*)"`));
      return attrMatch ? attrMatch[1] : '';
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
}
