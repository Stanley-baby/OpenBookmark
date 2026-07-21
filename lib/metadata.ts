export interface PageMetadata {
  title: string;
  description: string;
  coverUrl: string;
}

export function readPageMetadata(): PageMetadata {
  const meta = (...selectors: string[]) => {
    for (const selector of selectors) {
      const content = document.querySelector<HTMLMetaElement>(selector)?.content.trim();
      if (content) return content;
    }
    return '';
  };

  let jsonTitle = '';
  let jsonDescription = '';
  let jsonImage = '';

  for (const script of document.querySelectorAll<HTMLScriptElement>('script[type="application/ld+json"]')) {
    try {
      const parsed: unknown = JSON.parse(script.textContent || 'null');
      const roots = Array.isArray(parsed) ? parsed : [parsed];
      const nodes = roots.flatMap((root) => {
        if (!root || typeof root !== 'object') return [];
        const graph = (root as Record<string, unknown>)['@graph'];
        return Array.isArray(graph) ? graph : [root];
      });

      for (const node of nodes) {
        if (!node || typeof node !== 'object') continue;
        const value = node as Record<string, unknown>;
        jsonTitle ||= typeof value.name === 'string' ? value.name : typeof value.headline === 'string' ? value.headline : '';
        jsonDescription ||= typeof value.description === 'string' ? value.description : '';
        const image = Array.isArray(value.image) ? value.image[0] : value.image;
        jsonImage ||= typeof image === 'string' ? image : image && typeof image === 'object' && typeof (image as Record<string, unknown>).url === 'string'
          ? String((image as Record<string, unknown>).url)
          : '';
      }
    } catch {
      // Malformed structured data is optional metadata; other sources still apply.
    }
  }

  const imageCandidate = Array.from(document.images).find((image) => {
    const source = image.currentSrc || image.src;
    if (!source || /\.svg(?:$|[?#])/i.test(source) || image.closest('header, footer, aside')) return false;
    const style = getComputedStyle(image);
    const bounds = image.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' && bounds.width > 100 && bounds.height > 100;
  });

  const cover = meta('meta[name="twitter:image"]', 'meta[property="og:image"]') || jsonImage || imageCandidate?.currentSrc || imageCandidate?.src || '';
  return {
    title: (meta('meta[name="twitter:title"]', 'meta[property="og:title"]') || jsonTitle || document.title).slice(0, 1_000),
    description: (meta('meta[name="twitter:description"]', 'meta[property="og:description"]', 'meta[name="description"]') || jsonDescription).slice(0, 10_000),
    coverUrl: cover ? new URL(cover, document.baseURI).href : '',
  };
}
