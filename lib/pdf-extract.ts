/**
 * PDF text extraction helper.
 *
 * Uses pdfjs-dist directly (legacy build) instead of the pdf-parse wrapper,
 * which has ESM bundling issues on Vercel serverless.
 *
 * DOMMatrix polyfill is required for pdfjs-dist to work in Node.js.
 */

let polyfilled = false;

function ensureDOMPolyfill() {
  if (polyfilled) return;
  polyfilled = true;

  if (typeof globalThis.DOMMatrix === 'undefined') {
    try {
      // @napi-rs/canvas/geometry is pure JS — works everywhere
      const { DOMPoint, DOMMatrix, DOMRect } = require('@napi-rs/canvas/geometry');
      globalThis.DOMMatrix = DOMMatrix;
      globalThis.DOMPoint = DOMPoint;
      globalThis.DOMRect = DOMRect;
    } catch {
      // Fallback: minimal DOMMatrix stub sufficient for pdfjs text extraction
      globalThis.DOMMatrix = class DOMMatrix {
        a: number; b: number; c: number; d: number; e: number; f: number;
        m11: number; m12: number; m21: number; m22: number; m41: number; m42: number;
        is2D: boolean; isIdentity: boolean;
        constructor(init?: any) {
          const v = Array.isArray(init) ? init : [1, 0, 0, 1, 0, 0];
          this.a = v[0]; this.b = v[1]; this.c = v[2];
          this.d = v[3]; this.e = v[4]; this.f = v[5];
          this.m11 = v[0]; this.m12 = v[1]; this.m21 = v[2];
          this.m22 = v[3]; this.m41 = v[4]; this.m42 = v[5];
          this.is2D = true; this.isIdentity = false;
        }
      } as any;
    }
  }

  // Suppress pdfjs-dist warnings about missing Path2D
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {
      constructor() {}
      addPath() {}
      closePath() {}
      moveTo() {}
      lineTo() {}
      bezierCurveTo() {}
      quadraticCurveTo() {}
      arc() {}
      arcTo() {}
      ellipse() {}
      rect() {}
    } as any;
  }
}

/**
 * Extract text from a PDF buffer.
 * Limits to first 100 pages to avoid timeout on Vercel Hobby (10s limit).
 */
export async function extractPdfText(buf: Buffer, maxPages: number = 100): Promise<string> {
  ensureDOMPolyfill();

  // Use legacy build (CJS-compatible) to avoid ESM bundling issues on Vercel
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

  // Set workerSrc to the actual worker file path.
  // On Vercel serverless, we need an absolute file:// URL.
  // Use require.resolve to find the actual path at runtime.
  try {
    const workerPath = require.resolve('pdfjs-dist/legacy/build/pdf.worker.mjs');
    pdfjsLib.GlobalWorkerOptions.workerSrc = `file://${workerPath}`;
  } catch {
    // If resolve fails, try a relative path
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdfjs-dist/legacy/build/pdf.worker.mjs';
  }

  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buf),
    useSystemFonts: true,
    disableFontFace: true,
  });

  const doc = await loadingTask.promise;
  const numPages = Math.min(doc.numPages, maxPages);
  const pages: string[] = [];

  for (let i = 1; i <= numPages; i++) {
    try {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item: any) => {
          if (item.str !== undefined) {
            // Add newline if hasEOL
            return item.hasEOL ? item.str + '\n' : item.str;
          }
          return '';
        })
        .join('');
      if (pageText.trim()) {
        pages.push(pageText);
      }
    } catch (pageErr: any) {
      console.warn(`[pdf-extract] page ${i} failed:`, pageErr?.message);
      // Continue with other pages
    }
  }

  await doc.destroy().catch(() => {});

  return pages.join('\n\n');
}
