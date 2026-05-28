/**
 * 读书郎 - JWT 鉴权 & 简易限流
 */
import { SignJWT, jwtVerify } from 'jose';
import { NextRequest } from 'next/server';

const SECRET = new TextEncoder().encode(
  process.env.READER_JWT_SECRET || 'dev-only-fallback-secret-change-me'
);

export interface ReaderJwtPayload {
  deviceId: number;
  userId?: number | null;
}

/** 生成 JWT（默认 90 天有效期） */
export async function signReaderToken(payload: ReaderJwtPayload, expiresIn = '90d'): Promise<string> {
  return await new SignJWT(payload as any)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(SECRET);
}

/** 校验 JWT */
export async function verifyReaderToken(token: string): Promise<ReaderJwtPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return {
      deviceId: payload.deviceId as number,
      userId: (payload.userId as number) ?? null,
    };
  } catch {
    return null;
  }
}

/** 从请求头解出 token 并验证。失败返回 null */
export async function authReader(req: NextRequest): Promise<ReaderJwtPayload | null> {
  const auth = req.headers.get('authorization') || '';
  const m = auth.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return await verifyReaderToken(m[1]);
}

/** 极简内存限流：每个 key 每窗口允许 N 次 */
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}
