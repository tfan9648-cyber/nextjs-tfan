"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Building2,
  Newspaper,
  Search,
  Edit3,
  Save,
  X,
  GripVertical,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Plus,
  Trash2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Database,
  Loader2,
} from "lucide-react";

interface NewsItem {
  id: string;
  date: string;
  company: string;
  title: string;
  summary: string;
  content: string;
  timestamp?: number;
  keywords?: string[];
  sources: string[];
  category: string;
  readTime: string;
  isKeywordSearch: boolean;
}

const DEFAULT_COMPANIES = [
  "中国平安",
  "美的集团",
  "伊利股份",
  "招商银行",
  "贵州茅台",
  "泸州老窖",
  "腾讯控股",
  "阿里巴巴",
  "万华化学",
  "福耀玻璃",
  "昱能科技",
  "凌霄泵业",
  "长江电力",
];

const DEFAULT_KEYWORDS = ["", "", "", "", ""];
const PAGE_SIZE = 10;

export default function Home() {
  // === Left column state ===
  const [companies, setCompanies] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [editList, setEditList] = useState<string[]>([]);
  const [newCompany, setNewCompany] = useState("");
  const dragItem = useRef<number | null>(null);
  const dragOver = useRef<number | null>(null);

  // === Middle column state ===
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsTotal, setNewsTotal] = useState(0);
  const [dateFilter, setDateFilter] = useState("last3days");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [newsLoading, setNewsLoading] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);

  // === Right column state ===
  const [keywords, setKeywords] = useState<string[]>(DEFAULT_KEYWORDS);
  const [searchLoading, setSearchLoading] = useState(false);
  const [reportLoading, setReportLoading] = useState(false);
  const [error, setError] = useState("");

  // API Key authentication state
  const [apiKey, setApiKey] = useState<string>('');
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  // 验证后需要重试的动作（401 后保存，密码输入成功后重放）
  const pendingActionRef = useRef<((key: string) => void) | null>(null);

  // 打开密码弹框时，总是清空输入，避免浏览器 autofill
  const openKeyDialog = useCallback((pending?: (key: string) => void) => {
    setKeyInput('');
    if (pending) pendingActionRef.current = pending;
    setShowKeyDialog(true);
  }, []);

  const submitKey = useCallback(() => {
    const k = keyInput.trim();
    if (!k) return;
    setApiKey(k);
    localStorage.setItem('api_key', k);
    setShowKeyDialog(false);
    setKeyInput('');
    setError('');
    // 重放被 401 拦下的动作
    if (pendingActionRef.current) {
      const fn = pendingActionRef.current;
      pendingActionRef.current = null;
      setTimeout(() => fn(k), 0);
    }
  }, [keyInput]);

  const cancelKeyDialog = useCallback(() => {
    pendingActionRef.current = null;
    setKeyInput('');
    setShowKeyDialog(false);
  }, []);

  // === Init companies ===
  useEffect(() => {
    const stored = localStorage.getItem("companies");
    if (stored) {
      try {
        setCompanies(JSON.parse(stored));
      } catch {
        setCompanies(DEFAULT_COMPANIES);
      }
    } else {
      setCompanies(DEFAULT_COMPANIES);
    }
  }, []);

  // === Load API Key from localStorage ===
  useEffect(() => {
    const saved = localStorage.getItem('api_key');
    if (saved) {
      setApiKey(saved);
    }
  }, []);

  // === Fetch news ===
  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        date: dateFilter,
        company: companyFilter,
      });
      const res = await fetch(`/api/news?${params}`);
      if (!res.ok) throw new Error("获取新闻失败");
      const data = await res.json();
      const sorted = (data.news || []).sort(
        (a: NewsItem, b: NewsItem) =>
          new Date(b.date).getTime() - new Date(a.date).getTime()
      );
      setNews(sorted);
      setNewsTotal(data.total || sorted.length);
      setPage(1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "获取新闻失败");
    } finally {
      setNewsLoading(false);
    }
  }, [dateFilter, companyFilter]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  // === Company helpers ===
  const startEdit = () => {
    setEditList([...companies]);
    setEditing(true);
  };

  const saveCompanies = async () => {
    setCompanies(editList);
    localStorage.setItem("companies", JSON.stringify(editList));
    setEditing(false);
    const doSave = async (key: string) => {
      try {
        const res = await fetch("/api/update-companies", {
          method: "POST",
          headers: { "Content-Type": "application/json", 'x-api-key': key },
          body: JSON.stringify({ companies: editList }),
        });
        if (res.status === 401) {
          openKeyDialog((newKey) => doSave(newKey));
          setError('请输入访问密钥后重试');
          return;
        }
        if (!res.ok) throw new Error('更新公司列表失败');
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '更新公司列表失败');
      }
    };
    await doSave(apiKey);
  };

  const addCompany = () => {
    const name = newCompany.trim();
    if (name && !editList.includes(name)) {
      setEditList([...editList, name]);
      setNewCompany("");
    }
  };

  const removeCompany = (i: number) => {
    setEditList(editList.filter((_, idx) => idx !== i));
  };

  const handleDragStart = (i: number) => {
    dragItem.current = i;
  };
  const handleDragEnter = (i: number) => {
    dragOver.current = i;
  };
  const handleDragEnd = () => {
    if (dragItem.current === null || dragOver.current === null) return;
    const list = [...editList];
    const [removed] = list.splice(dragItem.current, 1);
    list.splice(dragOver.current, 0, removed);
    dragItem.current = null;
    dragOver.current = null;
    setEditList(list);
  };

  // === Keyword actions ===
  const getActiveKeywords = () => keywords.filter((k) => k.trim());

  const handleSearchData = async () => {
    const kws = getActiveKeywords();
    if (!kws.length) return;
    setSearchLoading(true);
    setError("");
    const doSearch = async (key: string) => {
      try {
        const res = await fetch("/api/search-data", {
          method: "POST",
          headers: { "Content-Type": "application/json", 'x-api-key': key },
          body: JSON.stringify({ keywords: kws }),
        });
        if (res.status === 401) {
          openKeyDialog((newKey) => doSearch(newKey));
          setError('请输入访问密钥后重试');
          setSearchLoading(false);
          return;
        }
        if (!res.ok) throw new Error("查找数据失败");
        await fetchNews();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "查找数据失败");
      } finally {
        setSearchLoading(false);
      }
    };
    await doSearch(apiKey);
  };

  const handleReport = async () => {
    const kws = getActiveKeywords();
    if (!kws.length) return;
    setReportLoading(true);
    setError("");
    const doReport = async (key: string) => {
      try {
        const res = await fetch("/api/investment-report", {
          method: "POST",
          headers: { "Content-Type": "application/json", 'x-api-key': key },
          body: JSON.stringify({ keywords: kws }),
        });
        if (res.status === 401) {
          openKeyDialog((newKey) => doReport(newKey));
          setError('请输入访问密钥后重试');
          setReportLoading(false);
          return;
        }
        if (!res.ok) throw new Error("生成报告失败");
        await fetchNews();
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "生成报告失败");
      } finally {
        setReportLoading(false);
      }
    };
    await doReport(apiKey);
  };

  // === Pagination ===
  const totalPages = Math.max(1, Math.ceil(news.length / PAGE_SIZE));
  const pagedNews = news.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-gradient-to-r from-blue-700 to-indigo-700 text-white px-6 py-4 shadow-lg">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Newspaper className="w-6 h-6" /> 金融资讯平台
        </h1>
      </header>

      {/* Error toast */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError("")}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main layout */}
      <div className="flex flex-col lg:flex-row gap-4 p-4 lg:p-6">
        {/* === Left Column === */}
        <div className="w-full lg:w-48 shrink-0 overflow-hidden">
          <div className="bg-white rounded-xl shadow-lg p-4 overflow-hidden">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-blue-600" /> 上市公司
              </h2>
              {!editing ? (
                <button
                  onClick={startEdit}
                  className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-500"
                >
                  <Edit3 className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={saveCompanies}
                  className="p-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg"
                >
                  <Save className="w-4 h-4" />
                </button>
              )}
            </div>

            {!editing ? (
              <ul className="space-y-1">
                {companies.map((c, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm"
                  >
                    <span className="w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-700 rounded-full text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="text-gray-700">{c}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <>
                <ul className="space-y-1 mb-3">
                  {editList.map((c, i) => (
                    <li
                      key={i}
                      draggable
                      onDragStart={() => handleDragStart(i)}
                      onDragEnter={() => handleDragEnter(i)}
                      onDragEnd={handleDragEnd}
                      onDragOver={(e) => e.preventDefault()}
                      className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-gray-50 text-sm cursor-move"
                    >
                      <GripVertical className="w-4 h-4 text-gray-400" />
                      <span className="w-5 text-center text-xs text-gray-400">
                        {i + 1}
                      </span>
                      <span className="flex-1 text-gray-700">{c}</span>
                      <button
                        onClick={() => removeCompany(i)}
                        className="p-1 hover:bg-red-100 rounded text-red-400 hover:text-red-600"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-1 w-full overflow-hidden">
                  <input
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addCompany()}
                    placeholder="添加公司"
                    className="min-w-0 flex-1 border rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  />
                  <button
                    onClick={addCompany}
                    className="shrink-0 p-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* === Middle Column === */}
        <div className="flex-1 min-w-0">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="font-bold text-gray-800 flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-indigo-600" /> 最新要闻
                <button
                  onClick={fetchNews}
                  className="p-1 hover:bg-gray-100 rounded-lg text-gray-400"
                >
                  <RefreshCw
                    className={`w-4 h-4 ${newsLoading ? "animate-spin" : ""}`}
                  />
                </button>
              </h2>
              <div className="flex gap-2">
                <div className="relative">
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="appearance-none bg-gray-50 border rounded-lg px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="last3days">最近三天</option>
                    <option value="all">所有要闻</option>
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-2 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                  <select
                    value={companyFilter}
                    onChange={(e) => setCompanyFilter(e.target.value)}
                    className="appearance-none bg-gray-50 border rounded-lg px-3 py-1.5 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  >
                    <option value="all">所有公司</option>
                    {companies.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 absolute right-2 top-2 text-gray-400 pointer-events-none" />
                </div>
              </div>
            </div>

            {newsLoading ? (
              <div className="flex items-center justify-center py-12 text-gray-400">
                <Loader2 className="w-6 h-6 animate-spin mr-2" /> 加载中...
              </div>
            ) : pagedNews.length === 0 ? (
              <div className="text-center py-12 text-gray-400">暂无新闻</div>
            ) : (
              <ul className="divide-y">
                {pagedNews.map((item) => (
                  <li
                    key={item.id}
                    onClick={() => setSelectedNews(item)}
                    className="py-3 px-2 cursor-pointer hover:bg-blue-50 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm text-gray-800 group-hover:text-blue-600 font-medium truncate">
                        {item.title}
                      </span>
                      <span className="text-xs text-gray-400 whitespace-nowrap">
                        {item.date}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Pagination */}
            {news.length > 0 && (
              <div className="flex items-center justify-between mt-4 pt-3 border-t">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" /> 上一页
                </button>
                <span className="text-xs text-gray-500">
                  {page} / {totalPages}（共 {news.length} 条）
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  下一页 <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* === Right Column === */}
        <div className="w-full lg:w-48 shrink-0">
          <div className="bg-white rounded-xl shadow-lg p-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2 mb-4">
              <Search className="w-5 h-5 text-indigo-600" /> 提问关键词
            </h2>
            <div className="space-y-2 mb-4">
              {keywords.map((kw, i) => (
                <input
                  key={i}
                  value={kw}
                  onChange={(e) => {
                    const next = [...keywords];
                    next[i] = e.target.value;
                    setKeywords(next);
                  }}
                  className="w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                  placeholder={`关键词 ${i + 1}`}
                />
              ))}
            </div>
            <div className="space-y-2">
              <button
                onClick={handleSearchData}
                disabled={searchLoading || !getActiveKeywords().length}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {searchLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                {searchLoading ? "查找中..." : "查找数据信息"}
              </button>
              <button
                onClick={handleReport}
                disabled={reportLoading || !getActiveKeywords().length}
                className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {reportLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                {reportLoading ? "生成中，请稍候..." : "生成投资报告"}
              </button>
              {reportLoading && (
                <p className="text-xs text-center text-gray-400">
                  报告生成可能需要30-60秒
                </p>
              )}
              <div className="mt-4 pt-3 border-t flex justify-center">
                <button
                  onClick={() => openKeyDialog()}
                  className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                >
                  {apiKey ? '🔓 已认证' : '🔐 设置密钥'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* === News Detail Modal === */}
      {selectedNews && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedNews(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-4 rounded-t-xl flex items-start justify-between">
              <div className="flex-1 mr-4">
                <h3 className="font-bold text-lg leading-tight">
                  {selectedNews.title}
                </h3>
                <div className="flex gap-3 mt-2 text-sm text-blue-100">
                  <span>{selectedNews.date}</span>
                  <span>{selectedNews.company}</span>
                  <span>{selectedNews.readTime}</span>
                </div>
              </div>
              <button
                onClick={() => setSelectedNews(null)}
                className="p-1 hover:bg-white/20 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-6 py-4">
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {selectedNews.content}
              </div>
              {selectedNews.sources && selectedNews.sources.length > 0 && (
                <div className="mt-6 pt-4 border-t">
                  <h4 className="text-sm font-bold text-gray-600 mb-2">
                    信息来源
                  </h4>
                  <ul className="space-y-1">
                    {selectedNews.sources.map((src, i) => (
                      <li key={i}>
                        <a
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {src}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            {/* Modal footer */}
            <div className="flex items-center justify-between px-6 py-3 border-t">
              <button
                onClick={async () => {
                  if (!confirm('确定要删除这篇文章吗？')) return;
                  try {
                    const res = await fetch(`/api/news?id=${selectedNews.id}`, { method: 'DELETE' });
                    if (res.ok) {
                      setSelectedNews(null);
                      fetchNews();
                    }
                  } catch (e) {
                    console.error('Delete failed:', e);
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                删除此文章
              </button>
              <button
                onClick={() => setSelectedNews(null)}
                className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm rounded-lg transition-colors"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* === API Key Input Dialog === */}
      {showKeyDialog && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" 
          onClick={cancelKeyDialog}
        >
          <div 
            className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" 
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-gray-800 mb-4">🔐 请输入访问密钥</h3>
            <p className="text-sm text-gray-500 mb-4">需要密钥才能使用搜索、报告和管理功能。密钥将保存在浏览器中。</p>
            {/* 隐藏诱饵控件，防止浏览器对后面的真密码框做 autofill */}
            <input type="text" name="username" autoComplete="username" defaultValue="" style={{ display: 'none' }} aria-hidden="true" />
            <input
              type="password"
              name="api-key-secret-no-fill"
              autoComplete="new-password"
              data-lpignore="true"
              data-form-type="other"
              data-1p-ignore="true"
              value={keyInput}
              onChange={e => setKeyInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') submitKey();
              }}
              placeholder="输入密钥..."
              className="w-full border rounded-lg px-4 py-2 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button 
                onClick={cancelKeyDialog} 
                className="px-4 py-2 text-gray-500 hover:bg-gray-100 rounded-lg"
              >
                取消
              </button>
              <button
                onClick={submitKey}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
