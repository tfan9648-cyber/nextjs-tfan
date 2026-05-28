/**
 * POST /api/reader/files/upload - 上传文件（专门 path，逻辑同 files/route.ts 的 POST）
 *
 * 存储策略：优先 Cloudflare R2；R2 未配置时 fallback 到本地 /tmp/reader-uploads/。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader, rateLimit } from '@/lib/reader-auth';
import {
  isR2Configured,
  putR2Object,
  buildR2Key,
} from '@/lib/reader-r2';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const UPLOAD_DIR = '/tmp/reader-uploads';
const MAX_SIZE = 50 * 1024 * 1024; // 50 MB

async function extractText(buf: Buffer, mime: string, filename: string): Promise<string> {
  try {
    if (mime === 'application/pdf' || filename.toLowerCase().endsWith('.pdf')) {
      console.log(`[upload] extracting PDF text from "${filename}" (${buf.length} bytes)`);
      // pdf-parse v2: new PDFParse({ data }).getText() — no default export anymore
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        console.log(`[upload] PDF extracted: ${result.text?.length || 0} chars`);
        return result.text || '';
      } finally {
        await parser.destroy().catch(() => {});
      }
    }
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx')
    ) {
      console.log(`[upload] extracting DOCX text from "${filename}"`);
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value || '';
    }
    if (mime?.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md')) {
      return buf.toString('utf-8');
    }
    console.log(`[upload] unsupported mime for extraction: ${mime}, file: ${filename}`);
  } catch (e: any) {
    console.error(`[upload] text extraction failed for "${filename}":`, e.message, e.stack?.slice(0, 300));
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    if (!rateLimit(`upload:${auth.deviceId}`, 30, 60_000)) {
      return NextResponse.json({ error: 'rate limited' }, { status: 429 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'file too large (max 50MB)' }, { status: 413 });

    const buf = Buffer.from(await file.arrayBuffer());
    const mime = file.type || 'application/octet-stream';

    // 存储 —— 优先 R2，未配置时本地兜底
    let r2Key: string;
    if (isR2Configured()) {
      r2Key = buildR2Key(auth.deviceId, file.name);
      await putR2Object(r2Key, buf, mime);
    } else {
      console.log('[upload] R2 not configured, using local storage');
      await mkdir(UPLOAD_DIR, { recursive: true });
      r2Key = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      await writeFile(path.join(UPLOAD_DIR, r2Key), buf);
    }

    const text = await extractText(buf, mime, file.name);

    const sql = getReaderDb();
    const rows = await sql`
      INSERT INTO reader_files (user_id, device_id, filename, r2_key, size_bytes, mime_type, text_extracted, extracted_text)
      VALUES (${auth.userId ?? null}, ${auth.deviceId}, ${file.name}, ${r2Key}, ${file.size}, ${mime}, ${text.length > 0}, ${text || null})
      RETURNING id, filename, size_bytes, mime_type, text_extracted, created_at
    `;

    return NextResponse.json(rows[0]);
  } catch (e: any) {
    console.error('upload error:', e);
    return NextResponse.json({ error: e.message || 'upload failed' }, { status: 500 });
  }
}
