/**
 * PDF text extraction helper for serverless environments.
 *
 * Uses pdfjs-dist directly with the "fake worker" (inline) mode.
 * This avoids needing to spawn a separate worker process, which
 * doesn't work reliably on Vercel serverless.
 *
 * Key trick: set globalThis.pdfjsWorker BEFORE importing pdf.mjs
 * so pdfjs uses inline worker mode instead of trying to load a file.
 */

let initialized = false;

async function ensureInitialized() {
  if (initialized) return;
  initialized = true;

  // 1. Polyfill DOMMatrix (required by pdfjs-dist)
  if (typeof globalThis.DOMMatrix === 'undefined') {
    try {
      const { DOMPoint, DOMMatrix, DOMRect } = require('@napi-rs/canvas/geometry');
      globalThis.DOMMatrix = DOMMatrix;
      globalThis.DOMPoint = DOMPoint;
      globalThis.DOMRect = DOMRect;
    } catch {
      // Minimal stub sufficient for text extraction
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

  // 2. Polyfill Path2D (suppress warnings)
  if (typeof globalThis.Path2D === 'undefined') {
    globalThis.Path2D = class Path2D {} as any;
  }

  // 3. Load worker module BEFORE pdf.mjs import.
  //    This makes pdfjs use inline "fake worker" mode — no file:// or http:// worker needed.
  if (!globalThis.pdfjsWorker) {
    globalThis.pdfjsWorker = await import('pdfjs-dist/legacy/build/pdf.worker.mjs');
  }
}

/**
 * Extract text from a PDF buffer.
 * Limits to first 100 pages to avoid timeout on Vercel Hobby (10s limit).
 */
export async function extractPdfText(buf: Buffer, maxPages: number = 100): Promise<string> {
  await ensureInitialized();

  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');

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
    }
  }

  await doc.destroy().catch(() => {});
  return pages.join('\n\n');
}
