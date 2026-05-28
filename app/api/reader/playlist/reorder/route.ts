/**
 * PUT /api/reader/playlist/reorder
 *   body: { items: [{ id, sortOrder }] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function PUT(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { items } = await req.json();
    if (!Array.isArray(items)) {
      return NextResponse.json({ error: 'items required' }, { status: 400 });
    }

    const sql = getReaderDb();
    let updated = 0;
    for (const it of items) {
      const id = parseInt(it.id, 10);
      const so = parseInt(it.sortOrder, 10);
      if (isNaN(id) || isNaN(so)) continue;
      const r = await sql`
        UPDATE reader_playlist_items
        SET sort_order = ${so}, updated_at = NOW()
        WHERE id = ${id} AND device_id = ${auth.deviceId}
        RETURNING id
      `;
      updated += r.length;
    }
    return NextResponse.json({ ok: true, updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
