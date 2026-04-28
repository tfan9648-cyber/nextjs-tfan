#!/usr/bin/env node
/**
 * 上市公司每日要闻抓取脚本
 * 通过 Tavily 搜索 + DeepSeek 总结，写入 Neon Postgres
 * 
 * 用法: node scripts/fetch-daily-news.mjs
 * 环境变量: TAVILY_API_KEY, DEEPSEEK_API_KEY, DATABASE_URL
 */

import { neon } from '@neondatabase/serverless';

// === 配置 ===
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const DATABASE_URL = process.env.DATABASE_URL || '';

// 从 config.json 动态读取公司列表，支持用户随时更新
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadCompanies() {
  try {
    const configPath = join(__dirname, '..', 'data', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.supportedCompanies && config.supportedCompanies.length > 0) {
      console.log(`📋 从 config.json 加载 ${config.supportedCompanies.length} 家公司`);
      return config.supportedCompanies;
    }
  } catch (e) {
    console.warn('⚠️ 无法读取 config.json，使用默认公司列表:', e.message);
  }
  // fallback
  return ["中国平安", "美的集团", "伊利股份", "招商银行", "贵州茅台",
    "泸州老窖", "腾讯控股", "阿里巴巴", "万华化学", "福耀玻璃",
    "昱能科技", "凌霄泵业", "长江电力"];
}

const COMPANIES = loadCompanies();

// === Tavily 搜索 ===
async function searchTavily(query, options = {}) {
  if (!TAVILY_API_KEY) { console.error('❌ TAVILY_API_KEY not set'); return []; }
  const body = {
    api_key: TAVILY_API_KEY,
    query,
    max_results: options.maxResults || 5,
    search_depth: options.searchDepth || 'basic',
    topic: options.topic || 'news',
    ...(options.timeRange && { time_range: options.timeRange }),
  };
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) { console.error(`Tavily error: ${res.status}`); return []; }
    const data = await res.json();
    return (data.results || []).map(r => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
    }));
  } catch (e) {
    console.error(`Tavily failed for "${query}":`, e.message);
    return [];
  }
}

// === DeepSeek 调用 ===
async function callDeepSeek(prompt) {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: '你是一位专业的财经新闻编辑。请根据搜索结果，为指定上市公司撰写当日要闻摘要。要求：简洁准确，突出重点，标注信息来源。如果没有重要新闻，直接说明即可。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`DeepSeek error: ${res.status}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

// === 初始化数据库 ===
async function initDb(sql) {
  await sql`
    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      content TEXT DEFAULT '',
      sources JSONB DEFAULT '[]',
      category TEXT DEFAULT 'company_news',
      read_time TEXT DEFAULT '',
      is_keyword_search BOOLEAN DEFAULT false,
      timestamp BIGINT,
      keywords JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_news_date ON news(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_news_company ON news(company)`;
}

// === 抓取单个公司新闻 ===
async function fetchCompanyNews(company, today, sql) {
  console.log(`🔍 搜索: ${company}...`);

  const results = await searchTavily(`${company} 最新新闻 公告`, {
    maxResults: 5,
    topic: 'news',
    timeRange: 'day',
  });

  if (results.length === 0) {
    console.log(`  ⏭️  ${company}: 无新闻`);
    return null;
  }

  // 构建上下文
  let context = `公司: ${company}\n搜索结果:\n\n`;
  results.forEach((r, i) => {
    context += `${i + 1}. ${r.title}\n   ${r.snippet}\n   来源: ${r.url}\n\n`;
  });

  const prompt = `${context}\n请为"${company}"撰写今日要闻摘要。要求：
1. 标题格式：${company}+核心事件（不超过25字）
2. 正文200-500字，突出关键信息
3. 标注信息来源链接
4. 如果搜索结果与该公司无直接关系，请说明"暂无重要新闻"

以JSON返回（不要markdown代码块）：
{"title": "标题", "summary": "一句话摘要", "content": "正文"}`;

  try {
    const aiResponse = await callDeepSeek(prompt);
    let title = `${company}今日要闻`;
    let summary = '';
    let content = aiResponse;

    const jsonMatch = aiResponse.match(/\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        title = parsed.title || title;
        summary = parsed.summary || '';
        content = parsed.content || aiResponse;
      } catch { /* use raw */ }
    }

    // 跳过"暂无重要新闻"
    if (content.includes('暂无重要新闻') || content.includes('暂无重要') || content.includes('没有找到') || content.includes('未发现') || content.includes('无重要新闻') || content.includes('暂无新闻') || title.includes('暂无')) {
      console.log(`  ⏭️  ${company}: 暂无重要新闻`);
      return null;
    }

    const timestamp = Date.now();
    const id = `company-news-${company}-${today}-${timestamp}`;
    const sources = results.map(r => r.url);

    await sql`
      INSERT INTO news (id, date, company, title, summary, content, sources, category, read_time, is_keyword_search, timestamp, keywords)
      VALUES (${id}, ${today}, ${company}, ${`【${today}】${title}`}, ${summary}, ${content}, ${JSON.stringify(sources)}, ${'company_news'}, ${'2分钟阅读'}, ${false}, ${timestamp}, ${JSON.stringify([company])})
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, summary = EXCLUDED.summary, sources = EXCLUDED.sources
    `;

    console.log(`  ✅ ${company}: ${title}`);
    return { company, title };
  } catch (e) {
    console.error(`  ❌ ${company} AI处理失败:`, e.message);
    return null;
  }
}

// === 主流程 ===
async function main() {
  console.log('🚀 开始每日上市公司新闻抓取...');
  console.log(`📅 日期: ${new Date().toISOString().split('T')[0]}`);
  console.log(`📊 公司数: ${COMPANIES.length}`);
  console.log('');

  if (!TAVILY_API_KEY || !DEEPSEEK_API_KEY || !DATABASE_URL) {
    console.error('❌ 缺少环境变量: TAVILY_API_KEY / DEEPSEEK_API_KEY / DATABASE_URL');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);
  await initDb(sql);

  const today = new Date().toISOString().split('T')[0];
  let successCount = 0;

  // 串行处理，避免 API 限速
  for (const company of COMPANIES) {
    const result = await fetchCompanyNews(company, today, sql);
    if (result) successCount++;
    // 间隔1秒，防止限速
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('');
  console.log(`🎉 完成! 成功抓取 ${successCount}/${COMPANIES.length} 家公司新闻`);
}

main().catch(e => {
  console.error('💥 脚本执行失败:', e);
  process.exit(1);
});
