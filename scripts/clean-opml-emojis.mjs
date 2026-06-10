#!/usr/bin/env node
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { splitLeadingEmoji } from './lib/emoji-label.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const xmlUnescape = (value) =>
  String(value)
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

const readAttr = (attrs, name) => {
  const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
  return match ? xmlUnescape(match[1]) : null;
};

const upsertAttr = (attrs, name, value) => {
  const escaped = xmlEscape(value);
  const pattern = new RegExp(`${name}="[^"]*"`);
  if (pattern.test(attrs)) {
    return attrs.replace(pattern, `${name}="${escaped}"`);
  }
  return `${attrs} ${name}="${escaped}"`;
};

const removeAttr = (attrs, name) => attrs.replace(new RegExp(`\\s*${name}="[^"]*"`), '');

const resolveEmojiAndTitle = (configuredEmoji, label) => {
  const fromConfig = configuredEmoji?.trim() ?? '';
  const { emoji: leadingEmoji, title: strippedTitle } = splitLeadingEmoji(label);

  if (fromConfig) {
    if (leadingEmoji === fromConfig) {
      return { emoji: fromConfig, title: strippedTitle || label };
    }
    if (label.startsWith(`${fromConfig} `)) {
      return { emoji: fromConfig, title: label.slice(fromConfig.length).trimStart() };
    }
    return { emoji: fromConfig, title: label };
  }

  if (leadingEmoji) {
    return { emoji: leadingEmoji, title: strippedTitle || label };
  }

  return { emoji: '', title: label };
};

const processOutlineTag = (line) => {
  const match = line.match(/^(\s*)<outline(\s+[^>]*?)(\/?)>(\s*)$/);
  if (!match) {
    return line;
  }

  const [, indent, rawAttrs, selfClosing] = match;
  let attrs = rawAttrs.trim();
  const xmlUrl = readAttr(attrs, 'xmlUrl');
  const isFeed = /type="rss"/.test(attrs) && xmlUrl && !xmlUrl.endsWith('.opml');
  const stationNameAttr = readAttr(attrs, 'kijiStationName');

  if (!isFeed && (stationNameAttr !== null || !xmlUrl)) {
    const currentName = stationNameAttr ?? readAttr(attrs, 'title') ?? readAttr(attrs, 'text') ?? '';
    const configuredEmoji = readAttr(attrs, 'kijiEmoji')
      || readAttr(attrs, 'kijiStationEmoji');
    const { emoji, title } = resolveEmojiAndTitle(configuredEmoji, currentName);
    const cleanTitle = title || currentName;
    const needsUpdate = Boolean(emoji)
      || cleanTitle !== currentName
      || (emoji && !configuredEmoji)
      || (stationNameAttr !== null && cleanTitle !== stationNameAttr);

    if (!needsUpdate) {
      return line;
    }

    if (stationNameAttr !== null || emoji) {
      attrs = upsertAttr(attrs, 'kijiStationName', cleanTitle);
    }
    attrs = upsertAttr(attrs, 'title', cleanTitle);
    attrs = upsertAttr(attrs, 'text', cleanTitle);
    attrs = removeAttr(removeAttr(attrs, 'kijiStationEmoji'), 'kijiFeedEmoji');
    attrs = emoji ? upsertAttr(attrs, 'kijiEmoji', emoji) : removeAttr(attrs, 'kijiEmoji');

    return `${indent}<outline ${attrs.trim()}>`;
  }

  if (!isFeed) {
    return line;
  }

  const currentTitle = readAttr(attrs, 'title') ?? readAttr(attrs, 'text') ?? '';
  const configuredEmoji = readAttr(attrs, 'kijiEmoji')
    || readAttr(attrs, 'kijiFeedEmoji');
  const { emoji, title } = resolveEmojiAndTitle(configuredEmoji, currentTitle);
  const cleanTitle = title || currentTitle;
  const needsUpdate = Boolean(emoji) && (cleanTitle !== currentTitle || !configuredEmoji);

  if (!needsUpdate) {
    return line;
  }

  attrs = upsertAttr(attrs, 'title', cleanTitle);
  attrs = upsertAttr(attrs, 'text', cleanTitle);
  attrs = removeAttr(removeAttr(attrs, 'kijiFeedEmoji'), 'kijiStationEmoji');
  attrs = emoji ? upsertAttr(attrs, 'kijiEmoji', emoji) : removeAttr(attrs, 'kijiEmoji');

  const closing = selfClosing ? ' />' : '>';
  return `${indent}<outline ${attrs.trim()}${closing}`;
};

const cleanOpmlText = (text) =>
  text
    .split('\n')
    .map((line) => (line.includes('<outline') ? processOutlineTag(line) : line))
    .join('\n');

const discoverOpmlFiles = async () => {
  const files = ['recommended.opml'];
  const feedDir = path.join(root, 'feeds');
  const feedFiles = await readdir(feedDir);
  files.push(...feedFiles.filter((file) => file.endsWith('.opml')).map((file) => path.join('feeds', file)));
  return files.sort();
};

const main = async () => {
  const files = await discoverOpmlFiles();
  let changedFiles = 0;

  for (const relativePath of files) {
    const fullPath = path.join(root, relativePath);
    const original = await readFile(fullPath, 'utf8');
    const cleaned = cleanOpmlText(original);
    if (cleaned !== original) {
      await writeFile(fullPath, cleaned, 'utf8');
      changedFiles += 1;
      console.log(`Updated ${relativePath}`);
    }
  }

  console.log(`Cleaned emoji labels in ${changedFiles} of ${files.length} OPML files.`);
};

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
