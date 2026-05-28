/**
 * POST /api/reader/files/upload  - 上传文件（multipart/form-data）
 * GET  /api/reader/files         - 文件列表（分页）
 *
 * 存储策略：优先 Cloudflare R2；若 R2 未配置，fallback 到本地 /tmp/reader-uploads/。
 * r2_key 字段保存对象 key（R2 模式）或本地文件名（fallback 模式）。
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

/** 提取文本 */
async function extractText(buf: Buffer, mime: string, filename: string): Promise<string> {
  const lower = filename.toLowerCase();
  try {
    if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
      // pdf-parse v2: new PDFParse({ data }).getText() — no default export anymore
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        return result.text || '';
      } finally {
        await parser.destroy().catch(() => {});
      }
    }
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      lower.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value || '';
    }
    if (mime?.startsWith('text/') || lower.endsWith('.txt') || lower.endsWith('.md')) {
      return buf.toString('utf-8');
    }
  } catch (e: any) {
    console.warn('text extraction failed:', e?.message || e, e?.stack);
  }
  return '';
}

/** POST - 上传 */
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

    // 提取文本
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

/** GET - 文件列表 */
export async function GET(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
    const offset = (page - 1) * limit;

    const sql = getReaderDb();

    // 优先按 user_id 查，否则按 device_id
    let rows;
    if (auth.userId) {
      rows = await sql`
        SELECT id, filename, size_bytes, mime_type, text_extracted, created_at
        FROM reader_files WHERE user_id = ${auth.userId}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
    } else {
      rows = await sql`
        SELECT id, filename, size_bytes, mime_type, text_extracted, created_at
        FROM reader_files WHERE device_id = ${auth.deviceId}
        ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
      `;
    }

    return NextResponse.json({ files: rows, page, limit });
  } catch (e: any) {
    console.error('files list error:', e);
    return NextResponse.json({ error: e.message || 'list failed' }, { status: 500 });
  }
}
