/**
 * Representative + adversarial note bodies (criterion 1). Each is a
 * plausible §7.1 Markdown carrier body. `metaBlock` is the exact tail
 * that packages/domain/src/note-metadata.ts renders (rule + ew:metadata
 * fence); we test it both whole-body and via the strip seam.
 */

// Matches METADATA_OPEN / METADATA_CLOSE + renderMetadataBlock() shape.
export const META_OPEN = '<!-- ew:metadata -->'
export const META_CLOSE = '<!-- /ew:metadata -->'
export const META_BLOCK =
  `\n\n---\n\n${META_OPEN}\n\n` +
  `## Placements\n\n- Root (2)\n  - Sketches (1)\n\n` +
  `## Provenance\n\n- \`ref photo.png\` — imported 2026-07-01\n\n` +
  `## Timestamps\n\n- Created 2026-06-01\n- Modified 2026-07-01\n\n` +
  `${META_CLOSE}\n`

export const corpus = [
  { name: 'headings-1-6', body: '# H1\n\n## H2\n\n### H3\n\n#### H4\n\n##### H5\n\n###### H6' },
  { name: 'paragraphs', body: 'First paragraph with words.\n\nSecond paragraph here.' },
  { name: 'bullet-list', body: '- one\n- two\n- three' },
  { name: 'ordered-list', body: '1. first\n2. second\n3. third' },
  { name: 'nested-list', body: '- parent\n  - child\n  - child two\n- sibling' },
  { name: 'inline-emphasis', body: 'Some **bold**, some *italic*, and ~~struck~~ text.' },
  { name: 'inline-code', body: 'Call `foo()` then `bar()` inline.' },
  { name: 'code-fence-js', body: '```js\nconst x = 1\nfunction f() { return x }\n```' },
  { name: 'blockquote', body: '> a quoted line\n> second quoted line' },
  { name: 'wikilink-plain', body: 'See [[Dragon]] and [[Ancient City]] for lore.' },
  { name: 'wikilink-aliased', body: 'The [[Old Name|new label]] moved on.' },
  { name: 'wikilink-multibar', body: 'Edge case [[a|b|c]] keeps later bars.' },
  { name: 'embed', body: 'Here is art: ![[hero.png]] and ![[map.png|the map]].' },
  { name: 'links-in-list', body: '- [[Alpha]]\n- [[Beta|second]]\n- plain item' },
  { name: 'unicode', body: '# Café ☕ 日本語\n\nEmoji 🐉 and accents: naïve, résumé.' },
  { name: 'hr-in-prose', body: 'Above the line.\n\n---\n\nBelow the line.' },
  {
    name: 'kitchen-sink',
    body:
      '# Title\n\nIntro with [[Link]] and **bold**.\n\n' +
      '## Section\n\n- item [[A|a]]\n- item ![[img.png]]\n\n' +
      '> quote\n\n```py\nprint("hi")\n```\n\nEnd.',
  },
  // --- adversarial ---
  { name: 'adv-link-in-code-fence', body: '```\nnot a [[Link]] here\n```' },
  { name: 'adv-link-in-inline-code', body: 'Literal `[[NotALink]]` stays text.' },
  { name: 'adv-underscore-emphasis', body: 'Prefer _underscore italic_ and __underscore bold__.' },
  { name: 'adv-trailing-spaces-hardbreak', body: 'line one  \nline two after hard break' },
  { name: 'adv-escaped-chars', body: 'Escaped \\*not italic\\* and \\[not a link\\].' },
  { name: 'adv-star-bullets', body: '* star one\n* star two' },
  { name: 'adv-nested-emphasis', body: 'Mix of **bold _and italic_ together**.' },
  { name: 'adv-consecutive-blanklines', body: 'Para one.\n\n\n\nPara two after many blanks.' },
]
