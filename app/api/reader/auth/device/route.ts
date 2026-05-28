/**
 * POST /api/reader/auth/device
 * 注册设备：生成 UUID + JWT
 * body: { platform: 'ios' | 'android' | 'web' }
 */
import { NextRequest, NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { signReaderToken } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const body = await req.json().catch(() => ({}));
    const platform = String(body.platform || 'web').slice(0, 20);

    const deviceUuid = uuidv4();
    const sql = getReaderDb();
    const rows = await sql`
      INSERT INTO reader_devices (device_uuid, platform)
      VALUES (${deviceUuid}, ${platform})
      RETURNING id, device_uuid
    `;
    const device = rows[0];
    const token = await signReaderToken({ deviceId: device.id, userId: null });

    return NextResponse.json({
      deviceId: device.id,
      deviceUuid: device.device_uuid,
      token,
    });
  } catch (e: any) {
    console.error('register device error:', e);
    return NextResponse.json({ error: e.message || 'register failed' }, { status: 500 });
  }
}
