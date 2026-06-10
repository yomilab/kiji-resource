import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { COMMON_CATEGORIES } from './lib/categories.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const requiredFiles = [
  'recommended.opml',
  ...COMMON_CATEGORIES.map((slug) => `feeds/${slug}.opml`),
  'feeds/recommend-1.opml',
  'feeds/recommend-2.opml',
  'feeds/recommend-all.opml',
  'feeds/hn-popular.opml',
];

const SPECIAL_FILES = new Set([
  'feeds/recommend-1.opml',
  'feeds/recommend-2.opml',
  'feeds/recommend-all.opml',
  'feeds/hn-popular.opml',
  'recommended.opml',
]);

const categoryXmlUrls = new Map();

const extractXmlUrls = (text) => {
  const urls = [];
  const matches = text.matchAll(/\sxmlUrl="([^"]+)"/g);
  for (const match of matches) {
    const url = match[1];
    if (!url.endsWith('.opml')) {
      urls.push(url);
    }
  }
  return urls;
};

const validateOpml = async (relativePath) => {
  const fullPath = path.join(root, relativePath);
  const text = await readFile(fullPath, 'utf8');
  const errors = [];

  if (!text.includes('<opml') || !text.includes('</opml>')) {
    errors.push('missing opml root');
  }

  if (!text.includes('<body') || !text.includes('</body>')) {
    errors.push('missing body');
  }

  const seenInFile = new Set();
  for (const url of extractXmlUrls(text)) {
    if (seenInFile.has(url)) {
      errors.push(`duplicate xmlUrl within file: ${url}`);
      continue;
    }
    seenInFile.add(url);

    if (SPECIAL_FILES.has(relativePath)) continue;

    const previous = categoryXmlUrls.get(url);
    if (previous) {
      errors.push(`duplicate xmlUrl also used in ${previous}: ${url}`);
    } else {
      categoryXmlUrls.set(url, relativePath);
    }
  }

  return errors.map((error) => `${relativePath}: ${error}`);
};

const discoverOpmlFiles = async () => {
  const feedDir = path.join(root, 'feeds');
  const feedFiles = await readdir(feedDir);
  return [
    'recommended.opml',
    ...feedFiles.filter((file) => file.endsWith('.opml')).map((file) => `feeds/${file}`),
  ].sort();
};

const discoveredFiles = await discoverOpmlFiles();
const missingRequired = requiredFiles.filter((file) => !discoveredFiles.includes(file));
const errors = [...missingRequired.map((file) => `${file}: required file is missing`)];

for (const file of discoveredFiles) {
  errors.push(...(await validateOpml(file)));
}

if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}

console.log(`Validated ${discoveredFiles.length} OPML files.`);
