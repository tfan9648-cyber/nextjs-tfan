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
const TTS_CHUNK_SIZE = 800; // 每段发送文字长度
const SPEED_OPTIONS = [0.5, 0.75, 1, 1.25, 1.5, 2];

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
  const headers: any = { ...(opts.headers || {}) };
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

/* ==================== Main Component ==================== */
export default function ReaderClient() {
  const [ready, setReady] = useState(false);
  const [playlist, setPlaylist] = useState<PlaylistItem[]>([]);
  const [progress, setProgress] = useState<Record<number, ProgressData>>({});
  const [currentFileId, setCurrentFileId] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(1);
  const [sleepTimer, setSleepTimer] = useState(0); // 剩余秒
  const [sleepTotal, setSleepTotal] = useState(0); // 设置的总秒数
  const [playProgress, setPlayProgress] = useState(0); // 0-100
  const [charPos, setCharPos] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);
  const gainRef = useRef<GainNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const sleepIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const playingRef = useRef(false);
  const currentChunkRef = useRef(0);
  const totalChunksRef = useRef(0);
  const textRef = useRef('');

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
        } catch (e: any) {
          setError('设备注册失败: ' + e.message);
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
    } catch (e: any) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    if (ready) loadPlaylist();
  }, [ready, loadPlaylist]);

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
          throw new Error(err.error || 'upload failed');
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
    } catch (e: any) {
      setError('上传失败: ' + e.message);
    } finally {
      setUploading(false);
    }
  };

  // ===== Select file =====
  const selectFile = async (fileId: number) => {
    setCurrentFileId(fileId);
    setError('');
    try {
      const data = await apiJson(`/files/${fileId}/text`);
      setText(data.text || '');
      textRef.current = data.text || '';
      const p = progress[fileId];
      const pos = p ? p.position_char : 0;
      setCharPos(pos);
      setPlayProgress(p ? p.position_pct * 100 : 0);
    } catch (e: any) {
      setError('获取文本失败: ' + e.message);
    }
  };

  // ===== TTS playback =====
  const playChunk = useCallback(
    async (startChar: number) => {
      if (!playingRef.current) return;
      const fullText = textRef.current;
      if (startChar >= fullText.length) {
        // 播完
        setIsPlaying(false);
        playingRef.current = false;
        setPlayProgress(100);
        if (currentFileId) {
          await apiJson(`/progress/${currentFileId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ positionChar: fullText.length, positionPct: 1, completed: true }),
          }).catch(() => {});
        }
        return;
      }

      const chunk = fullText.slice(startChar, startChar + TTS_CHUNK_SIZE);
      const rateStr = speed === 1 ? '0%' : `${Math.round((speed - 1) * 100)}%`;

      try {
        const res = await api('/tts/synthesize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: chunk, rate: rateStr }),
        });
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.volume = volume;
          await audioRef.current.play();
        }

        const nextStart = startChar + chunk.length;
        setCharPos(nextStart);
        const pct = nextStart / fullText.length;
        setPlayProgress(pct * 100);

        // 等音频播完再继续下一段
        if (audioRef.current) {
          audioRef.current.onended = () => {
            URL.revokeObjectURL(url);
            if (playingRef.current) {
              playChunk(nextStart);
            }
          };
        }
      } catch (e: any) {
        setError('TTS 失败: ' + e.message);
        setIsPlaying(false);
        playingRef.current = false;
      }
    },
    [speed, volume, currentFileId]
  );

  const handlePlay = () => {
    if (!text) return;
    setIsPlaying(true);
    playingRef.current = true;
    playChunk(charPos);
  };

  const handlePause = async () => {
    setIsPlaying(false);
    playingRef.current = false;
    if (audioRef.current) {
      audioRef.current.pause();
    }
    // 保存进度
    if (currentFileId && textRef.current) {
      const pct = charPos / textRef.current.length;
      await apiJson(`/progress/${currentFileId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ positionChar: charPos, positionPct: pct, completed: false }),
      }).catch(() => {});
    }
  };

  // ===== Sleep timer =====
  const startSleep = (minutes: number) => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    const totalSec = minutes * 60;
    setSleepTotal(totalSec);
    setSleepTimer(totalSec);
    sleepIntervalRef.current = setInterval(() => {
      setSleepTimer((prev) => {
        if (prev <= 1) {
          // 时间到，暂停
          clearInterval(sleepIntervalRef.current!);
          handlePause();
          return 0;
        }
        // 最后60秒渐弱音量
        if (prev <= 60 && audioRef.current) {
          audioRef.current.volume = Math.max(0, (prev / 60) * volume);
        }
        return prev - 1;
      });
    }, 1000);
  };

  const cancelSleep = () => {
    if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    setSleepTimer(0);
    setSleepTotal(0);
    if (audioRef.current) audioRef.current.volume = volume;
  };

  // cleanup
  useEffect(
    () => () => {
      if (sleepIntervalRef.current) clearInterval(sleepIntervalRef.current);
    },
    []
  );

  // ===== Drag & Drop =====
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleUpload(e.dataTransfer.files);
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
                <button
                  key={item.id}
                  onClick={() => selectFile(item.file_id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-800 hover:bg-gray-700/50 transition ${
                    isActive ? 'bg-gray-700 border-l-2 border-l-blue-500' : ''
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm">
                      {p?.completed ? '✅' : pct > 0 ? '▶️' : '📄'}
                    </span>
                    <span className="text-sm truncate flex-1">{item.filename}</span>
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
                </button>
              );
            })}
          </div>
        </aside>

        {/* Main Area */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {currentFileId && text ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-3xl mx-auto leading-relaxed text-gray-200 whitespace-pre-wrap text-base">
                {/* 高亮已读部分 */}
                <span className="text-gray-500">{text.slice(0, charPos)}</span>
                <span className="bg-yellow-600/30 border-l-2 border-yellow-400 px-0.5">
                  {text.slice(charPos, charPos + TTS_CHUNK_SIZE)}
                </span>
                <span>{text.slice(charPos + TTS_CHUNK_SIZE)}</span>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <p className="text-4xl mb-4">📖</p>
                <p>选择文件开始听书</p>
                <p className="text-sm mt-2">支持 PDF、Word、TXT 格式</p>
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
            disabled={!currentFileId || !text}
            className="w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 disabled:cursor-not-allowed flex items-center justify-center transition text-lg"
          >
            {isPlaying ? '⏸' : '▶️'}
          </button>

          {/* Progress bar */}
          <div className="flex-1">
            <div className="h-2 bg-gray-700 rounded overflow-hidden cursor-pointer">
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
                if (audioRef.current) audioRef.current.volume = v;
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

      {/* Hidden audio element */}
      <audio ref={audioRef} className="hidden" />

      {/* Settings Panel */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center" onClick={() => setShowSettings(false)}>
          <div className="bg-gray-800 rounded-lg p-6 w-80 max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-bold text-lg mb-4">设置</h3>
            <div className="space-y-3 text-sm">
              <div>
                <label className="text-gray-400">设备 ID</label>
                <p className="text-gray-200">{getDeviceId() || '未知'}</p>
              </div>
              <div>
                <label className="text-gray-400">TTS 引擎</label>
                <p className="text-gray-200">Microsoft Edge TTS</p>
              </div>
              <div>
                <label className="text-gray-400">语音</label>
                <p className="text-gray-200">zh-CN-XiaoxiaoNeural</p>
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
