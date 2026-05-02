import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { searchFinanceData, formatSearchContext } from '@/lib/tavily';

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';

async function callDeepSeek(prompt: string): Promise<string> {
  const res = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: 'system', content: '你是一位专业的财经数据分析师。请根据搜索到的信息，提取关键财务数据。\n重点提取以下指标（如果搜索结果中有的话）：\n- 营业收入及同比增长率\n- 净利润及同比增长率\n - 扣非净利润及同比增长率\n- 每股收益（EPS）\n- 每股净资产\n- 净资产收益率（ROE）\n- 毛利率\n- 净利率\n- 经营性现金流\n\n要求：\n1. 数据必须是具体的数字，不能只说"增长"而不给数据\n2. 用清晰的格式呈现，但不要使用markdown表格或列表符号，使用纯文本格式\n3. 标注数据的报告期和来源\n4. 如果某些指标未找到，标注"未查到"\n5. 输出纯文本，不要使用任何markdown格式符号（如*、#、-列表等）。用换行和空行分隔段落，用数字序号代替列表符号。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }),
    signal: AbortSignal.timeout(120000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`DeepSeek API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const secretKey = process.env.API_SECRET_KEY;
    if (!secretKey || apiKey !== secretKey) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { keywords } = await request.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords required' }, { status: 400 });
    }

    const validKeywords = keywords.filter((k: string) => k.trim()).slice(0, 5);
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 使用 Tavily 搜索财务数据
    const searchResults = await searchFinanceData(validKeywords);

    let content = '';
    const sources: string[] = searchResults.map(r => r.url);

    if (searchResults.length > 0) {
      const searchContext = formatSearchContext(searchResults);

      const prompt = `用户查询的关键词：${validKeywords.join('、')}

${searchContext}

请根据以上搜索结果，提取与"${validKeywords.join('、')}"相关的关键财务数据。要求：
1. 必须提取具体数字（营业收入、净利润、每股收益、净资产收益率等）
2. 用清晰的纯文本格式呈现，不要使用markdown符号
3. 标注报告期（如2026年一季度）和信息来源
4. 对比上年同期的变化（如果有数据）
5. 如果搜索结果中没有具体数字，明确说明"未在搜索结果中找到具体数据"并建议查阅巨潮资讯网(cninfo.com.cn)或东方财富网的原始公告`;

      try {
        content = await callDeepSeek(prompt);
      } catch (aiError) {
        console.error('DeepSeek failed, using raw results:', aiError);
        content = `🔍 数据查询结果：${validKeywords.join('、')}\n\n`;
        searchResults.forEach((r, i) => {
          content += `${i + 1}. **${r.title}**\n`;
          if (r.snippet) content += `   ${r.snippet}\n`;
          content += `   来源: ${r.url}\n\n`;
        });
      }
    } else {
      // Tavily 无结果 - 让 DeepSeek 用知识库回答
      try {
        const prompt = `用户想查询以下信息：${validKeywords.join('、')}

搜索引擎未返回结果。请根据你的知识，尽可能提供相关的财务数据信息。重点查找以下指标：\n- 营业收入及增长率\n- 净利润及增长率\n- 每股收益（EPS）\n- 净资产收益率（ROE）\n\n如果数据可能不准确，请注明"数据可能不准，请以官方公告为准"。`;
        content = await callDeepSeek(prompt);
        content += '\n\n⚠️ 注：以上信息来自AI知识库，可能不是最新数据，请以官方公告为准。建议查阅巨潮资讯网(cninfo.com.cn)或东方财富网的原始公告。';
      } catch {
        content = `未搜索到相关数据。建议：\n1. 访问巨潮资讯网(cninfo.com.cn)直接查询原版公告\n2. 访问东方财富网(eastmoney.com)查看最新财报\n3. 确认公司名称是否正确（使用全称或股票代码）\n4. 财报数据通常在报告期结束后1-3个月内发布`;
      }
    }

    if (sources.length === 0) {
      sources.push(`https://www.tavily.com`);
    }

    let titleKeywords = validKeywords.slice(0, 2).join('·');
    if (titleKeywords.length > 15) titleKeywords = validKeywords[0].slice(0, 12);

    const newsItem = {
      id: `data-info-${timestamp}`,
      date: today,
      company: '数据信息查询',
      title: `【${today}】${titleKeywords}数据查询`,
      summary: content.length > 100 ? content.slice(0, 100) + '...' : content,
      content,
      sources,
      category: 'data_info',
      readTime: '1分钟阅读',
      isKeywordSearch: true,
      timestamp,
      keywords: validKeywords,
    };

    // Save to database
    const sql = getDb();
    await initDb();
    await sql`
      INSERT INTO news (id, date, company, title, summary, content, sources, category, read_time, is_keyword_search, timestamp, keywords)
      VALUES (${newsItem.id}, ${newsItem.date}, ${newsItem.company}, ${newsItem.title}, ${newsItem.summary}, ${newsItem.content}, ${JSON.stringify(newsItem.sources)}, ${newsItem.category}, ${newsItem.readTime}, ${newsItem.isKeywordSearch}, ${newsItem.timestamp}, ${JSON.stringify(newsItem.keywords)})
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
    `;

    return NextResponse.json(newsItem);
  } catch (error) {
    console.error('Search data error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
