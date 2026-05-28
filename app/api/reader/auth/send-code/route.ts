/**
 * POST /api/reader/auth/send-code
 * 发送邮箱验证码
 * body: { email }
 * V1: 不实际发邮件，直接在响应中返回 code（仅用于联调）
 * TODO: 后续接入 Resend 真正发邮件
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { rateLimit } from '@/lib/reader-auth';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const { email } = await req.json();
    if (!email || typeof email !== 'string' || !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json({ error: 'invalid email' }, { status: 400 });
    }

    // 限流：每个邮箱每分钟最多 3 次
    if (!rateLimit(`send-code:${email}`, 3, 60_000)) {
      return NextResponse.json({ error: 'too many requests' }, { status: 429 });
    }

    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 分钟

    const sql = getReaderDb();
    await sql`
      INSERT INTO reader_verify_codes (email, code, expires_at)
      VALUES (${email}, ${code}, ${expiresAt.toISOString()})
    `;

    // TODO: 接入 Resend 发邮件，V1 阶段返回 code 方便测试
    return NextResponse.json({
      ok: true,
      devCode: code,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (e: any) {
    console.error('send-code error:', e);
    return NextResponse.json({ error: e.message || 'send-code failed' }, { status: 500 });
  }
}
