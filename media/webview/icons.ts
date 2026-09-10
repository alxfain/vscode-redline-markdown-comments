/** Inline UI icons. */

const svg = (size: number, body: string, extra = "") =>
  `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" ${extra} aria-hidden="true">${body}</svg>`;

const BUBBLE =
  '<path d="M2 4.2A1.7 1.7 0 0 1 3.7 2.5h8.6A1.7 1.7 0 0 1 14 4.2v5.1a1.7 1.7 0 0 1-1.7 1.7H6.6L3.4 13.5v-2.5h-.4A1.7 1.7 0 0 1 2 9.3z"/>';

export const ICON = {
  chip: svg(14, BUBBLE, 'stroke-width="1.4"'),
  add: svg(13, BUBBLE, 'stroke-width="1.5"'),
  send: svg(13, '<path d="M8 12.5V3.5M8 3.5 4.5 7M8 3.5 11.5 7"/>', 'stroke-width="1.8"'),
  edit: svg(13, '<path d="M11.2 2.6l2.2 2.2-8 8H3.2v-2.2z"/>', 'stroke-width="1.5"'),
  remove: svg(13, '<path d="M3 4.2h10M6.4 4.2V2.8h3.2v1.4M4.4 4.2l.6 8.4h6l.6-8.4"/>', 'stroke-width="1.5"'),
};
