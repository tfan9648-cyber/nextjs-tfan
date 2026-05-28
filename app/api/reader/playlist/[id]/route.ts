/**
 * PATCH  /api/reader/playlist/[id] - 更新播放列表项（status / sortOrder）
 * DELETE /api/reader/playlist/[id] - 删除单项
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json();
    const id = parseInt(params.id, 10);
    const sql = getReaderDb();

    // 校验所有权
    const own = await sql`SELECT id FROM reader_playlist_items WHERE id = ${id} AND device_id = ${auth.deviceId}`;
    if (own.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    if (typeof body.status === 'string') {
      await sql`UPDATE reader_playlist_items SET status = ${body.status}, updated_at = NOW() WHERE id = ${id}`;
    }
    if (typeof body.sortOrder === 'number') {
      await sql`UPDATE reader_playlist_items SET sort_order = ${body.sortOrder}, updated_at = NOW() WHERE id = ${id}`;
    }

    const rows = await sql`SELECT id, file_id, sort_order, status, updated_at FROM reader_playlist_items WHERE id = ${id}`;
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const sql = getReaderDb();
    const id = parseInt(params.id, 10);
    const rows = await sql`DELETE FROM reader_playlist_items WHERE id = ${id} AND device_id = ${auth.deviceId} RETURNING id`;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    return NextResponse.json({ ok: true, deleted: id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
