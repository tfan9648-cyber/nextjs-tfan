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
        { role: 'system', content: '你是财务数据提取工具。从搜索结果中提取所有能找到的具体财务数字。\n\n规则：\n1. 尽可能列出所有主要财务指标（营收、净利润、扣非净利润、EPS、每股净资产、ROE、毛利率、净利率、现金流、同比增长率等）\n2. 每条数据一行，格式：指标名称：数值\n3. 标注报告期（如2026年一季度）\n4. 不要输出任何markdown符号（不要* # - | 等）\n5. 不要分析、不要评论、不要建议\n6. 没找到的数据不要编造\n7. 纯文本输出，用换行分隔' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.1,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(30000),
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

    const validKeywords = keywords.filter((k: string) => k.trim()).slice(0, 10);
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 使用 Tavily 搜索财务数据
    const searchResults = await searchFinanceData(validKeywords);

    let content = '';
    const sources: string[] = searchResults.map(r => r.url);

    if (searchResults.length > 0) {
      const searchContext = formatSearchContext(searchResults);

      const prompt = `查询关键词：${validKeywords.join('、')}

${searchContext}

请从以上搜索结果中提取与"${validKeywords.join('、')}"相关的具体财务数字。每条数据一行，只要数字，不要分析。`;

      try {
        content = await callDeepSeek(prompt);
      } catch (aiError) {
        console.error('DeepSeek failed, using raw results:', aiError);
        content = `数据查询结果：${validKeywords.join('、')}\n\n`;
        searchResults.forEach((r, i) => {
          content += `${i + 1}. ${r.title}\n`;
          if (r.snippet) content += `   ${r.snippet.slice(0, 200)}\n`;
          content += `   来源: ${r.url}\n\n`;
        });
        content += '\n注：AI整理服务暂时不可用，以上为原始搜索摘要。';
      }
    } else {
      // Tavily 无结果 - 让 DeepSeek 用知识库回答
      try {
        const prompt = `查询关键词：${validKeywords.join('、')}

搜索未返回结果。请根据你的知识提供相关财务数字。每条数据一行，只要数字，不要分析。没有的数据不要编造。`;
        content = await callDeepSeek(prompt);
        content += '\n\n注：以上来自AI知识库，可能不是最新数据，请以官方公告为准。';
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
