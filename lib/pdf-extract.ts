/**
 * PDF text extraction helper.
 *
 * pdf-parse v2 (pdfjs-dist) requires DOMMatrix in globalThis.
 * On Vercel serverless (no browser globals), we polyfill from
 * @napi-rs/canvas/geometry which is a pure JS implementation.
 */

let polyfilled = false;

function ensureDOMPolyfill() {
  if (polyfilled) return;
  polyfilled = true;

  if (typeof globalThis.DOMMatrix === 'undefined') {
    try {
      // Pure JS polyfill — no native binary needed
      const { DOMPoint, DOMMatrix, DOMRect } = require('@napi-rs/canvas/geometry');
      globalThis.DOMMatrix = DOMMatrix;
      globalThis.DOMPoint = DOMPoint;
      globalThis.DOMRect = DOMRect;
    } catch (e) {
      // Fallback: minimal DOMMatrix stub (identity only)
      console.warn('[pdf-extract] @napi-rs/canvas/geometry not available, using stub');
      globalThis.DOMMatrix = class DOMMatrix {
        constructor(init?: any) {
          const v = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
          this.a = v[0]; this.b = v[1]; this.c = v[2];
          this.d = v[3]; this.e = v[4]; this.f = v[5];
          this.m11 = v[0]; this.m12 = v[1]; this.m21 = v[2];
          this.m22 = v[3]; this.m41 = v[4]; this.m42 = v[5];
          this.is2D = true; this.isIdentity = false;
        }
        [key: string]: any;
      } as any;
    }
  }
}

/**
 * Extract text from a PDF buffer using pdf-parse v2.
 */
export async function extractPdfText(buf: Buffer): Promise<string> {
  ensureDOMPolyfill();
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buf });
  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy().catch(() => {});
  }
}
