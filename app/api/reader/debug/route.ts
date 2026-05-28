/**
 * GET /api/reader/debug - Debug PDF parsing
 * Only for dev/debug - remove in production
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const results: any = {};
  
  // Test 1: Can we import pdf-parse?
  try {
    const pdfModule = await import('pdf-parse');
    results.importOk = true;
    results.exports = Object.keys(pdfModule);
    results.hasPDFParse = typeof pdfModule.PDFParse === 'function';
  } catch (e: any) {
    results.importOk = false;
    results.importError = e.message;
  }

  // Test 2: Can we instantiate PDFParse with a minimal PDF?
  if (results.hasPDFParse) {
    try {
      const { PDFParse } = await import('pdf-parse');
      const minPdf = Buffer.from(
        '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj 4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj 5 0 obj<</Length 44>>stream\nBT /F1 1 Tf 1 1 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000340 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n434\n%%EOF',
        'ascii'
      );
      const parser = new PDFParse({ data: minPdf });
      const result = await parser.getText();
      results.parseOk = true;
      results.textLength = result.text?.length;
      results.textPreview = result.text?.slice(0, 50);
      await parser.destroy().catch(() => {});
    } catch (e: any) {
      results.parseOk = false;
      results.parseError = e.message;
      results.parseStack = e.stack?.slice(0, 500);
    }
  }

  // Test 3: R2 config check
  try {
    const { isR2Configured } = await import('@/lib/reader-r2');
    results.r2Configured = isR2Configured();
  } catch (e: any) {
    results.r2Error = e.message;
  }

  return NextResponse.json(results);
}

// POST: upload a test PDF and extract text inline
export async function POST(req: NextRequest) {
  const results: any = {};
  try {
    const minPdf = Buffer.from(
      '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj 4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj 5 0 obj<</Length 44>>stream\nBT /F1 1 Tf 1 1 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000340 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n434\n%%EOF',
      'ascii'
    );
    
    // Replicate exact extractText logic from upload route
    const mime = 'application/pdf';
    const filename = 'test.pdf';
    const lower = filename.toLowerCase();
    
    results.mimeMatch = mime === 'application/pdf';
    results.extMatch = lower.endsWith('.pdf');
    
    const { PDFParse } = await import('pdf-parse');
    results.constructorType = typeof PDFParse;
    
    const parser = new PDFParse({ data: minPdf });
    results.parserCreated = true;
    
    const result = await parser.getText();
    results.text = result.text;
    results.textLength = result.text?.length;
    
    await parser.destroy().catch(() => {});
    results.success = true;
  } catch (e: any) {
    results.error = e.message;
    results.stack = e.stack?.slice(0, 500);
  }
  return NextResponse.json(results);
}
