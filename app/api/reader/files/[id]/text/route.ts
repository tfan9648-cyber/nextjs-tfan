/**
 * GET /api/reader/files/[id]/text - 获取文件的提取文本
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const sql = getReaderDb();
    const fileId = parseInt(params.id, 10);
    const rows = await sql`
      SELECT id, filename, extracted_text, text_extracted
      FROM reader_files WHERE id = ${fileId}
      AND (user_id = ${auth.userId ?? -1} OR device_id = ${auth.deviceId})
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const row = rows[0];
    if (!row.text_extracted) {
      return NextResponse.json({ error: 'text not extracted' }, { status: 404 });
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
