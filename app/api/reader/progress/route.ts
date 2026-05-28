/**
 * GET /api/reader/progress?fileIds=1,2,3 - 批量获取进度
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

    const { searchParams } = new URL(req.url);
    const ids = (searchParams.get('fileIds') || '')
      .split(',')
      .map((x) => parseInt(x.trim(), 10))
      .filter((x) => !isNaN(x));

    const sql = getReaderDb();
    let rows;
    if (ids.length > 0) {
      rows = await sql`
        SELECT file_id, position_char, position_pct, completed, updated_at
        FROM reader_progress
        WHERE device_id = ${auth.deviceId} AND file_id = ANY(${ids}::int[])
      `;
    } else {
      rows = await sql`
        SELECT file_id, position_char, position_pct, completed, updated_at
        FROM reader_progress
        WHERE device_id = ${auth.deviceId}
      `;
    }
    return NextResponse.json({ progress: rows });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
