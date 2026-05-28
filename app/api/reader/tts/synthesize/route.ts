/**
 * POST /api/reader/tts/synthesize
 *   body: { text, voice?, rate? }
 *   返回 audio/mpeg 流
 *
 * ⚠️ V1 备用接口 — 当前 Web 端使用浏览器 Web Speech API 进行 TTS，
 * 不再调用此后端接口。保留代码供 V2 服务端 TTS 方案使用。
 * 问题：Vercel Serverless 函数超时（msedge-tts 流式合成耗时过长）
 */
import { NextRequest, NextResponse } from 'next/server';
import { authReader, rateLimit } from '@/lib/reader-auth';

export const runtime = 'nodejs';

const MAX_TEXT = 1000;

export async function POST(req: NextRequest) {
  try {
    const auth = await authReader(req);
    if (!auth) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

    if (!rateLimit(`tts:${auth.deviceId}`, 60, 60_000)) {
      return NextResponse.json({ error: 'rate limited' }, { status: 429 });
    }

    const { text, voice, rate } = await req.json();
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json({ error: `text too long (max ${MAX_TEXT} chars)` }, { status: 400 });
    }

    // 动态加载 msedge-tts
    const { MsEdgeTTS, OUTPUT_FORMAT } = await import('msedge-tts');
    const tts = new MsEdgeTTS();
    const useVoice = voice || 'zh-CN-XiaoxiaoNeural';
    const useRate = typeof rate === 'string' ? rate : '0%';

    await tts.setMetadata(useVoice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    const result: any = await tts.toStream(text, { rate: useRate });

    // 兼容不同返回结构：可能返回 { audioStream } 或直接 readable
    const stream = result.audioStream || result;

    const chunks: Buffer[] = [];
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (c: Buffer) => chunks.push(c));
      stream.on('end', () => resolve());
      stream.on('close', () => resolve());
      stream.on('error', (e: any) => reject(e));
    });
    const audio = Buffer.concat(chunks);

    return new NextResponse(audio, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: any) {
    console.error('tts error:', e);
    return NextResponse.json({ error: e.message || 'tts failed' }, { status: 500 });
  }
}
