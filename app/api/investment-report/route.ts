import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';
import { searchInvestment, formatSearchContext } from '@/lib/tavily';

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
        { role: 'system', content: '你是一位专业的投资分析师，擅长撰写深度投资分析报告。报告要求数据翔实、分析深入、逻辑清晰。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
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
    const { keywords } = await request.json();
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'keywords required' }, { status: 400 });
    }

    const validKeywords = keywords.filter((k: string) => k.trim()).slice(0, 5);
    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    // 使用 Tavily 搜索投资相关信息（advanced 深度搜索）
    const searchResults = await searchInvestment(validKeywords);
    console.log(`📊 Tavily investment search: ${searchResults.length} results`);

    // 构建搜索上下文
    const searchContext = formatSearchContext(searchResults);

    // 生成投资报告
    const prompt = `请根据以下关键词和参考信息，撰写一份深度投资分析报告。

关键词：${validKeywords.join('、')}

${searchContext || '（未搜索到相关信息，请根据你的专业知识撰写报告）'}

要求：
1. 报告标题不超过20个中文字，需概括性强
2. 报告正文至少1000字
3. 包含行业分析、市场趋势、投资机会、风险提示等板块
4. 在适当位置引用信息来源
5. 最后附上信息来源列表

请以以下JSON格式返回（不要包含markdown代码块标记）：
{"title": "报告标题", "content": "报告正文（支持markdown格式）"}`;

    let title = `${validKeywords.slice(0, 2).join('·')}投资分析`;
    let content = '';

    try {
      const aiResponse = await callDeepSeek(prompt);
      // 尝试解析 JSON 响应
      const jsonMatch = aiResponse.match(/\{[\s\S]*"title"[\s\S]*"content"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        title = parsed.title || title;
        content = parsed.content || aiResponse;
      } else {
        content = aiResponse;
      }
    } catch (aiError) {
      console.error('DeepSeek API call failed:', aiError);
      content = `# ${validKeywords.join('、')} 投资分析报告\n\n`;
      content += `> AI分析服务暂时不可用，以下为搜索结果摘要。\n\n`;
      if (searchResults.length > 0) {
        content += `## 搜索结果\n\n`;
        searchResults.forEach((r, i) => {
          content += `### ${i + 1}. ${r.title}\n${r.snippet}\n\n来源: ${r.url}\n\n`;
        });
      }
      content += `\n请稍后重试以获取完整的AI分析报告。`;
    }

    // 标题不超过20字
    if (title.length > 20) {
      title = title.slice(0, 18) + '…';
    }

    const sources = searchResults.map(r => r.url);
    if (sources.length === 0) {
      sources.push(`https://www.tavily.com`);
    }

    const newsItem = {
      id: `investment-report-${timestamp}`,
      date: today,
      company: '投资报告',
      title: `【${today}】${title}`,
      summary: `基于关键词"${validKeywords.join('、')}"的深度投资分析报告`,
      content,
      sources,
      category: 'investment_report',
      readTime: '20分钟阅读',
      isKeywordSearch: true,
      timestamp,
      keywords: validKeywords,
    };

    // 保存到数据库
    const sql = getDb();
    await initDb();
    await sql`
      INSERT INTO news (id, date, company, title, summary, content, sources, category, read_time, is_keyword_search, timestamp, keywords)
      VALUES (${newsItem.id}, ${newsItem.date}, ${newsItem.company}, ${newsItem.title}, ${newsItem.summary}, ${newsItem.content}, ${JSON.stringify(newsItem.sources)}, ${newsItem.category}, ${newsItem.readTime}, ${newsItem.isKeywordSearch}, ${newsItem.timestamp}, ${JSON.stringify(newsItem.keywords)})
      ON CONFLICT (id) DO UPDATE SET content = EXCLUDED.content
    `;

    return NextResponse.json(newsItem);
  } catch (error) {
    console.error('Investment report error:', error);
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
