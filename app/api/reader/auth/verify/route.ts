/**
 * POST /api/reader/auth/verify
 * 校验验证码，创建或获取 user，绑定 device
 * body: { email, code, deviceId }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { signReaderToken } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const { email, code, deviceId } = await req.json();
    if (!email || !code || !deviceId) {
      return NextResponse.json({ error: 'email, code, deviceId required' }, { status: 400 });
    }

    const sql = getReaderDb();

    // 取最新一条未使用且未过期的验证码
    const codes = await sql`
      SELECT id FROM reader_verify_codes
      WHERE email = ${email} AND code = ${code} AND used = FALSE AND expires_at > NOW()
      ORDER BY id DESC LIMIT 1
    `;
    if (codes.length === 0) {
      return NextResponse.json({ error: 'invalid or expired code' }, { status: 400 });
    }

    await sql`UPDATE reader_verify_codes SET used = TRUE WHERE id = ${codes[0].id}`;

    // upsert user
    const userRows = await sql`
      INSERT INTO reader_users (email) VALUES (${email})
      ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email
      RETURNING id, email
    `;
    const user = userRows[0];

    // 绑定 device
    await sql`UPDATE reader_devices SET user_id = ${user.id}, last_seen = NOW() WHERE id = ${deviceId}`;

    const token = await signReaderToken({ deviceId: Number(deviceId), userId: user.id });
    return NextResponse.json({
      token,
      userId: user.id,
      email: user.email,
    });
  } catch (e: any) {
    console.error('verify error:', e);
    return NextResponse.json({ error: e.message || 'verify failed' }, { status: 500 });
  }
}
