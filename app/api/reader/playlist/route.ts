/**
 * GET  /api/reader/playlist  - 获取当前设备的播放列表
 * POST /api/reader/playlist  - 添加文件到播放列表
 *   body: { fileId, sortOrder? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const sql = getReaderDb();
    const rows = await sql`
      SELECT p.id, p.file_id, p.sort_order, p.status, p.added_at, p.updated_at,
             f.filename, f.size_bytes, f.mime_type, f.text_extracted
      FROM reader_playlist_items p
      JOIN reader_files f ON f.id = p.file_id
      WHERE p.device_id = ${auth.deviceId}
      ORDER BY p.sort_order ASC, p.added_at ASC
    `;
    return NextResponse.json({ items: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { fileId, sortOrder } = await req.json();
    if (!fileId) return NextResponse.json({ error: 'fileId required' }, { status: 400 });

    const sql = getReaderDb();
    const so = typeof sortOrder === 'number' ? sortOrder : 0;
    const rows = await sql`
      INSERT INTO reader_playlist_items (device_id, user_id, file_id, sort_order)
      VALUES (${auth.deviceId}, ${auth.userId ?? null}, ${fileId}, ${so})
      RETURNING id, file_id, sort_order, status, added_at
    `;
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
