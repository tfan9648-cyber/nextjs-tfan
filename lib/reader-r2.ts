/**
 * 读书郎 - Cloudflare R2 文件存储工具
 * 复用 @aws-sdk/client-s3 走 R2 兼容端点
 *
 * 环境变量:
 *   R2_ACCOUNT_ID
 *   R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY
 *   R2_BUCKET_NAME  (默认 dushulang)
 *   R2_PUBLIC_URL   (可选公开访问域名前缀)
 *
 * 若任一关键变量未配置，isR2Configured() 返回 false，调用方需自行 fallback 到本地存储。
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';

let _client: S3Client | null = null;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY
  );
}

export function getR2Bucket(): string {
  return process.env.R2_BUCKET_NAME || 'dushulang';
}

export function getR2Client(): S3Client {
  if (_client) return _client;
  if (!isR2Configured()) {
    throw new Error('R2 not configured');
  }
  const accountId = process.env.R2_ACCOUNT_ID!;
  _client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

/** 生成对象 key：reader/{deviceId}/{ts}_{safeName} */
export function buildR2Key(deviceId: number | string, filename: string): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200);
  return `reader/${deviceId}/${Date.now()}_${safe}`;
}

/** 上传 Buffer 到 R2，返回 key */
export async function putR2Object(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const client = getR2Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getR2Bucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
  return key;
}

/** 下载 R2 对象为 Buffer */
export async function getR2Object(key: string): Promise<Buffer> {
  const client = getR2Client();
  const res = await client.send(
    new GetObjectCommand({ Bucket: getR2Bucket(), Key: key })
  );
  const stream = res.Body as Readable;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    stream.on('data', (c) => chunks.push(Buffer.from(c)));
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });
  return Buffer.concat(chunks);
}

/** 删除 R2 对象 */
export async function deleteR2Object(key: string): Promise<void> {
  const client = getR2Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: key })
  );
}

/** 拼出公开访问 URL（如果配了 R2_PUBLIC_URL） */
export function getR2PublicUrl(key: string): string | null {
  const base = process.env.R2_PUBLIC_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/${key}`;
}
