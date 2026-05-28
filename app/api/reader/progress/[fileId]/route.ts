/**
 * GET /api/reader/progress/[fileId] - 获取单文件进度
 * PUT /api/reader/progress/[fileId] - 更新进度
 *   body: { positionChar?, positionPct?, completed? }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const sql = getReaderDb();
    const fileId = parseInt(params.fileId, 10);
    const rows = await sql`
      SELECT file_id, position_char, position_pct, completed, updated_at
      FROM reader_progress WHERE device_id = ${auth.deviceId} AND file_id = ${fileId}
    `;
    if (rows.length === 0) {
      return NextResponse.json({ fileId, positionChar: 0, positionPct: 0, completed: false });
    }
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { fileId: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const body = await req.json();
    const fileId = parseInt(params.fileId, 10);
    const posChar = typeof body.positionChar === 'number' ? body.positionChar : 0;
    const posPct = typeof body.positionPct === 'number' ? body.positionPct : 0;
    const completed = body.completed === true;

    const sql = getReaderDb();
    const rows = await sql`
      INSERT INTO reader_progress (file_id, device_id, user_id, position_char, position_pct, completed, updated_at)
      VALUES (${fileId}, ${auth.deviceId}, ${auth.userId ?? null}, ${posChar}, ${posPct}, ${completed}, NOW())
      ON CONFLICT (file_id, device_id) DO UPDATE
        SET position_char = EXCLUDED.position_char,
            position_pct = EXCLUDED.position_pct,
            completed = EXCLUDED.completed,
            updated_at = NOW()
      RETURNING file_id, position_char, position_pct, completed, updated_at
    `;
    return NextResponse.json(rows[0]);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
