const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

const isEmojiGrapheme = (value) => /\p{Extended_Pictographic}/u.test(value);

export const splitLeadingEmoji = (label) => {
  const normalized = String(label ?? '').replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return { emoji: '', title: '' };
  }

  const segments = [...segmenter.segment(normalized)];
  const first = segments[0]?.segment ?? '';
  if (!isEmojiGrapheme(first)) {
    return { emoji: '', title: normalized };
  }

  const rest = normalized.slice(first.length).trimStart();
  return { emoji: first, title: rest };
};

export const titleStartsWithEmoji = (label) => Boolean(splitLeadingEmoji(label).emoji);
