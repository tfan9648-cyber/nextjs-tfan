/**
 * GET /api/reader/debug - Debug PDF parsing
 * Only for dev/debug - remove after fix confirmed
 */
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const results: any = {};
  
  try {
    const { extractPdfText } = await import('@/lib/pdf-extract');
    results.importOk = true;
    
    // Test with minimal PDF
    const minPdf = Buffer.from(
      '%PDF-1.0\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R/Resources<</Font<</F1 4 0 R>>>>/Contents 5 0 R>>endobj 4 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj 5 0 obj<</Length 44>>stream\nBT /F1 1 Tf 1 1 Td (Hello World) Tj ET\nendstream\nendobj\nxref\n0 6\n0000000000 65535 f \n0000000009 00000 n \n0000000058 00000 n \n0000000115 00000 n \n0000000266 00000 n \n0000000340 00000 n \ntrailer<</Size 6/Root 1 0 R>>\nstartxref\n434\n%%EOF',
      'ascii'
    );
    const text = await extractPdfText(minPdf);
    results.parseOk = true;
    results.textLength = text.length;
    results.textPreview = text.slice(0, 50);
  } catch (e: any) {
    results.importOk = false;
    results.error = e.message;
    results.stack = e.stack?.slice(0, 500);
  }

  // R2 check
  try {
    const { isR2Configured } = await import('@/lib/reader-r2');
    results.r2Configured = isR2Configured();
  } catch (e: any) {
    results.r2Error = e.message;
  }

  return NextResponse.json(results);
}
