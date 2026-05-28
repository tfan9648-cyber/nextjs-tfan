/**
 * POST /api/reader/files/upload-chunk - 分片上传 API
 *
 * 用于绕过 Vercel Hobby plan 的 4.5MB body 限制，支持最大 50MB 文件。
 *
 * 流程：
 * 1. init（JSON）: { action:'init', filename, totalSize, totalChunks, mimeType }
 *    → 返回 { uploadId }
 * 2. chunk（multipart）: action='chunk', uploadId, chunkIndex, file=<Blob ≤3.5MB>
 *    → 返回 { received: chunkIndex }
 * 3. complete（JSON）: { action:'complete', uploadId }
 *    → 合并所有分片，存到 R2/本地，提取文本，写库；返回文件记录
 *
 * 分片存储：
 *   - 如果 R2 已配置 → 存到 R2 临时 key（reader-chunks/{uploadId}/chunk_NNNNN）
 *   - 否则存到 /tmp/reader-chunks/{uploadId}/（仅适用单实例本地开发）
 *
 * Meta（filename/totalSize/totalChunks/mimeType/deviceId）存到 R2 元数据 key 或 /tmp。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getReaderDb, initReaderDb } from '@/lib/reader-db';
import { authReader, rateLimit } from '@/lib/reader-auth';
import {
  isR2Configured,
  putR2Object,
  getR2Object,
  deleteR2Object,
  buildR2Key,
  getR2Client,
  getR2Bucket,
} from '@/lib/reader-r2';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { writeFile, mkdir, readFile, readdir, rm } from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';

const CHUNK_TMP_DIR = '/tmp/reader-chunks';
const UPLOAD_DIR = '/tmp/reader-uploads';
const MAX_TOTAL_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB per chunk (Vercel body limit 4.5MB)

interface UploadMeta {
  filename: string;
  totalSize: number;
  totalChunks: number;
  mimeType: string;
  deviceId: number;
  userId: number | null;
  createdAt: number;
}

function chunkKey(uploadId: string, idx: number): string {
  return `reader-chunks/${uploadId}/chunk_${String(idx).padStart(5, '0')}`;
}
function metaKey(uploadId: string): string {
  return `reader-chunks/${uploadId}/_meta.json`;
}

async function saveMeta(uploadId: string, meta: UploadMeta): Promise<void> {
  const json = JSON.stringify(meta);
  if (isR2Configured()) {
    await putR2Object(metaKey(uploadId), Buffer.from(json, 'utf-8'), 'application/json');
  } else {
    const dir = path.join(CHUNK_TMP_DIR, uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, '_meta.json'), json);
  }
}

async function getMeta(uploadId: string): Promise<UploadMeta | null> {
  try {
    if (isR2Configured()) {
      const buf = await getR2Object(metaKey(uploadId));
      return JSON.parse(buf.toString('utf-8'));
    }
    const data = await readFile(path.join(CHUNK_TMP_DIR, uploadId, '_meta.json'), 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

async function saveChunk(uploadId: string, idx: number, buf: Buffer): Promise<void> {
  if (isR2Configured()) {
    await putR2Object(chunkKey(uploadId, idx), buf, 'application/octet-stream');
  } else {
    const dir = path.join(CHUNK_TMP_DIR, uploadId);
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, `chunk_${String(idx).padStart(5, '0')}`), buf);
  }
}

async function mergeChunks(uploadId: string, totalChunks: number): Promise<Buffer> {
  const buffers: Buffer[] = [];
  if (isR2Configured()) {
    for (let i = 0; i < totalChunks; i++) {
      buffers.push(await getR2Object(chunkKey(uploadId, i)));
    }
  } else {
    const dir = path.join(CHUNK_TMP_DIR, uploadId);
    for (let i = 0; i < totalChunks; i++) {
      buffers.push(await readFile(path.join(dir, `chunk_${String(i).padStart(5, '0')}`)));
    }
  }
  return Buffer.concat(buffers);
}

async function cleanupChunks(uploadId: string, totalChunks: number): Promise<void> {
  try {
    if (isR2Configured()) {
      for (let i = 0; i < totalChunks; i++) {
        await deleteR2Object(chunkKey(uploadId, i)).catch(() => {});
      }
      await deleteR2Object(metaKey(uploadId)).catch(() => {});
    } else {
      await rm(path.join(CHUNK_TMP_DIR, uploadId), { recursive: true, force: true });
    }
  } catch (e) {
    console.warn('[chunk-upload] cleanup error:', e);
  }
}

async function countReceivedChunks(uploadId: string): Promise<number> {
  if (isR2Configured()) {
    const client = getR2Client();
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: getR2Bucket(),
        Prefix: `reader-chunks/${uploadId}/chunk_`,
      })
    );
    return res.Contents?.length ?? 0;
  }
  try {
    const files = await readdir(path.join(CHUNK_TMP_DIR, uploadId));
    return files.filter((f) => f.startsWith('chunk_')).length;
  } catch {
    return 0;
  }
}

async function extractText(buf: Buffer, mime: string, filename: string): Promise<string> {
  try {
    if (mime === 'application/pdf' || filename.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buf);
      return data.text || '';
    }
    if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      filename.endsWith('.docx')
    ) {
      const mammoth = await import('mammoth');
      const result = await mammoth.extractRawText({ buffer: buf });
      return result.value || '';
    }
    if (mime?.startsWith('text/') || filename.endsWith('.txt') || filename.endsWith('.md')) {
      return buf.toString('utf-8');
    }
  } catch (e: any) {
    console.error('[chunk-upload] text extraction failed:', e.message);
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    await initReaderDb();
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    const contentType = req.headers.get('content-type') || '';

    // ===== JSON: init or complete =====
    if (contentType.includes('application/json')) {
      const body = await req.json();
      const action = body.action;

      if (action === 'init') {
        const { filename, totalSize, totalChunks, mimeType } = body;
        if (!filename || typeof totalSize !== 'number' || typeof totalChunks !== 'number') {
          return NextResponse.json({ error: 'missing fields' }, { status: 400 });
        }
        if (totalSize > MAX_TOTAL_SIZE) {
          return NextResponse.json({ error: 'file too large (max 50MB)' }, { status: 413 });
        }
        if (totalChunks < 1 || totalChunks > 200) {
          return NextResponse.json({ error: 'invalid totalChunks' }, { status: 400 });
        }
        if (!rateLimit(`chunk-init:${auth.deviceId}`, 20, 60_000)) {
          return NextResponse.json({ error: 'rate limited' }, { status: 429 });
        }

        const uploadId = randomUUID();
        const meta: UploadMeta = {
          filename: String(filename),
          totalSize,
          totalChunks,
          mimeType: String(mimeType || 'application/octet-stream'),
          deviceId: auth.deviceId,
          userId: auth.userId ?? null,
          createdAt: Date.now(),
        };
        await saveMeta(uploadId, meta);
        return NextResponse.json({ uploadId, totalChunks });
      }

      if (action === 'complete') {
        const { uploadId } = body;
        if (!uploadId) return NextResponse.json({ error: 'missing uploadId' }, { status: 400 });

        const meta = await getMeta(uploadId);
        if (!meta) return NextResponse.json({ error: 'upload session not found' }, { status: 404 });
        if (meta.deviceId !== auth.deviceId) {
          return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }

        const received = await countReceivedChunks(uploadId);
        if (received !== meta.totalChunks) {
          return NextResponse.json(
            { error: `incomplete: got ${received}/${meta.totalChunks} chunks` },
            { status: 400 }
          );
        }

        const mergedBuf = await mergeChunks(uploadId, meta.totalChunks);
        if (mergedBuf.length !== meta.totalSize) {
          console.warn(`[chunk-upload] size mismatch: merged=${mergedBuf.length} expected=${meta.totalSize}`);
        }

        // Store final file
        let r2Key: string;
        if (isR2Configured()) {
          r2Key = buildR2Key(meta.deviceId, meta.filename);
          await putR2Object(r2Key, mergedBuf, meta.mimeType);
        } else {
          await mkdir(UPLOAD_DIR, { recursive: true });
          r2Key = `${Date.now()}_${meta.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
          await writeFile(path.join(UPLOAD_DIR, r2Key), mergedBuf);
        }

        const text = await extractText(mergedBuf, meta.mimeType, meta.filename);

        const sql = getReaderDb();
        const rows = await sql`
          INSERT INTO reader_files (user_id, device_id, filename, r2_key, size_bytes, mime_type, text_extracted, extracted_text)
          VALUES (${meta.userId}, ${meta.deviceId}, ${meta.filename}, ${r2Key}, ${mergedBuf.length}, ${meta.mimeType}, ${text.length > 0}, ${text || null})
          RETURNING id, filename, size_bytes, mime_type, text_extracted, created_at
        `;

        await cleanupChunks(uploadId, meta.totalChunks);
        return NextResponse.json(rows[0]);
      }

      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
    }

    // ===== Multipart: chunk =====
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const action = formData.get('action') as string;
      if (action !== 'chunk') {
        return NextResponse.json({ error: 'invalid action for multipart' }, { status: 400 });
      }

      const uploadId = formData.get('uploadId') as string;
      const chunkIndexStr = formData.get('chunkIndex') as string;
      const chunk = formData.get('file') as File | null;

      if (!uploadId || !chunkIndexStr || !chunk) {
        return NextResponse.json({ error: 'missing chunk fields' }, { status: 400 });
      }
      const chunkIndex = parseInt(chunkIndexStr, 10);
      if (isNaN(chunkIndex) || chunkIndex < 0) {
        return NextResponse.json({ error: 'invalid chunk index' }, { status: 400 });
      }
      if (chunk.size > MAX_CHUNK_SIZE) {
        return NextResponse.json({ error: 'chunk too large' }, { status: 413 });
      }

      const meta = await getMeta(uploadId);
      if (!meta) return NextResponse.json({ error: 'upload session not found' }, { status: 404 });
      if (meta.deviceId !== auth.deviceId) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
      }
      if (chunkIndex >= meta.totalChunks) {
        return NextResponse.json({ error: 'chunk index out of range' }, { status: 400 });
      }

      if (!rateLimit(`chunk-upload:${auth.deviceId}`, 300, 60_000)) {
        return NextResponse.json({ error: 'rate limited' }, { status: 429 });
      }

      const buf = Buffer.from(await chunk.arrayBuffer());
      await saveChunk(uploadId, chunkIndex, buf);
      return NextResponse.json({ received: chunkIndex });
    }

    return NextResponse.json({ error: 'unsupported content type' }, { status: 400 });
  } catch (e: any) {
    console.error('chunk upload error:', e);
    return NextResponse.json({ error: e.message || 'chunk upload failed' }, { status: 500 });
  }
}
