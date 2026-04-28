import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { searchFinanceNews, formatSearchContext } from '@/lib/tavily';

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
        { role: 'system', content: '你是一位专业的财经数据分析师。请根据搜索到的信息，提取关键数据，用简洁扼要的方式呈现。只显示关键数据信息，不要废话。保留信息来源的原始链接。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2000,
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
    const { keywords } = await request.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords required' }, { status: 400 });
    }

    const validKeywords = keywords.filter((k: string) => k.trim()).slice(0, 5);
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 使用 Tavily 搜索
    const searchResults = await searchFinanceNews(validKeywords);

    let content = '';
    const sources: string[] = searchResults.map(r => r.url);

    if (searchResults.length > 0) {
      const searchContext = formatSearchContext(searchResults);

      const prompt = `用户查询的关键词：${validKeywords.join('、')}

${searchContext}

请根据以上搜索结果，提取与"${validKeywords.join('、')}"相关的关键数据信息。要求：
1. 只显示关键数据，扼要简洁
2. 用清晰的格式呈现（如列表、表格式）
3. 每条数据标注信息来源
4. 如果搜索结果中没有直接相关的数据，请说明并给出可能的查询方向`;

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

搜索引擎未返回结果。请根据你的知识，尽可能提供相关的关键数据信息。如果数据可能不准确，请注明。要求简洁扼要，只显示关键数据。`;
        content = await callDeepSeek(prompt);
        content += '\n\n⚠️ 注：以上信息来自AI知识库，可能不是最新数据，请以官方公告为准。';
      } catch {
        content = `未搜索到相关数据。建议：\n1. 尝试更具体的关键词\n2. 检查公司名称是否正确\n3. 访问东方财富网(eastmoney.com)或巨潮资讯网(cninfo.com.cn)直接查询`;
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
