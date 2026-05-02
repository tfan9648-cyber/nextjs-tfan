#!/usr/bin/env node
/**
 * 上市公司每日要闻抓取脚本
 * 通过 Tavily 搜索 + DeepSeek 总结,写入 Neon Postgres
 *
 * 用法: node scripts/fetch-daily-news.mjs
 * 环境变量: TAVILY_API_KEY, DEEPSEEK_API_KEY, DATABASE_URL
 */

import { neon } from '@neondatabase/serverless';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// === 配置 ===
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const DATABASE_URL = process.env.DATABASE_URL || '';

// === 公司-股票代码映射 ===
const COMPANY_STOCK_MAP = {
  "中国平安": "000001",
  "美的集团": "000333",
  "伊利股份": "600887",
  "招商银行": "600036",
  "贵州茅台": "600519",
  "泸州老窖": "000568",
  "腾讯控股": null,
  "阿里巴巴": null,
  "万华化学": "600309",
  "福耀玻璃": "600660",
  "昱能科技": "688348",
  "凌霄泵业": "002884",
  "长江电力": "600900"
};

// 从 config.json 动态读取公司列表,支持用户随时更新
import { readFileSync } from 'fs';

function loadCompanies() {
  try {
    // 获取当前脚本目录
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const configPath = join(currentDir, '..', 'data', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.supportedCompanies && config.supportedCompanies.length > 0) {
      console.log(`📋 从 config.json 加载 ${config.supportedCompanies.length} 家公司`);
      return config.supportedCompanies;
    }
  } catch (e) {
    console.warn('⚠️ 无法读取 config.json,使用默认公司列表:', e.message);
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
    topic: options.topic || 'general',
    ...(options.timeRange && { time_range: options.timeRange }),
    ...(options.includeDomains && { include_domains: options.includeDomains }),
  };
  // 添加 includeRawContent 和 searchDepth 参数
  if (options.includeRawContent) body.include_raw_content = true;
  if (options.searchDepth) body.search_depth = options.searchDepth;
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
      rawContent: r.raw_content || '',
    }));
  } catch (e) {
    console.error(`Tavily failed for "${query}":`, e.message);
    return [];
  }
}

// === AKShare 搜索 ===
function searchAkShare(stockCode) {
  try {
    // 获取当前脚本目录
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const scriptPath = join(currentDir, 'fetch_akshare_news.py');
    const command = `${scriptPath} ${stockCode}`;
    const result = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024, // 1MB
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });

    if (!result.trim()) {
      console.log(`  i️  AKShare 返回空结果 (股票: ${stockCode})`);
      return [];
    }

    const news = JSON.parse(result.trim());
    console.log(`  i️  AKShare 返回 ${news.length} 条新闻 (股票: ${stockCode})`);
    return news.map(item => ({
      title: item.title || '',
      url: item.url || '',
      snippet: item.content || '',
      source: item.source || '东方财富',
      publishTime: item.publishTime || ''
    }));
  } catch (error) {
    console.error(`  ❌ AKShare 搜索失败 (股票: ${stockCode}):`, error.message);
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
        { role: 'system', content: '你是一位专业的财经新闻编辑和数据分析师。请根据搜索结果,为指定上市公司撰写过去24小时内的要闻摘要。\n\n核心要求:\n1. 严格只总结最近24小时的新闻,忽略更早的旧闻\n2. 如果新闻涉及财报/业绩数据,必须提取并列出所有具体财务数字:\n   - 营业收入及同比增长率\n   - 净利润及同比增长率\n   - 扣非净利润及同比增长率\n   - 每股收益(EPS)\n   - 每股净资产\n   - 净资产收益率(ROE)\n   - 毛利率、净利率\n   - 经营性现金流\n3. 数据必须是具体的数字,不能只说"增长"而不给数据\n4. 标注信息来源\n5. 如果没有最近24小时的新闻,直接说明暂无重要新闻\n6. 输出纯文本，不要使用任何markdown格式符号（如*、#、-列表等）。用换行和空行分隔段落，用数字序号代替列表符号。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 3000,
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

  // 获取股票代码
  const stockCode = COMPANY_STOCK_MAP[company];
  let results = [];

  if (stockCode) {
    // 使用 AKShare 抓取
    results = searchAkShare(stockCode);
    // AKShare 已经过滤了今日新闻,如果为空则说明今天没有新闻
    if (results.length === 0) {
      console.log(`  ⏭️  ${company}(${stockCode}): 今日暂无新闻`);
      return null;
    }
  } else {
    // 腾讯、阿里等无法用AKShare的,回退到Tavily
    if (!TAVILY_API_KEY) {
      console.error(`  ❌ ${company}: 需要TAVILY_API_KEY但未配置`);
      return null;
    }
    console.log(`  ⚠️  ${company}: 无法使用AKShare,回退到Tavily`);

    // 搜索国内财经网站,topic 用 general(Tavily 的 news 偏英文源)
    const CN_FINANCE_DOMAINS = [
      'eastmoney.com',    // 东方财富
      'sina.com.cn',      // 新浪财经
      '10jqka.com.cn',    // 同花顺
      'cls.cn',           // 财联社
      'wallstreetcn.com', // 华尔街见闻
      '36kr.com',         // 36氪
      'cninfo.com.cn',    // 巨潮资讯(公告)
      'stcn.com',         // 证券时报
      'cs.com.cn',        // 中证网
      'caixin.com',       // 财新
    ];
    // 增强 Tavily 搜索参数,包含财务数据
    results = await searchTavily(`${company} 今日最新新闻 公告 财报数据`, {
      maxResults: 8,
      searchDepth: 'advanced',
      topic: 'general',
      timeRange: 'day',
      includeDomains: CN_FINANCE_DOMAINS,
      includeRawContent: true,
    });
  }

  if (results.length === 0) {
    console.log(`  ⏭️  ${company}: 无新闻`);
    return null;
  }

  // 构建上下文(包含发布时间以便 AI 判断新旧)
  let context = `公司: ${company}\n搜索结果:\n\n`;
  results.forEach((r, i) => {
    const timeInfo = r.publishTime ? `   发布时间: ${r.publishTime}\n` : '';
    context += `${i + 1}. ${r.title}\n${timeInfo}   ${r.snippet}\n`;
    // 如果有原始内容(Tavily advanced 搜索),截取前1500字符
    if (r.rawContent) {
      const truncated = r.rawContent.slice(0, 1500);
      context += `   详细内容: ${truncated}\n`;
    }
    context += `   来源: ${r.url}\n\n`;
  });

  const prompt = `${context}
今天日期: ${today}
请为"${company}"撰写今日要闻摘要。要求:
1. 严格只总结今天(${today})的新闻。注意:有些新闻虽然发布时间是今天,但内容实际是过去年份的旧数据(例如内容提到"2024年"、"2025年一季度"等旧报告期),这些应视为旧闻并忽略。只保留真正与当前时间相关的新闻
2. 标题格式:${company}+核心事件(不超过25字)
3. 正文200-800字,突出关键信息,尤其是具体的财务数据
4. 如果涉及财报/业绩公告,从所有参考资料(含详细内容区)中只要能找到的财务指标都要提取:营收、净利润、扣非净利润、EPS、ROE、毛利率、现金流等。年报和季报同时发布时,两者都要分别详细呈现
5. 如果提到分红方案,必须详到「每10股派XX元」「分红总额XX亿元」这种具体数字;没查到具体数字则不要提分红
6. 如果涉及董事长/高管表态,必须从原文中摘取其具体观点并用一句话概括(例如"董事长表示对未来发展有信心,预计将带来令人愉悦的业绩")。不要只写"董事长发声""董事长发表了看法"这种空话
7. 标注信息来源链接
8. 如果所有搜索结果都是旧闻,请说明"暂无重要新闻"

【重要】写作约束:
· 查不到的财务指标/分红金额/董事长原话等,直接在文中省略,不要出现「未在摘要中明确提及」「未提供」「需查阅完整公告」这类废话
· 宁可文本短一点,不要凑字数
· 不要加「分析师点评」「投资者需关注」这种套话段落
· 严禁 Markdown 符号:不要用 *、**、#、##、---、行首 - 连字符。列表项用「· 」或「1. 2. 3.」

以JSON返回(不要markdown代码块):
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

    // 清洗 Markdown 符号与废话句
    content = content
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\*\*(.+?)\*\*/g, '$1')
      .replace(/\*(.+?)\*/g, '$1')
      .replace(/^\s*[-*]\s+/gm, '· ')
      .replace(/^---+$/gm, '')
      .replace(/^>\s+/gm, '')
      // 删除包含「未...提供/未明确提及/需查阅」的整行
      .replace(/^[^\n]*?(未[^\n]{0,15}提供|未在[^\n]{0,30}明确提及|需查阅完整公告|未在提供的摘要)[^\n]*$\n?/gm, '')
      // 删除「分析师点评」套话段
      .replace(/(分析师点评|点评|投资者需关注)[\s\S]*$/m, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    // 跳过“暂无重要新闻”
    if (content.includes('暂无重要新闻') || content.includes('暂无重要') || content.includes('没有找到') || content.includes('未发现') || content.includes('无重要新闻') || content.includes('暂无新闻') || title.includes('暂无') || title.includes('无重要新闻') || content.includes('没有发布') || content.includes('无直接相关') || content.includes('暂时没有') || content.includes('无相关新闻')) {
      console.log(`  ⏭️  ${company}: 暂无重要新闻`);
      return null;
    }

    const timestamp = Date.now();
    const id = `company-news-${company}-${today}-${timestamp}`;
    const sources = results.map(r => r.url);

    if (sql) {
      await sql`
        INSERT INTO news (id, date, company, title, summary, content, sources, category, read_time, is_keyword_search, timestamp, keywords)
        VALUES (${id}, ${today}, ${company}, ${`【${today}】${title}`}, ${summary}, ${content}, ${JSON.stringify(sources)}, ${'company_news'}, ${'2分钟阅读'}, ${false}, ${timestamp}, ${JSON.stringify([company])})
        ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content, summary = EXCLUDED.summary, sources = EXCLUDED.sources
      `;
      console.log(`  ✅ ${company}: ${title}`);
    } else {
      console.log(`  ✅ ${company}: ${title} (DRY_RUN)`);
    }
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

  const dryRun = process.env.DRY_RUN === '1';

  if (!dryRun && (!TAVILY_API_KEY || !DEEPSEEK_API_KEY || !DATABASE_URL)) {
    console.error('❌ 缺少环境变量: TAVILY_API_KEY / DEEPSEEK_API_KEY / DATABASE_URL');
    process.exit(1);
  }
  const sql = dryRun ? null : neon(DATABASE_URL);

  if (!dryRun) {
    await initDb(sql);
  } else {
    console.log('🧪 DRY_RUN模式: 跳过数据库操作');
  }

  const today = new Date().toISOString().split('T')[0];
  let successCount = 0;

  // 串行处理,避免 API 限速
  for (const company of COMPANIES) {
    const result = await fetchCompanyNews(company, today, dryRun ? null : sql);
    if (result) successCount++;
    // 间隔1秒,防止限速
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log('');
  console.log(`🎉 完成! 成功抓取 ${successCount}/${COMPANIES.length} 家公司新闻`);
  if (dryRun) {
    console.log('📝 注意: 这是DRY_RUN测试,未实际写入数据库');
  }
}

main().catch(e => {
  console.error('💥 脚本执行失败:', e);
  process.exit(1);
});
