/**
 * GET    /api/reader/files/[id]      - 单文件元数据
 * DELETE /api/reader/files/[id]      - 删除文件（同时清理 R2 / 本地）
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader } from '@/lib/reader-auth';
import { isR2Configured, deleteR2Object } from '@/lib/reader-r2';
import { unlink } from 'fs/promises';
import path from 'path';

export const runtime = 'nodejs';

const UPLOAD_DIR = '/tmp/reader-uploads';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const sql = getReaderDb();
    const fileId = parseInt(params.id, 10);
    const rows = await sql`
      SELECT id, filename, size_bytes, mime_type, text_extracted, created_at
      FROM reader_files WHERE id = ${fileId}
      AND (user_id = ${auth.userId ?? -1} OR device_id = ${auth.deviceId})
    `;
    if (rows.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
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
    const fileId = parseInt(params.id, 10);

    // 先查 r2_key 用于清理对象
    const meta = await sql`
      SELECT id, r2_key FROM reader_files WHERE id = ${fileId}
      AND (user_id = ${auth.userId ?? -1} OR device_id = ${auth.deviceId})
    `;
    if (meta.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });
    const r2Key: string | null = meta[0].r2_key;

    // 删除数据库记录（CASCADE 会带走 playlist/progress）
    const deleted = await sql`
      DELETE FROM reader_files WHERE id = ${fileId}
      AND (user_id = ${auth.userId ?? -1} OR device_id = ${auth.deviceId})
      RETURNING id
    `;
    if (deleted.length === 0) return NextResponse.json({ error: 'not found' }, { status: 404 });

    // 清理存储对象（失败不影响业务，只记录日志）
    if (r2Key) {
      try {
        if (isR2Configured() && r2Key.startsWith('reader/')) {
          await deleteR2Object(r2Key);
        } else {
          await unlink(path.join(UPLOAD_DIR, r2Key)).catch(() => undefined);
        }
      } catch (e: any) {
        console.warn('[delete] storage cleanup failed:', e.message);
      }
    }

    return NextResponse.json({ ok: true, deleted: fileId });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
