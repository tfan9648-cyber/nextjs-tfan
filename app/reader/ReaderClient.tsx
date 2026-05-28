'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';

/* ==================== Types ==================== */
interface PlaylistItem {
  id: number;
  file_id: number;
  filename: string;
  sort_order: number;
  status: string;
  size_bytes: number;
  mime_type: string;
  text_extracted: boolean;
}

interface ProgressData {
  file_id: number;
  position_char: number;
  position_pct: number;
  completed: boolean;
}

/* ==================== Constants ==================== */
const API_BASE = '/api/reader';
const CHUNK_SIZE = 250; // 每段朗读字数（Chrome 长文本 bug，保持 200-300 字）
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const SAVE_INTERVAL_MS = 10_000; // 每 10 秒保存一次进度

/* ==================== Helper ==================== */
function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('reader_token');
}
function setToken(t: string) {
  localStorage.setItem('reader_token', t);
}
function getDeviceId(): string | null {
  return localStorage.getItem('reader_device_id');
}
function setDeviceId(id: string) {
  localStorage.setItem('reader_device_id', id);
}

async function api(path: string, opts: RequestInit = {}) {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (opts.headers) {
    const h = opts.headers as Record<string, string>;
    Object.keys(h).forEach((k) => (headers[k] = h[k]));
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res;
}
async function apiJson(path: string, opts: RequestInit = {}) {
  const res = await api(path, opts);
  return res.json();
}

/**
 * 将文本按句子边界分段，每段不超过 maxLen 字
 * 分割点：句号、问号、感叹号、换行
 */
function splitTextIntoChunks(text: string, maxLen: number = CHUNK_SIZE): string[] {
  if (!text) return [];
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }
    // 在 maxLen 范围内找最后一个句子边界
    const slice = remaining.slice(0, maxLen);
    // 句子分割符：中文句号、英文句号后跟空格、问号、感叹号、换行
    const boundaryRegex = /[。！？\n.!?]/g;
    let lastBoundary = -1;
    let m;
    while ((m = boundaryRegex.exec(slice)) !== null) {
      lastBoundary = m.index;
    }
    if (lastBoundary === -1 || lastBoundary < maxLen * 0.3) {
      // 没找到合适边界，或者边界太靠前，就直接按 maxLen 截断
      chunks.push(remaining.slice(0, maxLen));
      remaining = remaining.slice(maxLen);
    } else {
      chunks.push(remaining.slice(0, lastBoundary + 1));
      remaining = remaining.slice(lastBoundary + 1);
    }
  }
  return chunks.filter((c) => c.trim().length > 0);
}

/* ==================== Main Component ==================== */
export default function ReaderClient() {
  const [ready, setReady] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [progress, setProgress] = useState<Record<number, ProgressData>>({});
  const [currentFileId, setCurrentFileId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [sleepTimer, setSleepTimer] = useState(0);
  const [sleepTotal, setSleepTotal] = useState(0);
  const [playProgress, setPlayProgress] = useState(0); // 0-100
  const [charPos, setCharPos] = useState(0);
  const [currentChunkIdx, setCurrentChunkIdx] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [ttsAvailable, setTtsAvailable] = useState(true);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceUri, setSelectedVoiceUri] = useState<string>('');
  const [ttsWarning, setTtsWarning] = useState('');

  const textRef = useRef('');
  const chunksRef = useRef<string[]>([]);
  const currentChunkIdxRef = useRef(0);
  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const sleepIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const saveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentFileIdRef = useRef<number | null>(null);
  const charPosRef = useRef(0);
  const speedRef = useRef(1);
  const volumeRef = useRef(1);
  const selectedVoiceUriRef = useRef('');
  const textAreaRef = useRef<HTMLDivElement>(null);
  // Chrome onend bug: timeout to force advance
  const utteranceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync refs
  useEffect(() => { currentFileIdRef.current = currentFileId; }, [currentFileId]);
  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { volumeRef.current = volume; }, [volume]);
  useEffect(() => { selectedVoiceUriRef.current = selectedVoiceUri; }, [selectedVoiceUri]);

  // ===== Check TTS availability =====
  useEffect(() => {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      setTtsAvailable(false);
      setTtsWarning('您的浏览器不支持语音合成（Web Speech API），请使用 Chrome 或 Edge');
      return;
    }

    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      setVoices(v);
      if (v.length > 0) {
        // 优先选中文语音
        const zhVoice = v.find(
          (voice) => voice.lang.startsWith('zh-CN') || voice.lang.startsWith('zh_CN')
        );
        const zhAny = v.find(
          (voice) => voice.lang.startsWith('zh')
        );
        const defaultVoice = zhVoice || zhAny || v[0];
        if (defaultVoice && !selectedVoiceUri) {
          setSelectedVoiceUri(defaultVoice.voiceURI);
        }
        if (!zhVoice && !zhAny) {
          setTtsWarning('未找到中文语音，请在系统设置中安装中文语音包');
        }
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Auth =====
  useEffect(() => {
    (async () => {
      let token = getToken();
      if (!token) {
        try {
          const data = await fetch(`${API_BASE}/auth/device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform: 'web' }),
          }).then((r) => r.json());
          setToken(data.token);
          setDeviceId(String(data.deviceId));
          token = data.token;
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : 'unknown error';
          setError('设备注册失败: ' + msg);
          return;
        }
      }
      setReady(true);
    })();
  }, []);

  // ===== Load playlist =====
  const loadPlaylist = useCallback(async () => {
    try {
      const data = await apiJson('/playlist');
      setPlaylist(data.items || []);
      const fileIds = (data.items || []).map((i: PlaylistItem) => i.file_id);
      if (fileIds.length > 0) {
        const pData = await apiJson(`/progress?fileIds=${fileIds.join(',')}`);
        const map: Record<number, ProgressData> = {};
        for (const p of pData.progress || []) map[p.file_id] = p;
        setProgress(map);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setError(msg);
    }
  }, []);

  useEffect(() => {
    if (ready) loadPlaylist();
  }, [ready, loadPlaylist]);

  // ===== Save progress =====
  const saveProgress = useCallback(async (completed = false) => {
    const fileId = currentFileIdRef.current;
    const fullText = textRef.current;
    const pos = charPosRef.current;
    if (!fileId || !fullText) return;
    const pct = pos / fullText.length;
    try {
      await apiJson(`/progress/${fileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          positionChar: pos,
          positionPct: Math.min(pct, 1),
          completed,
        }),
      });
    } catch {
      // silent
    }
  }, []);

  // Periodic save while playing
  useEffect(() => {
    if (isPlaying) {
      saveIntervalRef.current = setInterval(() => saveProgress(), SAVE_INTERVAL_MS);
    } else {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    }
    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
        saveIntervalRef.current = null;
      }
    };
  }, [isPlaying, saveProgress]);

  // ===== Upload =====
  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        const token = getToken();
        const res = await fetch(`${API_BASE}/files/upload`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error || 'upload failed');
        }
        const uploaded = await res.json();
        // 加入播放列表
        await apiJson('/playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: uploaded.id }),
        });
      }
      await loadPlaylist();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setError('上传失败: ' + msg);
    } finally {
      setUploading(false);
    }
  };

  // ===== Select file =====
  const selectFile = async (fileId: number) => {
    // 如果正在播放，先停止
    if (playingRef.current) {
      stopPlayback();
    }
    setCurrentFileId(fileId);
    currentFileIdRef.current = fileId;
    setError('');
    setExtracting(true);
    try {
      const data = await apiJson(`/files/${fileId}/text`);
      const fileText = data.text || '';
      setText(fileText);
      textRef.current = fileText;
      const chunks = splitTextIntoChunks(fileText);
      chunksRef.current = chunks;

      const p = progress[fileId];
      const pos = p ? p.position_char : 0;
      setCharPos(pos);
      charPosRef.current = pos;
      setPlayProgress(p ? p.position_pct * 100 : 0);

      // 根据 charPos 找到对应的 chunk index
      let accum = 0;
      let startIdx = 0;
      for (let i = 0; i < chunks.length; i++) {
        if (accum + chunks[i].length > pos) {
          startIdx = i;
          break;
        }
        accum += chunks[i].length;
      }
      setCurrentChunkIdx(startIdx);
      currentChunkIdxRef.current = startIdx;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setError('获取文本失败: ' + msg);
    } finally {
      setExtracting(false);
    }
  };

  // ===== Scroll to current chunk =====
  useEffect(() => {
    if (textAreaRef.current) {
      const highlight = textAreaRef.current.querySelector('[data-current="true"]');
      if (highlight) {
        highlight.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentChunkIdx]);

  // ===== TTS playback with Web Speech API =====
  const speakChunk = useCallback((chunkIdx: number) => {
    if (!playingRef.current) return;
    const chunks = chunksRef.current;
    if (chunkIdx >= chunks.length) {
      // 全部播完
      playingRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
      setPlayProgress(100);
      charPosRef.current = textRef.current.length;
      setCharPos(textRef.current.length);
      saveProgress(true);
      return;
    }

    const chunkText = chunks[chunkIdx];
    const utterance = new SpeechSynthesisUtterance(chunkText);
    utterance.rate = speedRef.current;
    utterance.volume = volumeRef.current;
    utterance.lang = 'zh-CN';

    // 选择语音
    const voiceUri = selectedVoiceUriRef.current;
    if (voiceUri) {
      const allVoices = window.speechSynthesis.getVoices();
      const v = allVoices.find((voice) => voice.voiceURI === voiceUri);
      if (v) utterance.voice = v;
    }

    // 计算当前字符位置
    let posBeforeChunk = 0;
    for (let i = 0; i < chunkIdx; i++) {
      posBeforeChunk += chunks[i].length;
    }

    setCurrentChunkIdx(chunkIdx);
    currentChunkIdxRef.current = chunkIdx;
    setCharPos(posBeforeChunk);
    charPosRef.current = posBeforeChunk;
    const pct = posBeforeChunk / textRef.current.length;
    setPlayProgress(pct * 100);

    // Chrome bug: onend may not fire for long utterances.
    // Set a generous timeout based on estimated speech duration.
    // Average Chinese speech: ~4 chars/second at rate 1.0
    const estimatedDuration = (chunkText.length / (4 * speedRef.current)) * 1000 + 5000;
    if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
    utteranceTimeoutRef.current = setTimeout(() => {
      // If still "speaking" but onend didn't fire, force advance
      if (playingRef.current && window.speechSynthesis.speaking) {
        console.warn('[TTS] Force advancing to next chunk (Chrome timeout bug)');
        window.speechSynthesis.cancel();
        speakChunk(chunkIdx + 1);
      }
    }, estimatedDuration);

    utterance.onend = () => {
      if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
      if (playingRef.current && !pausedRef.current) {
        speakChunk(chunkIdx + 1);
      }
    };

    utterance.onerror = (event) => {
      if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
      if (event.error === 'canceled' || event.error === 'interrupted') {
        // 正常取消/暂停，不报错
        return;
      }
      console.error('[TTS] Error:', event.error);
      setError(`朗读出错: ${event.error}`);
      playingRef.current = false;
      setIsPlaying(false);
      setIsPaused(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [saveProgress]);

  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    pausedRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
    window.speechSynthesis.cancel();
    saveProgress();
  }, [saveProgress]);

  const handlePlay = useCallback(() => {
    if (!text || !ttsAvailable) return;

    if (isPaused) {
      // 从暂停恢复：重新开始当前段
      pausedRef.current = false;
      playingRef.current = true;
      setIsPaused(false);
      setIsPlaying(true);
      speakChunk(currentChunkIdxRef.current);
      return;
    }

    // 全新播放
    playingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);
    speakChunk(currentChunkIdxRef.current);
  }, [text, ttsAvailable, isPaused, speakChunk]);

  const handlePause = useCallback(() => {
    playingRef.current = false;
    pausedRef.current = true;
    setIsPlaying(false);
    setIsPaused(true);
    if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
    window.speechSynthesis.cancel();
    saveProgress();
  }, [saveProgress]);

  // ===== Speed change while playing =====
  useEffect(() => {
    if (isPlaying && !isPaused) {
      // Restart current chunk with new speed
      window.speechSynthesis.cancel();
      if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
      // Small delay to let cancel propagate
      setTimeout(() => {
        if (playingRef.current) {
          speakChunk(currentChunkIdxRef.current);
        }
      }, 50);
    }
  }, [speed]); // eslint-disable-line react-hooks/exhaustive-deps

  // ===== Sleep timer =====
  const startSleep = (minutes: number) => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    const totalSec = minutes * 60;
    setSleepTotal(totalSec);
    setSleepTimer(totalSec);
    sleepIntervalRef.current = setInterval(() => {
      setSleepTimer((prev) => {
        if (prev <= 1) {
          // 时间到，停止朗读
          clearInterval(sleepIntervalRef.current!);
          stopPlayback();
          return 0;
        }
        // 最后60秒渐弱音量 — 对 Web Speech API 需要调整 volume ref
        // 注意：SpeechSynthesisUtterance 的 volume 只在创建时生效
        // 所以我们在最后 60 秒逐步降低 volumeRef，下一段会用新音量
        if (prev <= 60) {
          const fadedVolume = Math.max(0.05, (prev / 60) * volumeRef.current);
          volumeRef.current = fadedVolume;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSleep = () => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepTimer(0);
    setSleepTotal(0);
    volumeRef.current = volume;
  };

  // Cleanup
  useEffect(
    () => () => {
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
      if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    },
    []
  );

  // ===== Drag & Drop =====
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
  };

  // ===== Render text with chunk highlighting =====
  const renderText = () => {
    if (!text) return null;
    const chunks = chunksRef.current;
    if (chunks.length === 0) return <span>{text}</span>;

    return chunks.map((chunk, idx) => {
      const isCurrent = idx === currentChunkIdx;
      const isRead = idx < currentChunkIdx;
      return (
        <span
          key={idx}
          data-current={isCurrent ? 'true' : undefined}
          className={
            isCurrent
              ? 'bg-yellow-600/30 border-l-2 border-yellow-400 px-0.5'
              : isRead
              ? 'text-gray-500'
              : ''
          }
          onClick={() => {
            // 点击某段，跳转到该位置
            let pos = 0;
            for (let i = 0; i < idx; i++) pos += chunks[i].length;
            setCurrentChunkIdx(idx);
            currentChunkIdxRef.current = idx;
            setCharPos(pos);
            charPosRef.current = pos;
            setPlayProgress((pos / textRef.current.length) * 100);
            if (playingRef.current) {
              window.speechSynthesis.cancel();
              if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
              setTimeout(() => speakChunk(idx), 50);
            }
          }}
          style={{ cursor: 'pointer' }}
        >
          {chunk}
        </span>
      );
    });
  };

  // ===== Delete file =====
  const deleteFile = async (playlistItemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('确定删除此文件？')) return;
    try {
      await api(`/playlist/${playlistItemId}`, { method: 'DELETE' });
      await loadPlaylist();
      if (currentFileId && playlist.find((p) => p.id === playlistItemId && p.file_id === currentFileId)) {
        setCurrentFileId(null);
        setText('');
        setCharPos(0);
        setPlayProgress(0);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      setError('删除失败: ' + msg);
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 flex items-center justify-center">
        <p className="animate-pulse">初始化中...</p>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-gray-900 text-gray-100 flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h1 className="text-xl font-bold">📖 读书郎</h1>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 rounded hover:bg-gray-700 transition"
          title="设置"
        >
          ⚙️
        </button>
      </header>

      {/* Warning Banner */}
      {ttsWarning && (
        <div className="bg-yellow-900/50 text-yellow-200 px-4 py-2 text-sm flex items-center justify-between">
          <span>⚠️ {ttsWarning}</span>
          <button onClick={() => setTtsWarning('')} className="ml-2 text-yellow-400 hover:text-yellow-200">
            ✕
          </button>
        </div>
      )}

      {/* Error Banner */}
      {error && (
        <div className="bg-red-900/50 text-red-200 px-4 py-2 text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-200">
            ✕
          </button>
        </div>
      )}

      {/* Drag overlay */}
      {dragOver && (
        <div className="fixed inset-0 bg-blue-900/50 z-50 flex items-center justify-center pointer-events-none">
          <p className="text-2xl font-bold text-white">松手上传文件 📄</p>
        </div>
      )}

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar - Playlist */}
        <aside className="w-72 lg:w-80 bg-gray-850 border-r border-gray-700 flex flex-col overflow-hidden">
          <div className="p-3 border-b border-gray-700 flex items-center justify-between">
            <h2 className="font-semibold text-sm text-gray-300">播放列表</h2>
            <label className="cursor-pointer bg-blue-600 hover:bg-blue-500 px-3 py-1 rounded text-xs font-medium transition">
              {uploading ? '上传中...' : '+ 上传'}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.docx,.txt,.md"
                multiple
                onChange={(e) => handleUpload(e.target.files)}
                disabled={uploading}
              />
            </label>
          </div>
          <div className="flex-1 overflow-y-auto">
            {playlist.length === 0 && (
              <p className="text-center text-gray-500 text-sm py-8">暂无文件，上传开始听书</p>
            )}
            {playlist.map((item) => {
              const p = progress[item.file_id];
              const pct = p ? Math.round(p.position_pct * 100) : 0;
              const isActive = item.file_id === currentFileId;
              return (
                <div
                  key={item.id}
                  className={`group relative w-full text-left px-3 py-2 border-b border-gray-800 hover:bg-gray-700/50 transition cursor-pointer ${
                    isActive ? 'bg-gray-700 border-l-2 border-l-blue-500' : ''
                  }`}
                  onClick={() => selectFile(item.file_id)}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {p?.completed ? '✅' : pct > 0 ? '▶️' : '📄'}
                    </span>
                    <span className="text-sm truncate flex-1">{item.filename}</span>
                    <button
                      onClick={(e) => deleteFile(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition text-xs p-1"
                      title="删除"
                    >
                      🗑
                    </button>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="flex-1 h-1 bg-gray-700 rounded overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {extracting ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <p className="text-2xl mb-3 animate-spin inline-block">⏳</p>
                <p>正在提取文本内容...</p>
              </div>
            </div>
          ) : currentFileId && text ? (
            <div className="flex-1 overflow-y-auto p-6" ref={textAreaRef}>
              <div className="max-w-3xl mx-auto leading-relaxed text-gray-200 whitespace-pre-wrap text-base">
                {renderText()}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-4xl mb-4">📖</p>
                <p>选择文件开始听书</p>
                <p className="text-sm mt-2">支持 PDF、Word、TXT 格式</p>
                {!ttsAvailable && (
                  <p className="text-sm mt-3 text-red-400">
                    ⚠️ 浏览器不支持语音合成，请使用 Chrome 或 Edge
                  </p>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Bottom Control Bar */}
      <footer className="bg-gray-800 border-t border-gray-700 px-4 py-3">
        <div className="flex items-center gap-4 max-w-5xl mx-auto">
          {/* Play/Pause */}
          <button
            onClick={isPlaying ? handlePause : handlePlay}
            disabled={!currentFileId || !text || !ttsAvailable}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center transition text-lg"
          >
            {isPlaying ? '⏸' : '▶️'}
          </button>

          {/* Progress bar */}
          <div className="flex-1">
            <div
              className="h-2 bg-gray-700 rounded overflow-hidden cursor-pointer"
              onClick={(e) => {
                // 点击进度条跳转
                if (!text) return;
                const rect = e.currentTarget.getBoundingClientRect();
                const pct = (e.clientX - rect.left) / rect.width;
                const targetChar = Math.floor(pct * text.length);
                // 找到对应 chunk
                const chunks = chunksRef.current;
                let accum = 0;
                let targetIdx = 0;
                for (let i = 0; i < chunks.length; i++) {
                  if (accum + chunks[i].length > targetChar) {
                    targetIdx = i;
                    break;
                  }
                  accum += chunks[i].length;
                  if (i === chunks.length - 1) targetIdx = i;
                }
                setCurrentChunkIdx(targetIdx);
                currentChunkIdxRef.current = targetIdx;
                setCharPos(accum);
                charPosRef.current = accum;
                setPlayProgress(pct * 100);
                if (playingRef.current) {
                  window.speechSynthesis.cancel();
                  if (utteranceTimeoutRef.current) clearTimeout(utteranceTimeoutRef.current);
                  setTimeout(() => speakChunk(targetIdx), 50);
                }
              }}
            >
              <div
                className="h-full bg-blue-500 transition-all duration-300"
                style={{ width: `${playProgress}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>{currentFileId ? `${Math.round(playProgress)}%` : '--'}</span>
              <span>{currentFileId && text ? `${charPos}/${text.length} 字` : ''}</span>
            </div>
          </div>

          {/* Speed */}
          <select
            value={speed}
            onChange={(e) => setSpeed(parseFloat(e.target.value))}
            className="bg-gray-700 text-sm px-2 py-1 rounded border border-gray-600"
          >
            {SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>

          {/* Volume */}
          <div className="flex items-center gap-1">
            <span className="text-sm">🔊</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={volume}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setVolume(v);
                volumeRef.current = v;
              }}
              className="w-16 h-1 accent-blue-500"
            />
          </div>

          {/* Sleep Timer */}
          <div className="relative">
            {sleepTimer > 0 ? (
              <button
                onClick={cancelSleep}
                className="text-sm bg-indigo-700 px-2 py-1 rounded hover:bg-indigo-600 transition"
                title="取消定时"
              >
                🌙 {Math.ceil(sleepTimer / 60)}分
              </button>
            ) : (
              <select
                value=""
                onChange={(e) => {
                  const m = parseInt(e.target.value);
                  if (m > 0) startSleep(m);
                }}
                className="bg-gray-700 text-sm px-2 py-1 rounded border border-gray-600"
              >
                <option value="">🌙 定时</option>
                <option value="15">15 分钟</option>
                <option value="30">30 分钟</option>
                <option value="45">45 分钟</option>
                <option value="60">60 分钟</option>
                <option value="90">90 分钟</option>
              </select>
            )}
          </div>
        </div>
      </footer>

      {/* Settings Panel */}
      {showSettings && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center"
          onClick={() => setShowSettings(false)}
        >
          <div
            className="bg-gray-800 rounded-lg p-6 w-96 max-w-[90vw] max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-bold text-lg mb-4">设置</h3>
            <div className="space-y-4 text-sm">
              <div>
                <label className="text-gray-400">设备 ID</label>
                <p className="text-gray-200">{getDeviceId() || '未知'}</p>
              </div>
              <div>
                <label className="text-gray-400 block mb-1">TTS 引擎</label>
                <p className="text-gray-200">浏览器 Web Speech API</p>
              </div>
              <div>
                <label className="text-gray-400 block mb-1">语音选择</label>
                {voices.length === 0 ? (
                  <p className="text-yellow-400 text-xs">未检测到可用语音</p>
                ) : (
                  <select
                    value={selectedVoiceUri}
                    onChange={(e) => setSelectedVoiceUri(e.target.value)}
                    className="w-full bg-gray-700 text-sm px-2 py-1.5 rounded border border-gray-600"
                  >
                    {/* 中文语音优先 */}
                    {voices
                      .filter((v) => v.lang.startsWith('zh'))
                      .map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang}) {v.localService ? '本地' : '在线'}
                        </option>
                      ))}
                    {voices.filter((v) => v.lang.startsWith('zh')).length > 0 &&
                      voices.filter((v) => !v.lang.startsWith('zh')).length > 0 && (
                        <option disabled>── 其他语言 ──</option>
                      )}
                    {voices
                      .filter((v) => !v.lang.startsWith('zh'))
                      .map((v) => (
                        <option key={v.voiceURI} value={v.voiceURI}>
                          {v.name} ({v.lang})
                        </option>
                      ))}
                  </select>
                )}
              </div>
              <div>
                <label className="text-gray-400 block mb-1">朗读分段大小</label>
                <p className="text-gray-200">{CHUNK_SIZE} 字/段</p>
                <p className="text-gray-500 text-xs mt-0.5">
                  为避免 Chrome 长文本 bug，每段保持在 200-300 字
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="mt-6 w-full bg-blue-600 hover:bg-blue-500 py-2 rounded transition"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
