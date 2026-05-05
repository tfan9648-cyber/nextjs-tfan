#!/usr/bin/env node
/**
 * 上市公司每日要闻抓取脚本 (AKShare 版本)
 * 通过 AKShare 抓取 + DeepSeek 总结,写入 Neon Postgres
 *
 * 用法: node scripts/fetch-daily-news-akshare.mjs
 * 环境变量: DEEPSEEK_API_KEY, DATABASE_URL
 */
import { neon } from '@neondatabase/serverless';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync } from 'fs';

// === 配置 ===
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
    console.log('⚠️  无法读取 config.json，使用默认公司列表');
  }
  
  // 默认使用映射表中的公司
  return Object.keys(COMPANY_STOCK_MAP);
}

/**
 * 运行 Python 脚本抓取股票新闻
 */
async function fetchStockNewsWithPython(company, symbol) {
  if (!symbol) {
    console.log(`⏭️  ${company}: 无股票代码，跳过`);
    return null;
  }

  try {
    const pythonScript = `
import sys
import json
import akshare as ak

symbol = sys.argv[1]
df = ak.stock_news_em(symbol=symbol)

result = []
if not df.empty:
    for _, row in df.iterrows():
        # 取日期部分判断是否是最近新闻
        publish_time = str(row.get('发布时间', ''))
        if '2026' in publish_time:  # 过滤2026年的新闻
            news_item = {
                "title": str(row.get('新闻标题', '')).strip(),
                "content": str(row.get('新闻内容', '')).replace('\\\\ue628', '').strip(),
                "source": str(row.get('文章来源', '')).strip(),
                "url": str(row.get('新闻链接', '')).strip(),
                "publishTime": publish_time
            }
            # 确保内容不为空
            if news_item['content'] and len(news_item['content']) > 20:
                result.append(news_item)
    
    # 只取最新的2-3条
    result = result[:3]

print(json.dumps(result, ensure_ascii=False))
`;
    
    const process = spawnSync('python3', ['-c', pythonScript, symbol], {
      encoding: 'utf-8',
      timeout: 30000
    });

    if (process.error) {
      console.error(`❌ ${company} Python错误:`, process.error.message);
      return null;
    }

    if (process.stderr && process.stderr.trim()) {
      console.error(`⚠️ ${company} Python警告:`, process.stderr.trim());
    }

    const output = process.stdout.trim();
    if (!output) {
      console.log(`📭 ${company}: 无新闻`);
      return null;
    }

    const newsItems = JSON.parse(output);
    console.log(`✅ ${company}: 找到 ${newsItems.length} 条新闻`);
    return newsItems.length > 0 ? newsItems : null;
  } catch (error) {
    console.error(`❌ ${company} 抓取失败:`, error.message);
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
    const prompt = `你是一名财经新闻编辑。请根据以下关于${company}的新闻内容，同时生成「标题」和「摘要」。

要求：
- title：12~22个汉字，必须包含具体事件/数据/动作（例如"净利润同比增长12%""董事长辞任""签订50亿合作协议"），严禁使用"重要动态""业务动态""最新进展"等空泛表述。如果新闻内容确实没有可提炼的具体事件，则返回空字符串。
- summary：300字以内的纯文本段落，客观中立的财经报道风格，突出关键数据和事件，禁止使用任何列表符号（*、-、数字等）。
- 严格只输出 JSON，不要任何解释、不要 markdown 代码块。

输出格式：
{"title": "...", "summary": "..."}

新闻内容：
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
      // 傅定 JSON 解析失败：剩下的只当作 summary，title 为空交给底层入库逻辑处理
      console.warn(`⚠️  ${company}：JSON 解析失败，回退为纯文本摘要`);
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
    console.log(`⏭️ ${company}: 无总结内容，跳过数据库写入`);
    return false;
  }

  const { title: aiTitle, summary } = summaryObj;

  try {
    const sql = neon(DATABASE_URL);
    const today = new Date().toISOString().split('T')[0];
    
    // 构建完整新闻内容（包含原始新闻链接）
    const fullContent = summary + '\n\n---\n\n原始新闻：\n' + 
      newsItems.map((n, i) => `${i + 1}. ${n.title} - ${n.source} (${n.publishTime})`).join('\n');

    // 检查是否已存在相同日期的记录
    const existing = await sql`
      SELECT id FROM news 
      WHERE date = ${today} AND company = ${company}
      LIMIT 1
    `;

    // 智能标题：优先用 AI 生成的标题；若为空或没有具体信息，回退为【日期】公司名重要动态
    let unifiedTitle;
    const cleanedAiTitle = (aiTitle || '').replace(/^【[^】]*】/, '').trim(); // 去除 AI 可能加上的日期前缀
    if (cleanedAiTitle && cleanedAiTitle.length >= 6 && !/重要动态|业务动态|最新进展/.test(cleanedAiTitle)) {
      unifiedTitle = `【${today}】${company}·${cleanedAiTitle}`;
      console.log(`🏷️  ${company}: 使用 AI 标题 -> ${unifiedTitle}`);
    } else {
      unifiedTitle = `【${today}】${company}重要动态`;
      console.log(`🏷️  ${company}: AI 标题不合格，回退默认`);
    }
    
    if (existing.length > 0) {
      console.log(`🔄 ${company}: 已存在今日记录，删除旧记录后重新插入`);
      // 删除旧记录
      await sql`DELETE FROM news WHERE date = ${today} AND company = ${company}`;
    }

    console.log(`💾 ${company}: 写入数据库`);
    const timestamp = Date.now();
    const companySlug = company.replace(/[\s\/]/g, '-');
    const id = `company-news-${companySlug}-${today}-${timestamp}`;
    
    await sql`
      INSERT INTO news (id, date, company, title, content, category, created_at)
      VALUES (${id}, ${today}, ${company}, ${unifiedTitle}, ${fullContent}, 'company_news', NOW())
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
  console.log('🚀 开始 AKShare 新闻抓取任务');
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
  let failCount = 0;

  // 串行处理，避免 API 限速
  for (const company of companies) {
    console.log(`\n📰 处理: ${company}`);
    
    const symbol = COMPANY_STOCK_MAP[company];
    
    // 1. 抓取新闻
    const newsItems = await fetchStockNewsWithPython(company, symbol);
    if (!newsItems) {
      failCount++;
      continue;
    }

    // 2. AI 总结
    const summary = await summarizeWithDeepSeek(company, newsItems);
    if (!summary) {
      failCount++;
      continue;
    }

    // 3. 写入数据库
    const dbSuccess = await writeToDatabase(company, summary, newsItems);
    if (dbSuccess) {
      successCount++;
    } else {
      failCount++;
    }

    // 间隔1秒，尊重 API 限速
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 总结报告
  console.log('\n========================================');
  console.log('✅ 任务完成！');
  console.log(`📊 统计: 成功 ${successCount}, 失败 ${failCount}, 总计 ${companies.length}`);
  console.log(`⏰ 完成时间: ${new Date().toLocaleString('zh-CN')}`);
  
  if (successCount === 0) {
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