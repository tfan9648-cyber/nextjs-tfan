/**
 * POST /api/reader/playlist/batch-delete
 *   body: { ids: number[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const { ids } = await req.json();
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 });
    }
    const idNums = ids.map((x) => parseInt(x, 10)).filter((x) => !isNaN(x));

    const sql = getReaderDb();
    const rows = await sql`
      DELETE FROM reader_playlist_items
      WHERE id = ANY(${idNums}::int[]) AND device_id = ${auth.deviceId}
      RETURNING id
    `;
    return NextResponse.json({ ok: true, deletedCount: rows.length, deleted: rows.map((r: any) => r.id) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
