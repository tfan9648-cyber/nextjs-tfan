#!/usr/bin/env node
/**
 * 统一抓取脚本：时政财经 + 公司新闻（V3方案完整实施）
 * 核心逻辑：
 * 1. 时政国际财经：Tavily搜索"今日国际财经 全球股市 大宗商品 汇率" → DeepSeek总结300字 → 写入数据库
 * 2. 遍历公司新闻：AKShare(如有) + Tavily → 合并 → 24小时过滤 → DeepSeek生成JSON → 写入数据库
 * 3. 标题质量：严禁"重要动态/业务动态/最新进展/公司公告"等废词
 */

import { neon } from '@neondatabase/serverless';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';

// === 从.env加载环境变量 ===
const __dirname = dirname(fileURLToPath(import.meta.url));
try {
  const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && !key.startsWith('#')) {
      process.env[key.trim()] = vals.join('=').trim();
    }
  });
} catch(e) {
  console.error('⚠️ 加载.env失败:', e.message);
}

// === 配置 ===
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const DATABASE_URL = process.env.DATABASE_URL || '';

// === 财经域名白名单 ===
const FINANCE_DOMAINS = [
  'eastmoney.com',
  '10jqka.com.cn',
  'sse.com.cn',
  'szse.cn',
  'cninfo.com.cn',
  'sina.com.cn',
  'finance.sina.com.cn',
  'ifeng.com',
  'finance.ifeng.com',
  'jrj.com.cn',
  'cs.com.cn',
  'stcn.com',
  'cnstock.com',
  '21jingji.com',
  'caixin.com',
  'yicai.com',
];

// === 公司-股票代码映射 ===
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
  "腾讯控股": null, // 港股
  "阿里巴巴": null  // 港/美股
};

// === 获取当前日期 ===
const now = new Date();
const today = now.toISOString().split('T')[0];
const twentyFourHoursAgo = now.getTime() - (24 * 60 * 60 * 1000);

/**
 * Step 0: 测试数据库连接
 */
async function testDatabaseConnection() {
  try {
    const sql = neon(DATABASE_URL);
    const result = await sql`SELECT 1 as test`;
    console.log('✅ 数据库连接成功');
    return true;
  } catch (error) {
    console.error('❌ 数据库连接失败:', error.message);
    return false;
  }
}

/**
 * Step 1: 从data/config.json加载公司列表
 */
function loadCompanies() {
  try {
    const configPath = join(__dirname, '..', 'data', 'config.json');
    const config = JSON.parse(readFileSync(configPath, 'utf-8'));
    if (config.supportedCompanies && config.supportedCompanies.length > 0) {
      console.log(`📋 从config.json加载${config.supportedCompanies.length}家公司`);
      return config.supportedCompanies;
    }
  } catch (error) {
    console.log('⚠️ 无法读取config.json，使用默认公司列表');
  }
  
  // 默认返回映射表中的公司
  const defaultCompanies = Object.keys(COMPANY_STOCK_MAP);
  console.log(`📋 使用默认${defaultCompanies.length}家公司`);
  
  return defaultCompanies;
}

/**
 * Step A: 时政国际财经 - Tavily搜索
 */
async function searchGlobalFinance() {
  console.log('\n🌍 Step A: 时政国际财经搜索');
  console.log('='.repeat(40));
  
  const query = "global stock market commodities forex today international finance";
  
  try {
    console.log(`🔍 搜索查询: "${query}"`);
    
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: query,
        search_depth: "basic",
        max_results: 5,
        topic: "news",
        days: 1
      })
    });

    if (!response.ok) {
      throw new Error(`Tavily API错误: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      console.log('⚠️ 未搜索到时政财经新闻');
      return [];
    }

    console.log(`✅ 获取到${data.results.length}条时政财经新闻`);
    return data.results.map(result => ({
      title: result.title || '',
      url: result.url || '',
      content: result.content || '',
      published_date: result.published_date || null,
      score: result.score || 0,
      source: new URL(result.url).hostname.replace(/^www\./, '')
    }));
  } catch (error) {
    console.error(`❌ Tavily搜索失败: ${error.message}`);
    return [];
  }
}

/**
 * Step B-1: AKShare抓取A股公司新闻
 */
async function fetchNewsWithAKShare(company, symbol) {
  if (!symbol) return null;
  
  console.log(`   AKShare抓取: ${company} (${symbol})`);
  
  try {
    const pythonPath = join(__dirname, 'fetch_akshare_news.py');
    
    const result = spawnSync('python3', [
      pythonPath,
      symbol
    ], {
      encoding: 'utf-8',
      timeout: 30000
    });

    if (result.error) {
      throw new Error(`Python执行失败: ${result.error.message}`);
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || '未知错误';
      console.error(`   AKShare错误: ${stderr}`);
      return null;
    }

    const stdout = result.stdout?.trim();
    if (!stdout) {
      console.log(`   AKShare无返回数据`);
      return null;
    }

    let akshareData;
    try {
      akshareData = JSON.parse(stdout);
    } catch (parseError) {
      console.error(`   JSON解析失败: ${parseError.message}`);
      return null;
    }

    if (!Array.isArray(akshareData) || akshareData.length === 0) {
      console.log(`   AKShare返回空数组`);
      return null;
    }

    // 转换为统一格式
    const newsItems = akshareData.map(item => ({
      title: item.title || '',
      url: item.url || '',
      content: item.content || '',
      source: item.source || '东方财富',
      publishTime: item.publishTime ? new Date(item.publishTime) : null,
      fromAKShare: true
    }));

    console.log(`   ✅ AKShare获取${newsItems.length}条新闻`);
    return newsItems;
  } catch (error) {
    console.error(`   ❌ AKShare失败: ${error.message}`);
    return null;
  }
}

/**
 * Step B-2: Tavily搜索公司新闻
 */
async function searchNewsWithTavily(company) {
  console.log(`   Tavily深度搜索: "${company}"`);
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query: `${company} 最新公告 业绩 动态`,
        search_depth: 'advanced',
        max_results: 8,
        topic: 'news',
        days: 1,
        include_domains: FINANCE_DOMAINS,
      })
    });
    if (!response.ok) throw new Error(`Tavily API错误: ${response.status}`);
    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      console.log('   ⚠️ Tavily未找到');
      return [];
    }

    const aliases = getCompanyAliases(company);
    // 信任 Tavily 服务器端的 days:1 筛选，不做客户端 published_date 二次过滤
    // （因为 Tavily 返回的 published_date 常被填充为查询时刻，不是真实发布时间）
    const filtered = data.results.filter(r => {
      // 公司名相关性：标题或内容必须包含公司名/别称
      const text = ((r.title || '') + ' ' + (r.content || '')).toLowerCase();
      return aliases.some(a => text.includes(a.toLowerCase()));
    });

    if (filtered.length === 0) {
      console.log(`   ⚠️ 未找到与${company}相关的新闻`);
      return [];
    }

    // 取前 5 条（按 Tavily 返回的 score 排序）
    const top = filtered.slice(0, 5);

    const items = top.map(r => ({
      title: r.title || '',
      url: r.url || '',
      content: r.content || '',
      source: new URL(r.url).hostname.replace(/^www\./, ''),
      publishTime: r.published_date ? new Date(r.published_date) : new Date(),
      fromTavily: true,
      score: r.score || 0
    }));

    console.log(`   ✅ Tavily 找到 ${items.length} 条相关新闻`);
    return items;
  } catch (e) {
    console.error(`   ❌ Tavily失败: ${e.message}`);
    return [];
  }
}

/**
 * 公司名别称映射（用于相关性过滤）
 */
function getCompanyAliases(company) {
  const aliasMap = {
    '中国平安': ['中国平安', '平安银行', '平安保险', '平安集团', 'Ping An', '平安'],
    '美的集团': ['美的集团', '美的', 'Midea', '美的小天鹅'],
    '伊利股份': ['伊利股份', '伊利', 'Yili', '内蒙古伊利'],
    '招商银行': ['招商银行', '招行', 'CMB', '招商局银行'],
    '贵州茅台': ['贵州茅台', '茅台', 'Moutai', 'Kweichow', '茅五泸'],
    '泸州老窖': ['泸州老窖', '老窖', 'Luzhou', '国窖1573', '泸州'],
    '腾讯控股': ['腾讯控股', '腾讯', 'Tencent', '腾讯公司', '腾讯 QQ', '微信', 'WeChat'],
    '阿里巴巴': ['阿里巴巴', '阿里', 'Alibaba', 'BABA', '阿里巴巴集团', '阿里云', '淘宝', '天猫'],
    '万华化学': ['万华化学', '万华', 'Wanhua', '万华实业'],
    '福耀玻璃': ['福耀玻璃', '福耀', 'Fuyao', '福曜'],
    '昱能科技': ['昱能科技', '昱能', 'APsystems', 'AP系统'],
    '凌霄泵业': ['凌霄泵业', '凌霄', '凌霄电气'],
    '长江电力': ['长江电力', '长电', 'Yangtze Power', '长江'],
  };
  return aliasMap[company] || [company];
}

/**
 * Step C: DeepSeek总结新闻内容
 */
async function summarizeWithDeepSeek(company, newsItems, isGlobal = false) {
  if (!newsItems || newsItems.length === 0) return null;
  
  // 准备输入文本
  const newsText = newsItems.map((item, idx) => {
    const timeStr = item.publishTime 
      ? item.publishTime.toLocaleString('zh-CN') 
      : '未知时间';
    return `[${idx + 1}] 标题: ${item.title}\n来源: ${item.source} (${timeStr})\n内容: ${item.content.substring(0, 200)}...\n`;
  }).join('\n');

  // 构建提示词
  const prompt = isGlobal 
    ? `请根据以下国际财经新闻整理一份时政大事·国际财经综合要闻，严格返回 JSON 格式：
{
  "title": "要闻标题（10-20字，概括最重要的1-2件事）",
  "summary": "综合要闻（300字以内，包含政经要闻、股市行情、大宗商品、汇率等关键数据，纯文本无格式符号）",
  "summary_short": "简要摘要（150字以内，只保留最关键的信息）"
}

新闻内容：
${newsText}`
    : `请分析以下关于${company}的新闻，严格返回 JSON 格式：
{
  "title": "事件标题（10-20字，必须包含具体事件和关键数据，禁止使用'重要动态''业务进展''公司公告''最新消息'等笼统词汇）",
  "summary": "详细摘要（300字以内，纯文本无格式符号，客观中立的财经报道风格）",
  "summary_short": "简短摘要（150字以内，提炼核心信息）"
}

新闻内容：
${newsText}`;

  // 更新禁止词列表，更严格
  const bannedWords = ['重要动态', '业务动态', '最新进展', '公司公告', '重要新闻', '业务进展', '最新消息', 
                      '动态概述', '公司新闻', '新闻快讯', '资讯快报', '最新动态', '新闻摘要', '简要新闻', 
                      '新闻报道', '行业动态', '摘要', '简报', '快报', '资讯', '最新', '动态', '新闻'];

  try {
    console.log(`   🤖 调用DeepSeek总结...`);
    
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [
          {
            role: 'system',
            content: '你是一位专业的财经分析员。返回严格的 JSON 格式，不添加任何其他内容。'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1500,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!response.ok) {
      if (response.status === 429) {
        console.log(`   🔄 DeepSeek API速率限制，等待10秒后重试...`);
        await new Promise(resolve => setTimeout(resolve, 10000));
        // 继续抛出错误，让上层处理
      }
      throw new Error(`DeepSeek API错误: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('DeepSeek返回空内容');
    }

    // 解析JSON
    let result;
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      // 尝试提取JSON
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('无法解析JSON响应');
      }
    }

    // 验证字段
    if (!result.title || !result.summary) {
      throw new Error('缺少必需字段');
    }

    // 严格的标题质量控制
    const title = result.title.trim();
    
    // 检查必须包含具体事件/数据（不能全是虚词）
    const detailIndicators = ['发布', '公布', '披露', '上涨', '下跌', '增长', '下降', '净利润', '收入', '营收', 
                             '业绩', '合同', '订单', '签署', '合作', '协议', '投资', '融资', '收购', '并购',
                             '分红', '派息', '改革', '重组', '转型', '创新', '专利', '产品', '服务', '市场',
                             '亿元', '万元', '增长', '同比下降', '同比增长', '环比', '超预期', '不及预期',
                             '突破', '创下', '新高', '创新高', '大幅', '明显', '显著', '稳健', '强劲', '疲软',
                             '预计', '预测', '预期', '估值', '评级', '目标价', '看好', '看空', '买入', '卖出'];
    
    // 检查禁止词
    const hasBannedWord = bannedWords.some(word => title.includes(word));
    // 检查是否包含具体事件/数据（用正则更鲁棒）
    const numberPattern = /\d+(\.\d+)?\s*(万|亿|%|元|股|件|家|人|年|次|倍|点|bps|项|个)/;
    const actionPattern = /(发布|公布|披露|上涨|下跌|增长|下降|购买|出售|净利润|营收|营业收入|业绩|订单|合同|签署|签订|合作|协议|投资|融资|收购|并购|分红|派息|重组|转型|产品|上市|辞任|辞职|上任|任职|接棒|换帅|增持|减持|回购|流入|流出|出口|进口|中标|中选|获准|获批|估值|评级|到期|发行|完成|启动|实施|领涨|领跌|报价|成交|询价|涨价|停产|复产|检修)/;
    const hasDetail = numberPattern.test(title) || actionPattern.test(title);
    
    // 标题太短可能有问题
    const titleTooShort = title.length < 8;
    
    // 标题为空
    const titleEmpty = !title || title.trim().length === 0;
    
    // 如果标题为空、太短、含禁止词或没有具体事件，则质量检查失败
    if (titleEmpty || hasBannedWord || !hasDetail || titleTooShort) {
      console.log(`   ⚠️ 标题质量检查失败:`);
      console.log(`     标题: "${title}"`);
      console.log(`     是否含禁止词: ${hasBannedWord}`);
      console.log(`     是否有具体事件: ${hasDetail}`);
      console.log(`     标题长度: ${title.length}`);
      return { ...result, qualityCheckFailed: true };
    }
    
    console.log(`   ✅ 标题质量检查通过: "${title}"`);

    // 确保字数限制
    if (result.summary.length > 300) {
      result.summary = result.summary.substring(0, 300);
    }
    if (result.summary_short && result.summary_short.length > 150) {
      result.summary_short = result.summary_short.substring(0, 150);
    } else if (!result.summary_short && result.summary) {
      result.summary_short = result.summary.substring(0, 150);
    }

    console.log(`   ✅ 总结完成: "${title}"`);
    return result;
  } catch (error) {
    console.error(`   ❌ DeepSeek总结失败: ${error.message}`);
    return null;
  }
}

/**
 * Step D: 写入数据库
 */
async function writeToDatabase(record) {
  try {
    const sql = neon(DATABASE_URL);
    
    // 删除今日同公司同类别旧记录
    await sql`
      DELETE FROM news 
      WHERE date = ${record.date} AND company = ${record.company} AND category = ${record.category}
    `;
    
    // 插入新记录
    await sql`
      INSERT INTO news (
        id, date, company, title, summary, summary_short, content, sources, category, keywords, created_at
      ) VALUES (
        ${record.id},
        ${record.date},
        ${record.company},
        ${record.title},
        ${record.summary},
        ${record.summary_short || record.summary.substring(0, 150)},
        ${record.content},
        ${JSON.stringify(record.sources)},
        ${record.category},
        ${JSON.stringify(record.keywords)},
        NOW()
      )
    `;
    
    console.log(`   💾 写入成功: ${record.company}`);
    return true;
  } catch (error) {
    console.error(`   ❌ 写入失败: ${error.message}`);
    return false;
  }
}

/**
 * Step E: 处理时政国际财经
 */
async function processGlobalFinance() {
  console.log('\n🌍 开始处理时政大事·国际财经');
  
  // 1. 搜索新闻
  const newsItems = await searchGlobalFinance();
  if (newsItems.length === 0) {
    console.log('⚠️ 无时政财经新闻，跳过');
    return false;
  }

  // 2. DeepSeek总结
  let summary = await summarizeWithDeepSeek('时政大事·国际财经', newsItems, true);
  if (!summary) {
    console.log('❌ 时政财经总结失败');
    return false;
  }

  // 3. 标题质量控制（重试一次）
  if (summary.qualityCheckFailed) {
    console.log('🔄 标题含废词，重试一次...');
    const retrySummary = await summarizeWithDeepSeek('时政大事·国际财经', newsItems, true);
    if (!retrySummary || retrySummary.qualityCheckFailed) {
      console.log('❌ 重试后标题仍不合格，跳过');
      return false;
    }
    summary = retrySummary;
  }

  // 4. 准备数据库记录
  const timestamp = Date.now();
  
  // 构建信息来源文本
  let sourceInfo = "\n\n---\n📎 信息来源\n";
  newsItems.forEach((item, idx) => {
    const timeStr = item.publishTime 
      ? item.publishTime.toLocaleString('zh-CN', { 
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        }) 
      : '未知时间';
    sourceInfo += `${idx+1}. ${item.title} - ${item.source} (${timeStr}) ${item.url}\n`;
  });
  
  const record = {
    id: `daily-briefing-${today}-${timestamp}`,
    date: today,
    company: '时政大事·国际财经',
    title: `【${today}】时政大事·${summary.title}`,
    summary: summary.summary,
    summary_short: summary.summary_short || summary.summary.substring(0, 150),
    content: summary.summary + sourceInfo,
    sources: newsItems.map(item => ({
      title: item.title,
      url: item.url,
      source: item.source,
      publishTime: item.publishTime,
      score: item.score || 0
    })),
    category: 'daily_briefing',
    keywords: {
      summary_short: summary.summary_short || summary.summary.substring(0, 150),
      search_type: 'global_finance',
      has_24h_news: newsItems.length > 0,
      finance_domains: false
    }
  };

  // 5. 写入数据库
  const success = await writeToDatabase(record);
  if (success) {
    console.log(`✅ 时政财经记录已保存: ${record.title}`);
  }
  
  return success;
}

/**
 * Step F: 处理单家公司
 */
async function processCompany(company) {
  console.log(`\n🏢 处理公司: ${company}`);
  
  const symbol = COMPANY_STOCK_MAP[company];
  
  // 1. 收集新闻
  let allNewsItems = [];
  
  // 如果有A股代码，先尝试AKShare
  if (symbol) {
    const akshareNews = await fetchNewsWithAKShare(company, symbol);
    if (akshareNews && akshareNews.length > 0) {
      allNewsItems.push(...akshareNews);
    }
  }
  
  // 总是尝试Tavily（兜底）
  const tavilyNews = await searchNewsWithTavily(company);
  if (tavilyNews && tavilyNews.length > 0) {
    allNewsItems.push(...tavilyNews);
  }
  
  if (allNewsItems.length === 0) {
    console.log(`⚠️  ${company}无新闻，跳过`);
    return false;
  }
  
  // 2. 信任 Tavily 服务端的 days:1 + AKShare 已做的 24h 过滤
  // 不再做客户端 publishTime 二次过滤（Tavily 的 published_date 常被填充为查询时间，不准）
  const recentNews = allNewsItems;
  
  if (recentNews.length === 0) {
    console.log(`⚠️  ${company}无新闻，跳过`);
    return false;
  }
  
  console.log(`   合并后${recentNews.length}条新闻`);
  
  // 3. DeepSeek总结
  let summary = await summarizeWithDeepSeek(company, recentNews, false);
  if (!summary) {
    console.log(`❌ ${company}总结失败`);
    return false;
  }
  
  // 4. 标题质量控制（重试一次）
  if (summary.qualityCheckFailed) {
    console.log(`🔄 ${company}标题含废词，重试一次...`);
    const retrySummary = await summarizeWithDeepSeek(company, recentNews, false);
    if (!retrySummary || retrySummary.qualityCheckFailed) {
      console.log(`❌ ${company}重试后标题仍不合格，跳过`);
      return false;
    }
    summary = retrySummary;
  }
  
  // 5. 准备数据库记录
  const timestamp = Date.now();
  const companySlug = company.replace(/[\s\/]/g, '-');
  
  // 构建信息来源文本
  let sourceInfo = "\n\n---\n📎 信息来源\n";
  recentNews.forEach((item, idx) => {
    const timeStr = item.publishTime 
      ? item.publishTime.toLocaleString('zh-CN', { 
          year: 'numeric', month: '2-digit', day: '2-digit',
          hour: '2-digit', minute: '2-digit'
        }) 
      : '未知时间';
    sourceInfo += `${idx+1}. ${item.title} - ${item.source} (${timeStr}) ${item.url}\n`;
  });
  
  const record = {
    id: `company-news-${companySlug}-${today}-${timestamp}`,
    date: today,
    company: company,
    title: `【${today}】${company}·${summary.title}`,
    summary: summary.summary,
    summary_short: summary.summary_short || summary.summary.substring(0, 150),
    content: summary.summary + sourceInfo,
    sources: recentNews.map(item => ({
      title: item.title,
      url: item.url,
      source: item.source,
      publishTime: item.publishTime,
      fromAKShare: item.fromAKShare || false,
      fromTavily: item.fromTavily || false,
      score: item.score || 0
    })),
    category: 'company_news',
    keywords: {
      summary_short: summary.summary_short || summary.summary.substring(0, 150),
      search_type: 'deep_search_v3',
      has_24h_news: recentNews.length > 0,
      finance_domains: true
    }
  };
  
  // 6. 写入数据库
  const success = await writeToDatabase(record);
  if (success) {
    console.log(`✅ ${company}记录已保存`);
  }
  
  // 7. 间隔2秒
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return success;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始统一新闻抓取（V3方案 - 深度搜索严格24h筛选版）');
  console.log('📋 版本: 2026-05-05 深度搜索v3');
  console.log('='.repeat(50));
  console.log(`📅 日期: ${today}`);
  console.log(`⏰ 当前时间: ${now.toLocaleString('zh-CN')}`);
  console.log('='.repeat(50));
  
  // 检查环境变量
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ 缺少DEEPSEEK_API_KEY环境变量');
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error('❌ 缺少DATABASE_URL环境变量');
    process.exit(1);
  }
  if (!TAVILY_API_KEY) {
    console.warn('⚠️ 缺少TAVILY_API_KEY环境变量，时政财经和部分公司新闻可能无法获取');
  }
  
  // 测试数据库
  if (!await testDatabaseConnection()) {
    process.exit(1);
  }
  
  // 加载公司列表
  const companies = loadCompanies();
  if (companies.length === 0) {
    console.error('❌ 未加载到公司列表');
    process.exit(1);
  }
  
  console.log(`📊 处理计划: 时政财经 + ${companies.length}家公司\n`);
  
  let globalSuccess = false;
  let companySuccess = 0;
  let companyFailed = 0;
  
  // Step A: 处理时政财经
  if (TAVILY_API_KEY) {
    try {
      globalSuccess = await processGlobalFinance();
    } catch (error) {
      console.error(`❌ 时政财经处理异常: ${error.message}`);
      // 如果遇到速率限制，跳过继续处理公司新闻
      if (error.message.includes('429')) {
        console.log('⚠️ DeepSeek API速率限制，跳过时政财经继续处理公司新闻');
      }
    }
  } else {
    console.log('⚠️ 跳过时政财经（缺少TAVILY_API_KEY）');
  }
  
  // Step B: 处理公司新闻
  console.log(`\n🏢 开始处理${companies.length}家公司新闻`);
  console.log('-'.repeat(40));
  
  for (const company of companies) {
    try {
      const success = await processCompany(company);
      if (success) {
        companySuccess++;
      } else {
        companyFailed++;
      }
    } catch (error) {
      console.error(`❌ ${company}处理异常: ${error.message}`);
      companyFailed++;
    }
  }
  
  // 总结报告
  console.log('\n' + '='.repeat(50));
  console.log('✅ 任务完成！');
  console.log('='.repeat(50));
  console.log(`📊 时政财经: ${globalSuccess ? '成功 ✓' : '失败 ✗'}`);
  console.log(`📊 公司新闻: 成功 ${companySuccess}, 失败 ${companyFailed}, 总计 ${companies.length}`);
  console.log(`⏰ 完成时间: ${new Date().toLocaleString('zh-CN')}`);
  console.log('='.repeat(50));
  
  if (!globalSuccess && companySuccess === 0) {
    console.error('⚠️ 警告: 未成功写入任何记录');
    process.exit(1);
  }
}

// 错误处理
process.on('unhandledRejection', (error) => {
  console.error('❌ 未处理的Promise拒绝:', error);
  process.exit(1);
});

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}