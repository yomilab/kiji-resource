const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const normalizeLabel = (value) => {
  if (!value) return '';
  return String(value).replace(/\s+/g, ' ').trim();
};

export const buildFeedOutline = (feed) => {
  const title = normalizeLabel(feed.title) || normalizeLabel(feed.url);
  const emoji = normalizeLabel(feed.emoji);
  const attributes = [
    'type="rss"',
    `title="${xmlEscape(title)}"`,
    `text="${xmlEscape(title)}"`,
    `xmlUrl="${xmlEscape(feed.url)}"`,
    `htmlUrl="${xmlEscape(feed.url)}"`,
  ];

  if (emoji) {
    attributes.push(`kijiEmoji="${xmlEscape(emoji)}"`);
  }

  return `<outline ${attributes.join(' ')} />`;
};

export const buildStationOutline = (tag, feeds) => {
  const stationName = normalizeLabel(tag.name);
  const emoji = normalizeLabel(tag.emoji);
  const stationAttrs = [
    `title="${xmlEscape(stationName)}"`,
    `text="${xmlEscape(stationName)}"`,
    `kijiStationName="${xmlEscape(stationName)}"`,
  ];

  if (emoji) {
    stationAttrs.push(`kijiEmoji="${xmlEscape(emoji)}"`);
  }

  const feedLines = feeds.map((feed) => `    ${buildFeedOutline(feed)}`);
  return [`  <outline ${stationAttrs.join(' ')}>`, ...feedLines, '  </outline>'];
};

export const buildOpmlDocument = (title, bodyLines) => {
  const dateModified = new Date().toUTCString();
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<opml version="2.0">',
    '<head>',
    `<title>${xmlEscape(title)}</title>`,
    `<dateModified>${xmlEscape(dateModified)}</dateModified>`,
    '</head>',
    '<body>',
    ...bodyLines,
    '</body>',
    '</opml>',
    '',
  ].join('\n');
};

export const sortFeedsByLabel = (feeds) =>
  [...feeds].sort((a, b) => {
    const aLabel = normalizeLabel(a.emoji ? `${a.emoji} ${a.title}` : a.title);
    const bLabel = normalizeLabel(b.emoji ? `${b.emoji} ${b.title}` : b.title);
    return aLabel.localeCompare(bLabel, undefined, { sensitivity: 'base' });
});

export const sortTagsByName = (tags) =>
  [...tags].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
