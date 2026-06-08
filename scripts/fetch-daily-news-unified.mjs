#!/usr/bin/env node
/**
 * 上市公司每日要闻抓取脚本 (AKShare + yfinance 双数据源)
 * 
 * 数据源: AKShare (A股/港股) + yfinance (港股/美股)
 * 公司来源: 从数据库 config 表读取 supported_companies（与网页左边栏同步）
 * 摘要格式: "事件-影响-后续" 三段式，300字内
 * 晨报: 仅包含有新闻的公司
 * 
 * 符合 net-summary.md 任务要求
 * 创建时间: 2026-06-08
 */
import { neon } from '@neondatabase/serverless';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { config as dotenvConfig } from 'dotenv';

// 加载 .env.local
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env.local') });

// Python 路径: 使用 akshare_venv (同时含 akshare + yfinance)
const PYTHON_PATH = join(__dirname, 'akshare_venv', 'bin', 'python3');

// === 配置 ===
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const DATABASE_URL = process.env.DATABASE_URL || '';

// ============================================================
// 股票代码映射（硬编码 + 自动查找）
// 说明: 优先使用硬编码映射，未命中时自动通过 AKShare/yfinance 查找
// ============================================================

// A股公司 → AKShare 代码（6位纯数字）
const A_STOCK_MAP = {
  "中国平安": "601318",
  "美的集团": "000333",
  "伊利股份": "600887",
  "招商银行": "600036",
  "贵州茅台": "600519",
  "泸州老窖": "000568",
  "万华化学": "600309",
  "福耀玻璃": "600660",
  "昱能科技": "688348",
  "凌霄泵业": "002884",
  "长江电力": "600900",
  "国投电力": "600886",
  "川投能源": "600674",
  "平安银行": "000001",
};

// 港股/美股公司 → yfinance ticker
const HK_US_STOCK_MAP = {
  "腾讯控股": "0700.HK",
  "阿里巴巴": "9988.HK",
  "中国海洋石油": "0883.HK",
  "华润电力": "0836.HK",
  "申洲国际": "2313.HK",
  "金斯瑞生物科技": "1548.HK",
  "美团-W": "3690.HK",
  "安踏体育": "2020.HK",
  "中国移动": "0941.HK",
  "哔哩哔哩": "BILI",
  "Teladoc Health": "TDOC",
};

// ============================================================
// 公司列表获取（从数据库 config 表，与网页左边栏同步）
// ============================================================

/**
 * 从数据库 config 表读取公司列表
 * 这与网站左边栏"上市公司"列表数据源完全一致
 */
async function loadCompaniesFromDB(sql) {
  try {
    const rows = await sql`SELECT value FROM config WHERE key = 'supported_companies'`;
    if (rows.length > 0 && Array.isArray(rows[0].value) && rows[0].value.length > 0) {
      console.log(`📋 从数据库加载公司列表（与网页左边栏同步）: ${rows[0].value.length} 家`);
      return rows[0].value;
    }
    throw new Error('数据库无 supported_companies 配置');
  } catch (error) {
    console.error('❌ 读取公司列表失败:', error.message);
    throw error;
  }
}

// ============================================================
// 股票代码自动补全
// ============================================================

/**
 * 解析公司对应的股票代码和数据源
 * 1. 优先查硬编码映射
 * 2. 尝试 AKShare 查 A 股
 * 3. 尝试 yfinance 查港股/美股
 */
async function resolveCompanyCode(company) {
  // 1. 硬编码映射
  if (A_STOCK_MAP[company]) {
    return { symbol: A_STOCK_MAP[company], source: 'akshare' };
  }
  if (HK_US_STOCK_MAP[company]) {
    return { symbol: HK_US_STOCK_MAP[company], source: 'yfinance' };
  }

  // 2. 尝试 AKShare 自动查 A 股
  console.log(`🔍 ${company}: 尝试自动查找A股代码...`);
  const akCode = await lookupAStockCode(company);
  if (akCode) {
    console.log(`✅ ${company}: 自动找到 A 股代码 ${akCode}`);
    return { symbol: akCode, source: 'akshare' };
  }

  // 3. 尝试 yfinance 查港股/美股
  console.log(`🔍 ${company}: 尝试 yfinance 查港股/美股...`);
  const yfCode = await lookupYfinanceTicker(company);
  if (yfCode) {
    console.log(`✅ ${company}: 自动找到 yfinance ticker ${yfCode}`);
    return { symbol: yfCode, source: 'yfinance' };
  }

  console.warn(`⚠️  ${company}: 无法自动匹配股票代码`);
  return null;
}

/**
 * 用 AKShare 查 A 股代码
 */
async function lookupAStockCode(company) {
  try {
    const pythonScript = `
import sys
import akshare as ak

company_name = sys.argv[1]
df = ak.stock_info_a_code_name()
matches = df[df['name'].str.contains(company_name)]
if len(matches) > 0:
    print(matches.iloc[0]['code'])
else:
    short_name = company_name.replace('集团', '').replace('股份', '').replace('控股', '').replace('-W', '').replace('-S', '')
    matches = df[df['name'].str.contains(short_name)]
    if len(matches) > 0:
        print(matches.iloc[0]['code'])
    else:
        print('')
`;
    const cleanEnv = getCleanEnv();
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, company], {
      encoding: 'utf-8', timeout: 15000, env: cleanEnv
    });
    return (proc.stdout || '').trim() || null;
  } catch {
    return null;
  }
}

/**
 * 用 yfinance 搜索港股/美股 ticker
 */
async function lookupYfinanceTicker(company) {
  try {
    const pythonScript = `
import sys
import yfinance as yf

company = sys.argv[1]
clean = company.replace('-W', '').replace('-S', '').replace('-B', '')

try:
    results = yf.search(clean, max_results=5)
    quotes = results.get('quotes', []) if isinstance(results, dict) else []
    # 优先港股
    for q in quotes:
        symbol = q.get('symbol', '')
        if '.HK' in symbol:
            print(symbol)
            break
    else:
        # 没有港股则看美股
        for q in quotes:
            symbol = q.get('symbol', '')
            exchange = q.get('exchange', '')
            if exchange in ['NYQ', 'NMS', 'NGM']:
                print(symbol)
                break
except Exception:
    pass
`;
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, company], {
      encoding: 'utf-8', timeout: 20000
    });
    return (proc.stdout || '').trim() || null;
  } catch {
    return null;
  }
}

// ============================================================
// 新闻抓取: AKShare (A股/港股)
// ============================================================

/**
 * 用 AKShare 抓取 A 股新闻，过滤24小时内
 */
async function fetchNewsAKShare(company, symbol, cutoffBeijingTime) {
  try {
    console.log(`📡 ${company} [AKShare]: 抓取 A 股代码 ${symbol}...`);

    const pythonScript = `
import sys
import json
import datetime
import akshare as ak

symbol = sys.argv[1]
cutoff_str = sys.argv[2]
cutoff_dt = datetime.datetime.strptime(cutoff_str, "%Y-%m-%d %H:%M:%S")

df = ak.stock_news_em(symbol=symbol)

result = []
if not df.empty:
    original_count = 0
    filtered_count = 0

    for _, row in df.iterrows():
        original_count += 1
        publish_time_str = str(row.get('发布时间', ''))
        if not publish_time_str or len(publish_time_str) < 10:
            continue
        try:
            publish_dt = datetime.datetime.strptime(publish_time_str, "%Y-%m-%d %H:%M:%S")
            if publish_dt >= cutoff_dt:
                news_item = {
                    "title": str(row.get('新闻标题', '')).strip(),
                    "content": str(row.get('新闻内容', '')).replace('\\ue628', '').strip(),
                    "source": str(row.get('文章来源', '')).strip(),
                    "url": str(row.get('新闻链接', '')).strip(),
                    "publishTime": publish_time_str
                }
                if news_item['title'] and news_item['url']:
                    result.append(news_item)
                    filtered_count += 1
        except ValueError:
            continue

    print(f"[DEBUG] {symbol} 原始: {original_count}, 24h内: {filtered_count}", file=sys.stderr)
    result.sort(key=lambda x: x['publishTime'], reverse=True)
    result = result[:5]

print(json.dumps(result, ensure_ascii=False))
`;

    const cleanEnv = getCleanEnv();
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, symbol, cutoffBeijingTime], {
      encoding: 'utf-8', timeout: 30000, env: cleanEnv
    });

    if (proc.error) {
      console.error(`❌ ${company} AKShare错误:`, proc.error.message);
      return null;
    }

    if (proc.stderr?.trim()) {
      const debugMatch = proc.stderr.match(/\[DEBUG\].*/);
      if (debugMatch) console.log(`   ${debugMatch[0]}`);
    }

    const output = proc.stdout?.trim();
    if (!output) {
      console.log(`📭 ${company}: AKShare 无24小时内新闻`);
      return null;
    }

    const newsItems = JSON.parse(output);
    if (newsItems.length === 0) {
      console.log(`📭 ${company}: AKShare 24小时内无有效新闻`);
      return null;
    }

    console.log(`✅ ${company}: AKShare 找到 ${newsItems.length} 条24h内新闻`);
    return newsItems;
  } catch (error) {
    console.error(`❌ ${company} AKShare 抓取失败:`, error.message);
    return null;
  }
}

// ============================================================
// 新闻抓取: yfinance (港股/美股)
// ============================================================

/**
 * 用 yfinance 抓取港股/美股新闻
 */
async function fetchNewsYfinance(company, ticker) {
  try {
    console.log(`🌐 ${company} [yfinance]: 抓取 ticker ${ticker}...`);

    const pythonScript = `
import sys
import json
import datetime
import yfinance as yf

ticker = sys.argv[1]
t = yf.Ticker(ticker)
news = t.news

result = []
if news:
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(hours=24)

    for item in news[:10]:
        content = item.get('content', {})
        pub_str = content.get('pubDate', '')
        if not pub_str:
            continue
        try:
            pub_dt = datetime.datetime.fromisoformat(pub_str.replace('Z', '+00:00'))
            if pub_dt >= cutoff:
                title = content.get('title', '').strip()
                summary = content.get('summary', '').strip()
                if title and len(title) > 5:
                    result.append({
                        'title': title,
                        'content': summary if summary else title,
                        'source': 'Yahoo Finance',
                        'url': content.get('canonicalUrl', {}).get('url', ''),
                        'publishTime': pub_str
                    })
        except:
            continue

result = result[:5]
print(json.dumps(result, ensure_ascii=False))
`;

    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, ticker], {
      encoding: 'utf-8', timeout: 30000
    });

    if (proc.error) {
      console.error(`❌ ${company} yfinance错误:`, proc.error.message);
      return null;
    }

    const output = proc.stdout?.trim();
    if (!output) {
      console.log(`📭 ${company}: yfinance 无24小时内新闻`);
      return null;
    }

    const newsItems = JSON.parse(output);
    if (newsItems.length === 0) {
      console.log(`📭 ${company}: yfinance 24小时内无有效新闻`);
      return null;
    }

    console.log(`✅ ${company}: yfinance 找到 ${newsItems.length} 条24h内新闻`);
    return newsItems;
  } catch (error) {
    console.error(`❌ ${company} yfinance 抓取失败:`, error.message);
    return null;
  }
}

// ============================================================
// AI 摘要生成 (DeepSeek)
// ============================================================

/**
 * 用 DeepSeek 生成标题和摘要
 * 格式: JSON {"title": "...", "summary": "..."}
 * 摘要: 300字内，按"事件-影响-后续"逻辑组织
 */
async function summarizeWithDeepSeek(company, newsItems) {
  if (!newsItems || newsItems.length === 0) return null;

  try {
    const allContent = newsItems.map(n => `[${n.source}] ${n.title}\n${n.content}`).join('\n\n');

    const prompt = `你是一名财经新闻编辑。请根据以下关于${company}的新闻内容，汇总并总结后生成「标题」和「摘要」。

要求:
- title: 12~20字，体现新闻摘要核心内容。必须包含具体事件/数据/动作（如"净利润同比增长12%""签订50亿合作协议"），严禁使用"重要动态""业务动态""最新进展"等空泛表述。
- summary: 300字以内的纯文本段落，按"事件-影响-后续"逻辑组织形成连贯段落。客观中立的财经报道风格，突出关键数据和事件。
  - 事件: 客观描述发生了什么
  - 影响: 分析对公司/行业/市场的影响
  - 后续: 展望后续可能发展
- 重点捕捉: 业务动态、战略合作、产品发布、人事变动、政策影响、行业地位变化等实质新闻
- 如果新闻内容无明显实质内容（仅广告、营销软文等），返回 {"title": null, "summary": null}
- 禁止使用任何列表符号(* - 数字等)，使用正常的中文标点符号
- 严格只输出JSON，不要任何解释、不要markdown代码块

输出格式:
{"title": "...", "summary": "..."}

新闻内容:
${allContent}`;

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 700,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const raw = data.choices[0].message.content.trim();

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      console.warn(`⚠️  ${company}: JSON解析失败，跳过`);
      return null;
    }

    const title = (parsed.title || '').trim();
    const summary = (parsed.summary || '').trim();

    // AI 判断无实质内容时返回 null
    if (!title || !summary || title === 'null' || summary === 'null') {
      console.log(`⏭️  ${company}: AI判断无明显实质内容，不入库`);
      return null;
    }

    return { title, summary };
  } catch (error) {
    console.error(`❌ ${company} AI摘要失败:`, error.message);
    return null;
  }
}

// ============================================================
// 上市公司晨报生成
// ============================================================

/**
 * 用 DeepSeek 生成上市公司晨报
 * 格式: 每个公司独立成段，段落之间空一行，纯文本简洁模式
 */
async function generateMorningBriefing(companySummaries) {
  if (!companySummaries || companySummaries.length === 0) return null;

  const summaryList = companySummaries.map(s => `${s.company}: ${s.summary}`).join('\n\n');

  const prompt = `你是财经新闻编辑。请根据以下各公司新闻摘要，生成一篇简洁的"上市公司晨报"。

要求：
- 按公司独立成段，每个公司不超过100字
- 每段开头用公司名称
- 段落之间空一行
- 使用正常的中文标点符号（逗号、句号、顿号、冒号等）
- 不要使用markdown格式（不要星号、横杠、井号、方括号等）
- 不要使用emoji或特殊符号
- 客观中立的财经报道风格，突出关键数据和事件
- 直接输出正文，不要加任何前言、标题或结尾总结
- 只包含以下有新闻的公司，不要编造没有新闻的公司内容

各公司新闻摘要：
${summaryList}`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000
      })
    });

    if (!response.ok) throw new Error(`API请求失败: ${response.status}`);

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ 晨报生成失败:', error.message);
    return null;
  }
}

// ============================================================
// 数据库操作
// ============================================================

// ============================================================
// 摘要质量二次过滤
// ============================================================

/**
 * 检测摘要是否为低质量/无实质内容
 * 返回 true 表示应该丢弃
 */
function isLowQualitySummary(company, summary) {
  if (!summary || summary.length < 20) return true;

  const noContentPatterns = [
    '未能提取到具体',
    '未包含与.*相关',
    '未提及.*自身',
    '未涉及.*自身',
    '无法生成标题',
    '暂无符合要求的新闻',
    '暂无.*可供报道',
    '新闻内容未涉及',
    '未包含.*具体事件',
    '新闻摘要中提及.*但未包含',
  ];

  for (const pattern of noContentPatterns) {
    if (new RegExp(pattern).test(summary)) {
      return true;
    }
  }

  // 检测摘要主要讲的是其他公司而非目标公司
  if (summary.includes('未提及') || summary.includes('未涉及')) {
    if (summary.includes(`未提及${company}`) || summary.includes(`未涉及${company}`)) {
      return true;
    }
  }

  return false;
}

// ============================================================
// 入库函数
// ============================================================

/**
 * 在写入新记录前，删除某公司今日的旧 company_news 记录（避免重复入库）
 * 只有当有新的新闻要入库时才调用此函数
 */
async function deleteDuplicateTodayRecordsIfAny(sql, company) {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await sql`
      DELETE FROM news
      WHERE company = ${company}
        AND category = 'company_news'
        AND date = ${today}
    `;
    
    if (result.rowCount > 0) {
      console.log(`🗑️  ${company}: 已删除 ${result.rowCount} 条当日旧记录`);
    }
  } catch (error) {
    console.error(`⚠️  ${company}: 删除当日重复记录失败 - ${error.message}`);
  }
}

/**
 * 写入公司新闻到数据库
 */
async function writeCompanyNews(sql, company, summaryObj, newsItems) {
  if (!summaryObj || !summaryObj.summary) {
    console.log(`⏭️ ${company}: 无总结内容，跳过入库`);
    return false;
  }

  const { title: aiTitle, summary } = summaryObj;

  try {
    const today = new Date().toISOString().split('T')[0];

    // 构建完整内容（含原始新闻链接）
    const fullContent = summary + '\n\n---\n\n原始新闻:\n' +
      newsItems.map((n, i) => `${i + 1}. ${n.title} - ${n.source} (${n.publishTime})`).join('\n');

    // 删除今天该公司的旧记录（避免重复）
    await sql`DELETE FROM news WHERE date = ${today} AND company = ${company} AND category = 'company_news'`;

    // 生成标题
    const cleanedTitle = (aiTitle || '').replace(/^【[^】]*】/, '').trim();
    let unifiedTitle;
    if (cleanedTitle && cleanedTitle.length >= 6 && !/重要动态|业务动态|最新进展/.test(cleanedTitle)) {
      unifiedTitle = `【${today}】${company}·${cleanedTitle}`;
    } else {
      unifiedTitle = `【${today}】${company}重要动态`;
    }

    const timestamp = Date.now();
    const companySlug = company.replace(/[\s\/]/g, '-');
    const id = `company-news-${companySlug}-${today}-${timestamp}`;

    // 收集原始新闻链接
    const sources = newsItems
      .map(n => n.url)
      .filter(u => u && u.startsWith('http'));

    await sql`
      INSERT INTO news (id, date, company, title, summary, content, sources, category, timestamp, created_at)
      VALUES (${id}, ${today}, ${company}, ${unifiedTitle}, ${summary}, ${fullContent}, ${JSON.stringify(sources)}, 'company_news', ${timestamp}, NOW())
    `;

    console.log(`💾 ${company}: 入库成功 → ${unifiedTitle}`);
    return true;
  } catch (error) {
    console.error(`❌ ${company} 入库失败:`, error.message);
    return false;
  }
}

/**
 * 写入上市公司晨报
 */
async function writeMorningBriefing(sql, briefing) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();
    const briefingId = `morning-briefing-${today}-${timestamp}`;

    // 删除今日旧的晨报
    await sql`DELETE FROM news WHERE date = ${today} AND category = 'morning_briefing'`;

    await sql`
      INSERT INTO news (id, date, company, title, summary, content, category, timestamp, created_at)
      VALUES (${briefingId}, ${today}, '上市公司晨报', ${`【${today}】上市公司晨报`}, ${briefing}, ${briefing}, 'morning_briefing', ${timestamp}, NOW())
    `;

    console.log('✅ 上市公司晨报已入库');
    return true;
  } catch (error) {
    console.error('❌ 晨报入库失败:', error.message);
    return false;
  }
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 获取清除代理的环境变量（AKShare 不能走代理）
 */
function getCleanEnv() {
  const cleanEnv = { ...globalThis.process.env };
  delete cleanEnv.HTTP_PROXY;
  delete cleanEnv.HTTPS_PROXY;
  delete cleanEnv.http_proxy;
  delete cleanEnv.https_proxy;
  delete cleanEnv.ALL_PROXY;
  delete cleanEnv.all_proxy;
  return cleanEnv;
}

/**
 * 获取24小时前的北京时间字符串
 */
function getCutoffBeijingTime() {
  const now = new Date();
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return twentyFourHoursAgo.toLocaleString('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false, timeZone: 'Asia/Shanghai'
  }).replace(/\//g, '-').replace(',', '');
}

// ============================================================
// 主函数
// ============================================================

async function main() {
  console.log('🚀 上市公司新闻抓取 (AKShare + yfinance 双数据源)');
  console.log('========================================');

  // 检查环境变量
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ 缺少 DEEPSEEK_API_KEY');
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error('❌ 缺少 DATABASE_URL');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  // 从数据库加载公司列表（与网页左边栏同步）
  const companies = await loadCompaniesFromDB(sql);
  console.log(`🔍 待处理: ${companies.length} 家公司\n`);

  const cutoffBeijingTime = getCutoffBeijingTime();
  console.log(`📅 24小时截止时间: ${cutoffBeijingTime}\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const companySummaries = []; // 收集成功入库的摘要，用于生成晨报
  const unmappedCompanies = []; // 无法匹配代码的公司

  for (const company of companies) {
    console.log(`\n━━━ 📰 ${company} ━━━`);

    // === 第一步: 解析股票代码 ===
    const resolved = await resolveCompanyCode(company);
    if (!resolved) {
      unmappedCompanies.push(company);
      skipCount++;
      continue;
    }

    const { symbol, source } = resolved;
    let newsItems = null;

    // === 第二步: 按数据源抓取新闻 ===
    if (source === 'akshare') {
      // AKShare 抓取 A 股/港股
      newsItems = await fetchNewsAKShare(company, symbol, cutoffBeijingTime);
    } else if (source === 'yfinance') {
      // yfinance 抓取港股/美股
      newsItems = await fetchNewsYfinance(company, symbol);
    }

    if (!newsItems || newsItems.length === 0) {
      console.log(`⏭️  ${company}: 24小时内无新闻`);
      skipCount++;
      continue;
    }

    // === 第三步: AI 摘要生成 ===
    const summaryObj = await summarizeWithDeepSeek(company, newsItems);
    if (!summaryObj) {
      skipCount++;
      continue;
    }

    // === 第四步: 二次过滤 — 排除无实质内容的摘要 ===
    if (isLowQualitySummary(company, summaryObj.summary)) {
      console.log(`⏭️  ${company}: 摘要无实质内容，跳过入库和晨报`);
      skipCount++;
      continue;
    }

    // === 第五步: 入库 ===
    const dbSuccess = await writeCompanyNews(sql, company, summaryObj, newsItems);
    if (dbSuccess) {
      successCount++;
      companySummaries.push({ company, summary: summaryObj.summary });
    } else {
      failCount++;
    }

    // 间隔1秒，避免 API 限速
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // === 生成上市公司晨报（仅包含有新闻的公司） ===
  if (companySummaries.length > 0) {
    console.log('\n📝 生成上市公司晨报...');
    const briefing = await generateMorningBriefing(companySummaries);
    if (briefing) {
      await writeMorningBriefing(sql, briefing);
    }
  } else {
    console.log('\n⚠️ 今日无公司新闻，跳过晨报生成');
  }

  // === 总结 ===
  console.log('\n========================================');
  console.log('✅ 任务完成!');
  console.log(`📊 统计: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${failCount}, 总计 ${companies.length}`);
  console.log(`⏰ 完成时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);

  if (unmappedCompanies.length > 0) {
    console.log(`\n⚠️  以下 ${unmappedCompanies.length} 家公司无法匹配代码:`);
    unmappedCompanies.forEach(c => console.log(`   - ${c}`));
  }

  if (successCount === 0 && companies.length > 0) {
    console.log('📝 注: 今日所有公司24小时内均无新闻');
  }
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

main().catch(error => {
  console.error('❌ 程序错误:', error);
  process.exit(1);
});
