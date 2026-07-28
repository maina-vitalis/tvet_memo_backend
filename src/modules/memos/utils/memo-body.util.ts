export type MemoBodyFormat = 'plain' | 'html';

const ALLOWED_TAGS = new Set([
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'ul',
  'ol',
  'li',
  'h1',
  'h2',
  'h3',
  'h4',
  'blockquote',
  'a',
  'span',
  'div',
]);

const GLOBAL_STRIP = /<[^>]+>/g;

/** Strip HTML tags for push previews and feed excerpts. */
export function stripMemoHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/p>/gi, ' ')
    .replace(GLOBAL_STRIP, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Minimal HTML sanitizer for memo bodies — allow basic formatting only.
 * Strips scripts, event handlers, and unknown tags.
 */
export function sanitizeMemoHtml(html: string): string {
  let sanitized = html
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  sanitized = sanitized.replace(
    /<\/?([a-zA-Z0-9]+)([^>]*)>/g,
    (match, tagName: string, attrs: string) => {
      const tag = tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        return '';
      }

      if (tag === 'a') {
        const hrefMatch = /href\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(
          attrs,
        );
        const href = hrefMatch?.[2] ?? hrefMatch?.[3] ?? hrefMatch?.[4] ?? '';
        if (!/^https?:\/\//i.test(href)) {
          return match.startsWith('</') ? '</a>' : '<a>';
        }
        return `<a href="${href.replace(/"/g, '&quot;')}" rel="noopener noreferrer">`;
      }

      return match.startsWith('</') ? `</${tag}>` : `<${tag}>`;
    },
  );

  return sanitized.trim();
}

export function normalizeMemoBody(
  body: string,
  bodyFormat?: MemoBodyFormat,
): { body: string; bodyFormat: MemoBodyFormat } {
  const format = bodyFormat ?? 'plain';

  if (format === 'html') {
    const sanitized = sanitizeMemoHtml(body);
    if (!sanitized) {
      return { body: '', bodyFormat: 'plain' };
    }
    return { body: sanitized, bodyFormat: 'html' };
  }

  return { body: body.trim(), bodyFormat: 'plain' };
}

export function memoBodyPreview(body: string, bodyFormat?: MemoBodyFormat): string {
  if (bodyFormat === 'html') {
    return stripMemoHtml(body);
  }
  return body;
}
