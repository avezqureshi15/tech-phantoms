const SAFE_SCHEMES = new Set(["https:", "http:", "mailto:", "tel:"]);

/**
 * Whether a link from the model is safe to open. Model output is untrusted text: only ordinary web,
 * mail and phone links are allowed, never `javascript:`, `file:` or an app's own deep link.
 */
export function safeUrl(href: string): string | null {
  const trimmed = href.trim();
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(trimmed)?.[1]?.toLowerCase();
  return scheme && SAFE_SCHEMES.has(scheme) ? trimmed : null;
}

/**
 * While an answer is still arriving, a code block may be open (an odd number of ``` fences). Close
 * it for display so half a block does not swallow the rest of the screen's formatting.
 */
export function closeOpenFences(markdown: string): string {
  const fences = markdown.match(/^ {0,3}```/gm)?.length ?? 0;
  return fences % 2 === 1 ? `${markdown}\n\`\`\`` : markdown;
}
