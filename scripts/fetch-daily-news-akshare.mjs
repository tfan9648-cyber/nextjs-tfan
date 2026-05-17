#!/usr/bin/env node
/**
 * 上市公司每日要闻抓取脚本 (AKShare + yfinance 双数据源)
 * AKShare: A股11家公司 | yfinance: 腾讯控股+阿里巴巴(港股)
 * 自动生成"上市公司晨报" morning_briefing 入库
 * 更新时间: 2026-05-16
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
  "长江电力": "600900"
};

// === 港股/美股公司(用yfinance) ===
const YFINANCE_COMPANY_MAP = {
  "腾讯控股": "0700.HK",
  "阿里巴巴": "9988.HK"
};

// 从 config.json 动态读取公司列表
function loadCompanies() {
  try {
    const currentDir = dirname(fileURLToPath(import.meta.url));
    const configPath = join(currentDir, '..', 'data', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.supportedCompanies && config.supportedCompanies.length > 0) {
      console.log(`📋 从 config.json 加载 ${config.supportedCompanies.length} 家公司`);
      return config.supportedCompanies;
    }
  } catch (error) {
    console.log('⚠️  无法读取 config.json,使用默认公司列表');
  }

  // 默认使用两个映射表中的所有公司
  return [...Object.keys(COMPANY_STOCK_MAP), ...Object.keys(YFINANCE_COMPANY_MAP)];
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
                # 确保内容不为空
                if news_item['content'] and len(news_item['content']) > 20:
                    result.append(news_item)
                    filtered_count += 1
        except ValueError as e:
            # 时间解析失败,跳过该条记录
            continue

    # 调试输出
    print(f"[DEBUG] {symbol} 原始记录数: {original_count}, 24小时内记录数: {filtered_count}", file=sys.stderr)

    # 只取最新的2-3条(按时间排序,最新的在前面)
    result = result[:3]

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

    const process = spawnSync('python3', ['-c', pythonScript, symbol, cutoffBeijingTime], {
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
    const proc = spawnSync('python3', ['-c', pythonScript, ticker], {
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

  const companies = loadCompanies();
  console.log(`🔍 处理 ${companies.length} 家公司\n`);

  let successCount = 0;
  let skipCount = 0;
  let failCount = 0;
  const companySummaries = []; // 收集所有成功总结,用于生成晨报

  // 初始化数据库连接和今日日期
  const sql = neon(DATABASE_URL);
  const today = new Date().toISOString().split('T')[0];

  // 串行处理,避免 API 限速
  for (const company of companies) {
    console.log(`\n📰 处理: ${company}`);

    let newsItems = null;
    const akshareSymbol = COMPANY_STOCK_MAP[company];
    const yfinanceTicker = YFINANCE_COMPANY_MAP[company];

    if (akshareSymbol) {
      // A股: 用 AKShare
      newsItems = await fetchStockNewsWithPython(company, akshareSymbol);
    } else if (yfinanceTicker) {
      // 港股/美股: 用 yfinance
      console.log(`🌐 ${company}: 使用 yfinance (${yfinanceTicker})`);
      newsItems = await fetchNewsWithYfinance(company, yfinanceTicker);
    } else {
      console.log(`⏭️  ${company}: 无数据源,跳过`);
      skipCount++;
      continue;
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