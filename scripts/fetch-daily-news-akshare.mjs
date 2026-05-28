#!/usr/bin/env node
/**
 * 上市公司每日要闻抓取脚本 (AKShare + yfinance 双数据源)
 * AKShare: A股公司 | yfinance: 港股/美股公司
 * 自动生成"上市公司晨报" morning_briefing 入库
 * 支持自动查找股票代码并缓存到数据库 company_code_map 表
 * 更新时间: 2026-05-19
 */
import { neon } from '@neondatabase/serverless';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';
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

// === 公司-股票代码映射(A股用AKShare) ===
const COMPANY_STOCK_MAP = {
  "中国平安": "000001",
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
  "川投能源": "600674"
};

// === 港股/美股公司(用yfinance) ===
const YFINANCE_COMPANY_MAP = {
  "腾讯控股": "0700.HK",
  "阿里巴巴": "9988.HK",
  "中国海洋石油": "0883.HK",
  "华润电力": "0836.HK",
  "申洲国际": "2313.HK",
  "金斯瑞生物科技": "1548.HK",
  "美团-W": "3690.HK"
};

// 从数据库动态读取公司列表
async function loadCompanies(sql) {
  try {
    // 先确保 config 表存在
    await sql`CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    
    const rows = await sql`SELECT value FROM config WHERE key = 'supported_companies'`;
    if (rows.length > 0 && Array.isArray(rows[0].value) && rows[0].value.length > 0) {
      console.log(`📋 从数据库加载 ${rows[0].value.length} 家公司`);
      return rows[0].value;
    }
    throw new Error('数据库 config 表中无 supported_companies 数据');
  } catch (error) {
    console.error('❌ 从数据库读取公司列表失败:', error.message);
    throw error;
  }
}

/**
 * 初始化 company_code_map 表（存储动态查到的股票代码）
 */
async function initCodeMapTable(sql) {
  await sql`CREATE TABLE IF NOT EXISTS company_code_map (
    company TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto',
    market TEXT NOT NULL DEFAULT 'A',
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;
}

/**
 * 从数据库加载已缓存的股票代码映射
 */
async function loadCachedCodeMap(sql) {
  const rows = await sql`SELECT company, symbol, market FROM company_code_map`;
  const map = { akshare: {}, yfinance: {} };
  for (const row of rows) {
    if (row.market === 'A') {
      map.akshare[row.company] = row.symbol;
    } else {
      map.yfinance[row.company] = row.symbol;
    }
  }
  return map;
}

/**
 * 将查到的代码写入 company_code_map 缓存
 */
async function cacheCodeMapping(sql, company, symbol, market, source = 'auto') {
  await sql`INSERT INTO company_code_map (company, symbol, source, market, updated_at)
    VALUES (${company}, ${symbol}, ${source}, ${market}, NOW())
    ON CONFLICT (company) DO UPDATE SET symbol = ${symbol}, source = ${source}, market = ${market}, updated_at = NOW()`;
  console.log(`💾 ${company}: 代码 ${symbol} (${market}) 已缓存到 company_code_map`);
}

/**
 * 解析公司名称，推断可能的港股/美股 ticker
 * 规则：公司名含 "-W" "-S" "-B" 等后缀视为港股
 */
function guessHKTicker(company) {
  // 常见港股后缀模式
  if (company.includes('-W') || company.includes('-S') || company.includes('-B')) {
    return true; // 可能是港股
  }
  return false;
}

/**
 * 用 yfinance 验证一个 ticker 是否有效
 */
async function verifyYfinanceTicker(ticker) {
  try {
    const pythonScript = `
import sys
import yfinance as yf
ticker = sys.argv[1]
t = yf.Ticker(ticker)
info = t.info
if info and info.get('regularMarketPrice'):
    print('OK')
else:
    print('FAIL')
`;
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, ticker], {
      encoding: 'utf-8',
      timeout: 15000
    });
    return (proc.stdout || '').trim() === 'OK';
  } catch {
    return false;
  }
}

/**
 * 智能解析公司到代码的完整流程：
 * 1. 先查硬编码映射
 * 2. 再查 DB 缓存 company_code_map
 * 3. 尝试 AKShare 自动查 A 股
 * 4. 尝试 yfinance 查港股/美股
 * 5. 都失败则记日志
 */
async function resolveCompanyCode(sql, company, cachedMap) {
  // 1. 硬编码映射
  if (COMPANY_STOCK_MAP[company]) {
    return { symbol: COMPANY_STOCK_MAP[company], source: 'akshare' };
  }
  if (YFINANCE_COMPANY_MAP[company]) {
    return { symbol: YFINANCE_COMPANY_MAP[company], source: 'yfinance' };
  }

  // 2. DB 缓存
  if (cachedMap.akshare[company]) {
    return { symbol: cachedMap.akshare[company], source: 'akshare' };
  }
  if (cachedMap.yfinance[company]) {
    return { symbol: cachedMap.yfinance[company], source: 'yfinance' };
  }

  // 3. 尝试 AKShare 自动查 A 股代码
  console.log(`🔍 ${company}: 尝试自动查找A股代码...`);
  const akCode = await lookupStockSymbol(company);
  if (akCode) {
    console.log(`✅ ${company}: A股代码 ${akCode}，缓存到数据库`);
    await cacheCodeMapping(sql, company, akCode, 'A', 'auto-akshare');
    return { symbol: akCode, source: 'akshare' };
  }

  // 4. 尝试 yfinance 查港股
  //    策略: 如果公司名有 -W/-S/-B 后缀，或者 A 股查不到，尝试用 yfinance 搜索
  console.log(`🔍 ${company}: A股未找到，尝试 yfinance 查港股/美股...`);
  const yfinanceCode = await lookupYfinanceTicker(company);
  if (yfinanceCode) {
    console.log(`✅ ${company}: yfinance ticker ${yfinanceCode}，缓存到数据库`);
    await cacheCodeMapping(sql, company, yfinanceCode, 'HK', 'auto-yfinance');
    return { symbol: yfinanceCode, source: 'yfinance' };
  }

  // 5. 全部失败
  console.warn(`⚠️  ${company}: 无法自动匹配股票代码！需手动配置。`);
  return null;
}

/**
 * 用 yfinance 搜索公司的港股/美股 ticker
 */
async function lookupYfinanceTicker(company) {
  try {
    const pythonScript = `
import sys
import json
import yfinance as yf

company = sys.argv[1]
# 去掉常见后缀
clean = company.replace('-W', '').replace('-S', '').replace('-B', '')

# 尝试用 yfinance 搜索
try:
    results = yf.search(clean, max_results=5)
    quotes = results.get('quotes', []) if isinstance(results, dict) else []
    for q in quotes:
        symbol = q.get('symbol', '')
        # 优先港股
        if '.HK' in symbol:
            print(symbol)
            break
    else:
        # 没有港股则看有无美股
        for q in quotes:
            symbol = q.get('symbol', '')
            exchange = q.get('exchange', '')
            if exchange in ['NYQ', 'NMS', 'NGM']:
                print(symbol)
                break
except Exception as e:
    print('', file=sys.stderr)
`;
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, company], {
      encoding: 'utf-8',
      timeout: 20000
    });
    const output = (proc.stdout || '').trim();
    return output || null;
  } catch {
    return null;
  }
}

/**
 * 运行 Python 脚本抓取股票新闻,过滤24小时内新闻
 */
async function fetchStockNewsWithPython(company, symbol) {
  if (!symbol) {
    console.log(`⏭️  ${company}: 无股票代码,跳过`);
    return null;
  }

  try {
    // 计算24小时前的时间(北京时间)
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    // 格式化为北京时间字符串 "YYYY-MM-DD HH:MM:SS"
    const cutoffBeijingTime = twentyFourHoursAgo.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
      timeZone: 'Asia/Shanghai'
    }).replace(/\//g, '-').replace(',', '');

    console.log(`📅 ${company}: 24小时cutoff时间 = ${cutoffBeijingTime}`);

    const pythonScript = `
import sys
import json
import datetime
import akshare as ak

symbol = sys.argv[1]
cutoff_str = sys.argv[2]

# 解析cutoff时间
cutoff_dt = datetime.datetime.strptime(cutoff_str, "%Y-%m-%d %H:%M:%S")

df = ak.stock_news_em(symbol=symbol)

result = []
if not df.empty:
    original_count = 0
    filtered_count = 0

    for _, row in df.iterrows():
        original_count += 1
        publish_time_str = str(row.get('发布时间', ''))

        # 跳过时间格式无效的记录
        if not publish_time_str or len(publish_time_str) < 10:
            continue

        try:
            # 解析发布时间
            publish_dt = datetime.datetime.strptime(publish_time_str, "%Y-%m-%d %H:%M:%S")

            # 检查是否在24小时内(发布时间 >= cutoff时间)
            if publish_dt >= cutoff_dt:
                news_item = {
                    "title": str(row.get('新闻标题', '')).strip(),
                    "content": str(row.get('新闻内容', '')).replace('\\\\ue628', '').strip(),
                    "source": str(row.get('文章来源', '')).strip(),
                    "url": str(row.get('新闻链接', '')).strip(),
                    "publishTime": publish_time_str
                }
                # 确保标题和链接不为空(与单数据源一致,不再按内容长度过滤)
                if news_item['title'] and news_item['url']:
                    result.append(news_item)
                    filtered_count += 1
        except ValueError as e:
            # 时间解析失败,跳过该条记录
            continue

    # 调试输出
    print(f"[DEBUG] {symbol} 原始记录数: {original_count}, 24小时内记录数: {filtered_count}", file=sys.stderr)

    # 按时间倒序,取最新5条(与单数据源一致)
    result.sort(key=lambda x: x['publishTime'], reverse=True)
    result = result[:5]

print(json.dumps(result, ensure_ascii=False))
`;

    // 清除代理环境变量,避免东方财富API通过代理时TLS握手失败
    const cleanEnv = { ...globalThis.process.env };
    delete cleanEnv.HTTP_PROXY;
    delete cleanEnv.HTTPS_PROXY;
    delete cleanEnv.http_proxy;
    delete cleanEnv.https_proxy;
    delete cleanEnv.ALL_PROXY;
    delete cleanEnv.all_proxy;

    const process = spawnSync(PYTHON_PATH, ['-c', pythonScript, symbol, cutoffBeijingTime], {
      encoding: 'utf-8',
      timeout: 30000,
      env: cleanEnv
    });

    if (process.error) {
      console.error(`❌ ${company} Python错误:`, process.error.message);
      return null;
    }

    if (process.stderr && process.stderr.trim()) {
      const stderr = process.stderr.trim();
      // 提取调试信息
      const debugMatch = stderr.match(/\[DEBUG\].*/);
      if (debugMatch) {
        console.log(`   ${debugMatch[0]}`);
      }
      // 其它警告信息
      const warnings = stderr.split('\n').filter(line => !line.includes('[DEBUG]'));
      if (warnings.length > 0) {
        console.error(`⚠️ ${company} Python警告:`, warnings.join('; '));
      }
    }

    const output = process.stdout.trim();
    if (!output) {
      console.log(`📭 ${company}: 无新闻或全部新闻超过24小时`);
      return null;
    }

    const newsItems = JSON.parse(output);
    console.log(`✅ ${company}: 找到 ${newsItems.length} 条24小时内新闻`);

    if (newsItems.length === 0) {
      console.log(`⏭️ ${company}: 24小时内无有效新闻,跳过`);
      return null;
    }

    return newsItems;
  } catch (error) {
    console.error(`❌ ${company} 抓取失败:`, error.message);
    return null;
  }
}

/**
 * 用 AKShare 自动查找公司对应的股票代码
 */
async function lookupStockSymbol(company) {
  try {
    const pythonScript = `
import sys
import json
import akshare as ak

company_name = sys.argv[1]
df = ak.stock_info_a_code_name()
# 精确匹配或包含匹配
matches = df[df['name'].str.contains(company_name)]
if len(matches) > 0:
    print(matches.iloc[0]['code'])
else:
    # 尝试简称匹配（去掉"集团""股份"等后缀）
    short_name = company_name.replace('集团', '').replace('股份', '').replace('控股', '')
    matches = df[df['name'].str.contains(short_name)]
    if len(matches) > 0:
        print(matches.iloc[0]['code'])
    else:
        print('')
`;
    
    const cleanEnv = { ...globalThis.process.env };
    delete cleanEnv.HTTP_PROXY;
    delete cleanEnv.HTTPS_PROXY;
    delete cleanEnv.http_proxy;
    delete cleanEnv.https_proxy;
    delete cleanEnv.ALL_PROXY;
    delete cleanEnv.all_proxy;
    
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, company], {
      encoding: 'utf-8',
      timeout: 15000,
      env: cleanEnv
    });
    
    const output = (proc.stdout || '').trim();
    return output || null;
  } catch (error) {
    console.error(`⚠️ ${company} 股票代码查找失败:`, error.message);
    return null;
  }
}

/**
 * 用 yfinance 抓取港股/美股新闻(腾讯、阿里)
 */
async function fetchNewsWithYfinance(company, ticker) {
  try {
    const pythonScript = `
import sys
import json
import datetime
import yfinance as yf

ticker = sys.argv[1]
cutoff_hours = 24

t = yf.Ticker(ticker)
news = t.news

result = []
if news:
    now = datetime.datetime.now(datetime.timezone.utc)
    cutoff = now - datetime.timedelta(hours=cutoff_hours)

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

result = result[:3]
print(json.dumps(result, ensure_ascii=False))
`;

    // yfinance 需要走代理访问 Yahoo(与 AKShare 相反)
    const proc = spawnSync(PYTHON_PATH, ['-c', pythonScript, ticker], {
      encoding: 'utf-8',
      timeout: 30000
    });

    if (proc.error) {
      console.error(`❌ ${company} yfinance错误:`, proc.error.message);
      return null;
    }

    const output = (proc.stdout || '').trim();
    if (!output) {
      console.log(`📭 ${company}: yfinance无新闻或超过24小时`);
      return null;
    }

    const newsItems = JSON.parse(output);
    console.log(`✅ ${company}: yfinance找到 ${newsItems.length} 条新闻`);
    return newsItems.length > 0 ? newsItems : null;
  } catch (error) {
    console.error(`❌ ${company} yfinance抓取失败:`, error.message);
    return null;
  }
}

/**
 * 用 DeepSeek 汇总生成纯文本"上市公司晨报"
 */
async function generateMorningBriefing(companySummaries) {
  if (!companySummaries || companySummaries.length === 0) return null;

  const summaryList = companySummaries.map(s => `${s.company}: ${s.summary}`).join('\n\n');
  const prompt = `你是财经新闻编辑。请根据以下各公司新闻摘要，生成一篇简洁的"上市公司晨报"。

要求：
- 按公司独立成段，每个公司不超过100字
- 每段开头用公司名称
- 使用正常的中文标点符号（逗号、句号、顿号、冒号等）
- 不要使用markdown格式（不要星号、横杠、井号、方括号等）
- 不要使用emoji或特殊符号
- 客观中立的财经报道风格，突出关键数据和事件
- 直接输出正文，不要加任何前言、标题或结尾总结

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

    if (!response.ok) {
      throw new Error(`API请求失败: ${response.status}`);
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error('❌ 晨报生成失败:', error.message);
    return null;
  }
}

/**
 * 用 DeepSeek 总结新闻
 */
async function summarizeWithDeepSeek(company, newsItems) {
  if (!newsItems || newsItems.length === 0) return null;

  try {
    // 合并所有新闻内容
    const allContent = newsItems.map(n => n.content).join('\n\n');
    const prompt = `你是一名财经新闻编辑。请根据以下关于${company}的新闻内容,同时生成「标题」和「摘要」。

要求:
- title:12~22个汉字,必须包含具体事件/数据/动作(例如"净利润同比增长12%""董事长辞任""签订50亿合作协议"),严禁使用"重要动态""业务动态""最新进展"等空泛表述。如果新闻内容确实没有可提炼的具体事件,则返回空字符串。
- summary:300字以内的纯文本段落,客观中立的财经报道风格,突出关键数据和事件,禁止使用任何列表符号(*、-、数字等)。
- 严格只输出 JSON,不要任何解释、不要 markdown 代码块。

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
    } catch (e) {
      // 傅定 JSON 解析失败:剩下的只当作 summary,title 为空交给底层入库逻辑处理
      console.warn(`⚠️  ${company}:JSON 解析失败,回退为纯文本摘要`);
      return { title: '', summary: raw };
    }
    const title = (parsed.title || '').trim();
    const summary = (parsed.summary || '').trim();
    if (!summary) return null;
    return { title, summary };
  } catch (error) {
    console.error(`❌ ${company} 总结失败:`, error.message);
    return null;
  }
}

/**
 * 写入数据库
 */
async function writeToDatabase(company, summaryObj, newsItems) {
  if (!DATABASE_URL) {
    console.error('❌ 缺少 DATABASE_URL 环境变量');
    return false;
  }

  if (!summaryObj || !summaryObj.summary) {
    console.log(`⏭️ ${company}: 无总结内容,跳过数据库写入`);
    return false;
  }

  const { title: aiTitle, summary } = summaryObj;

  try {
    const sql = neon(DATABASE_URL);
    const today = new Date().toISOString().split('T')[0];

    // 构建完整新闻内容(包含原始新闻链接)
    const fullContent = summary + '\n\n---\n\n原始新闻:\n' +
      newsItems.map((n, i) => `${i + 1}. ${n.title} - ${n.source} (${n.publishTime})`).join('\n');

    // 检查是否已存在相同日期的记录
    const existing = await sql`
      SELECT id FROM news
      WHERE date = ${today} AND company = ${company}
      LIMIT 1
    `;

    // 智能标题:优先用 AI 生成的标题;若为空或没有具体信息,回退为【日期】公司名重要动态
    let unifiedTitle;
    const cleanedAiTitle = (aiTitle || '').replace(/^【[^】]*】/, '').trim(); // 去除 AI 可能加上的日期前缀
    if (cleanedAiTitle && cleanedAiTitle.length >= 6 && !/重要动态|业务动态|最新进展/.test(cleanedAiTitle)) {
      unifiedTitle = `【${today}】${company}·${cleanedAiTitle}`;
      console.log(`🏷️  ${company}: 使用 AI 标题 -> ${unifiedTitle}`);
    } else {
      unifiedTitle = `【${today}】${company}重要动态`;
      console.log(`🏷️  ${company}: AI 标题不合格,回退默认`);
    }

    if (existing.length > 0) {
      console.log(`🔄 ${company}: 已存在今日记录,删除旧记录后重新插入`);
      // 删除旧记录
      await sql`DELETE FROM news WHERE date = ${today} AND company = ${company}`;
    }

    console.log(`💾 ${company}: 写入数据库`);
    const timestamp = Date.now();
    const companySlug = company.replace(/[\s\/]/g, '-');
    const id = `company-news-${companySlug}-${today}-${timestamp}`;

    await sql`
      INSERT INTO news (id, date, company, title, content, category, timestamp, created_at)
      VALUES (${id}, ${today}, ${company}, ${unifiedTitle}, ${fullContent}, 'company_news', ${timestamp}, NOW())
    `;

    return true;
  } catch (error) {
    console.error(`❌ ${company} 数据库写入失败:`, error.message);
    return false;
  }
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始上市公司新闻抓取任务 (AKShare + yfinance 双数据源)');
  console.log('========================================');

  // 检查环境变量
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ 缺少 DEEPSEEK_API_KEY 环境变量');
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error('❌ 缺少 DATABASE_URL 环境变量');
    process.exit(1);
  }

  // 初始化数据库连接
  const sql = neon(DATABASE_URL);
  
  // 初始化 company_code_map 表
  await initCodeMapTable(sql);
  
  // 加载 DB 缓存的代码映射
  const cachedMap = await loadCachedCodeMap(sql);
  const cachedCount = Object.keys(cachedMap.akshare).length + Object.keys(cachedMap.yfinance).length;
  if (cachedCount > 0) {
    console.log(`💾 从 DB 加载了 ${cachedCount} 条缓存代码映射`);
  }
  
  // 从数据库加载公司列表
  const companies = await loadCompanies(sql);
  console.log(`🔍 处理 ${companies.length} 家公司\n`);

  // === 覆盖率统计 ===
  const hardcoded = Object.keys(COMPANY_STOCK_MAP).length + Object.keys(YFINANCE_COMPANY_MAP).length;
  const unmapped = companies.filter(c => !COMPANY_STOCK_MAP[c] && !YFINANCE_COMPANY_MAP[c] && !cachedMap.akshare[c] && !cachedMap.yfinance[c]);
  console.log(`📊 覆盖率: 硬编码 ${hardcoded} 家, DB缓存 ${cachedCount} 家, 待查 ${unmapped.length} 家`);
  if (unmapped.length > 0) {
    console.log(`   待查公司: ${unmapped.join(', ')}`);
  }

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const companySummaries = []; // 收集所有成功总结,用于生成晨报

  const today = new Date().toISOString().split('T')[0];

  // 串行处理,避免 API 限速
  const unmappedCompanies = []; // 记录无法匹配代码的公司
  for (const company of companies) {
    console.log(`\n📰 处理: ${company}`);

    let newsItems = null;
    const resolved = await resolveCompanyCode(sql, company, cachedMap);

    if (!resolved) {
      unmappedCompanies.push(company);
      skipCount++;
      continue;
    }

    if (resolved.source === 'akshare') {
      newsItems = await fetchStockNewsWithPython(company, resolved.symbol);
    } else if (resolved.source === 'yfinance') {
      console.log(`🌐 ${company}: 使用 yfinance (${resolved.symbol})`);
      newsItems = await fetchNewsWithYfinance(company, resolved.symbol);
    }

    if (!newsItems) {
      // 跳过前先清理该公司当日的旧记录
      try {
        await sql`DELETE FROM news WHERE date = ${today} AND company = ${company} AND category = 'company_news'`;
        console.log(`🗑️  ${company}: 已清理当日旧记录`);
      } catch (error) {
        console.error(`⚠️  ${company}: 清理旧记录失败 - ${error.message}`);
      }
      skipCount++;
      continue;
    }

    // AI 总结
    const summary = await summarizeWithDeepSeek(company, newsItems);
    if (!summary) {
      failCount++;
      continue;
    }

    // 写入数据库
    const dbSuccess = await writeToDatabase(company, summary, newsItems);
    if (dbSuccess) {
      successCount++;
      companySummaries.push({ company, summary: summary.summary });
    } else {
      failCount++;
    }

    // 间隔1秒,尊重 API 限速
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // === 生成上市公司晨报 ===
  if (companySummaries.length > 0) {
    console.log('\n📝 生成上市公司晨报...');
    const briefing = await generateMorningBriefing(companySummaries);
    if (briefing) {
      try {
        const timestamp = Date.now();
        const briefingId = `morning-briefing-${today}-${timestamp}`;
        // 先删除今日旧的晨报
        await sql`DELETE FROM news WHERE date = ${today} AND category = 'morning_briefing'`;
        await sql`
          INSERT INTO news (id, date, company, title, summary, content, category, timestamp, created_at)
          VALUES (${briefingId}, ${today}, '上市公司晨报', ${`【${today}】上市公司晨报`}, ${briefing}, ${briefing}, 'morning_briefing', ${timestamp}, NOW())
        `;
        console.log('✅ 上市公司晨报已入库');
      } catch (error) {
        console.error('❌ 晨报入库失败:', error.message);
      }
    }
  } else {
    console.log('\n⚠️ 无公司新闻,跳过晨报生成');
  }

  // 总结报告
  console.log('\n========================================');
  console.log('✅ 任务完成!');
  console.log(`📊 统计: 成功 ${successCount}, 跳过 ${skipCount}, 失败 ${failCount}, 总计 ${companies.length}`);
  console.log(`⏰ 完成时间: ${new Date().toLocaleString('zh-CN')}`);

  // 报告无法匹配的公司
  if (unmappedCompanies.length > 0) {
    console.log(`\n⚠️  以下 ${unmappedCompanies.length} 家公司无法自动匹配股票代码，需手动配置:`);
    unmappedCompanies.forEach(c => console.log(`   - ${c}`));
  }
  if (successCount === 0 && skipCount > 0) {
    console.log('📝 注意: 今日所有公司24小时内均无新闻,跳过入库');
  } else if (successCount === 0) {
    console.error('⚠️  警告: 没有成功写入任何记录');
    process.exit(1);
  }
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

// 运行主函数
main().catch(error => {
  console.error('❌ 程序错误:', error);
  process.exit(1);
});