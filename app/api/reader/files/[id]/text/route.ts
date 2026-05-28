/**
 * GET /api/reader/files/[id]/text - 获取文件的提取文本
 *
 * 如果 text_extracted 为 false，尝试重新从 R2/本地读取文件并提取文本。
 * 这解决了某些文件上传时提取失败但文件已正确存储的情况。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';
import { isR2Configured, getR2Object } from '@/lib/reader-r2';
import { readFile } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const UPLOAD_DIR = '/tmp/reader-uploads';

async function extractText(buf: Buffer, mime: string, filename: string): Promise<string> {
  try {
    if (mime === 'application/pdf' || filename.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buf);
      return data.text || '';
    }
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value || '';
    }
    if (mime?.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md')) {
      return buf.toString('utf-8');
    }
  } catch (e: any) {
    console.warn('[text-route] extraction failed:', e.message);
  }
  return '';
}

async function tryReExtract(fileId: number, r2Key: string | null, mime: string, filename: string): Promise<string | null> {
  if (!r2Key) return null;
  try {
    let buf: Buffer;
    if (isR2Configured() && r2Key.startsWith('reader/')) {
      buf = await getR2Object(r2Key);
    } else {
      buf = await readFile(path.join(UPLOAD_DIR, r2Key));
    }
    const text = await extractText(buf, mime, filename);
    if (text.length > 0) {
      // 更新数据库
      const sql = getReaderDb();
      await sql`
        UPDATE reader_files
        SET extracted_text = ${text}, text_extracted = true
        WHERE id = ${fileId}
      `;
      return text;
    }
  } catch (e: any) {
    console.warn('[text-route] re-extraction failed:', e.message);
  }
  return null;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const sql = getReaderDb();
    const fileId = parseInt(params.id, 10);
    const rows = await sql`
      SELECT id, filename, extracted_text, text_extracted, r2_key, mime_type
      FROM reader_files WHERE id = ${fileId}
      AND (user_id = ${auth.userId ?? -1} OR device_id = ${auth.deviceId})
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const row = rows[0];

    // 如果之前没提取成功，尝试重新提取
    if (!row.text_extracted || !row.extracted_text) {
      const reText = await tryReExtract(fileId, row.r2_key, row.mime_type, row.filename);
      if (reText) {
        return NextResponse.json({
          fileId: row.id,
          filename: row.filename,
          text: reText,
          charCount: reText.length,
        });
      }
      return NextResponse.json(
        { error: '文本提取失败，请确认文件格式正确（支持 PDF/DOCX/TXT）' },
        { status: 422 }
      );
    }

    return NextResponse.json({
      fileId: row.id,
      filename: row.filename,
      text: row.extracted_text,
      charCount: row.extracted_text?.length || 0,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
