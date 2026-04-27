import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const newsDir = path.join(process.cwd(), 'data', 'news');

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';

async function searchGoogle(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=10&hl=zh-CN`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const blocks = html.split('<div class="g"');
    for (const block of blocks.slice(1, 11)) {
      const titleMatch = block.match(/<h3[^>]*>(.*?)<\/h3>/s);
      const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
      const snippetMatch = block.match(/<span[^>]*class="[^"]*"[^>]*>(.*?)<\/span>/s);
      if (titleMatch && urlMatch) {
        results.push({
          title: titleMatch[1].replace(/<[^>]+>/g, '').trim(),
          url: urlMatch[1],
          snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]+>/g, '').trim().slice(0, 300) : '',
        });
      }
    }
    if (results.length > 0) return results;
    throw new Error('No Google results parsed');
  } catch (e) {
    console.warn('Google search failed, trying DuckDuckGo:', (e as Error).message);
    return [];
  }
}

async function searchDuckDuckGo(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const resultBlocks = html.split('class="result__body"');
    for (const block of resultBlocks.slice(1, 11)) {
      const titleMatch = block.match(/class="result__a"[^>]*>(.*?)<\/a>/s);
      const urlMatch = block.match(/href="(https?:\/\/[^"]+)"/);
      const uddgMatch = block.match(/uddg=(https?[^&"]+)/);
      const snippetMatch = block.match(/class="result__snippet"[^>]*>(.*?)<\/a>/s) || block.match(/class="result__snippet"[^>]*>(.*?)<\//s);
      const extractedUrl = urlMatch?.[1] || (uddgMatch?.[1] ? decodeURIComponent(uddgMatch[1]) : '');
      const title = titleMatch?.[1]?.replace(/<[^>]+>/g, '').trim() || '';
      if (title && extractedUrl && !extractedUrl.includes('duckduckgo.com')) {
        results.push({ title, url: extractedUrl, snippet: snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || '' });
      }
    }
    if (results.length > 0) return results;
    throw new Error('No DuckDuckGo results parsed');
  } catch (e) {
    console.warn('DuckDuckGo search failed, trying Bing:', (e as Error).message);
    return [];
  }
}

async function searchBing(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: AbortSignal.timeout(10000),
    });
    const html = await res.text();
    const results: { title: string; url: string; snippet: string }[] = [];
    const blocks = html.split('<li class="b_algo"');
    for (const block of blocks.slice(1, 11)) {
      const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/s);
      const snippetMatch = block.match(/<p[^>]*>(.*?)<\/p>/s);
      if (titleMatch) {
        const extractedUrl = titleMatch[1];
        const title = titleMatch[2].replace(/<[^>]+>/g, '').trim();
        const snippet = snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || '';
        if (title && extractedUrl && !extractedUrl.includes('bing.com')) {
          results.push({ title, url: extractedUrl, snippet });
        }
      }
    }
    return results;
  } catch (e) {
    console.error('Bing search also failed:', e);
    return [];
  }
}

async function searchWithFallback(query: string): Promise<{ title: string; url: string; snippet: string }[]> {
  let results = await searchGoogle(query);
  if (results.length > 0) {
    console.log(`✅ Google returned ${results.length} results`);
    return results;
  }
  results = await searchDuckDuckGo(query);
  if (results.length > 0) {
    console.log(`✅ DuckDuckGo returned ${results.length} results`);
    return results;
  }
  results = await searchBing(query);
  console.log(`${results.length > 0 ? '✅' : '❌'} Bing returned ${results.length} results`);
  return results;
}

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
    const query = validKeywords.join(' ') + ' 财经数据';

    // Search using Bing China
    const searchResults = await searchWithFallback(query);

    const today = new Date().toISOString().split('T')[0];
    const timestamp = Date.now();

    let content = '';
    const sources: string[] = searchResults.map(r => r.url);

    if (searchResults.length > 0) {
      let searchContext = '以下是搜索到的相关信息：\n\n';
      searchResults.forEach((r, i) => {
        searchContext += `${i + 1}. ${r.title}\n   ${r.snippet}\n   来源: ${r.url}\n\n`;
      });

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
      // No search results - let DeepSeek answer from knowledge
      try {
        const prompt = `用户想查询以下信息：${validKeywords.join('、')}

搜索引擎未返回结果。请根据你的知识，尽可能提供相关的关键数据信息。如果数据可能不准确，请注明。要求简洁扼要，只显示关键数据。`;
        content = await callDeepSeek(prompt);
        content += '\n\n⚠️ 注：以上信息来自AI知识库，可能不是最新数据，请以官方公告为准。';
        sources.push(`https://cn.bing.com/search?q=${encodeURIComponent(validKeywords.join(' '))}`);
      } catch {
        content = `未搜索到相关数据。建议：\n1. 尝试更具体的关键词\n2. 检查公司名称是否正确\n3. 访问东方财富网(eastmoney.com)或巨潮资讯网(cninfo.com.cn)直接查询`;
        sources.push(`https://cn.bing.com/search?q=${encodeURIComponent(validKeywords.join(' '))}`);
      }
    }

    if (sources.length === 0) {
      sources.push(`https://cn.bing.com/search?q=${encodeURIComponent(query)}`);
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

    // Save to file
    if (!fs.existsSync(newsDir)) fs.mkdirSync(newsDir, { recursive: true });
    const filepath = path.join(newsDir, `${today}.json`);
    let existing: any[] = [];
    if (fs.existsSync(filepath)) {
      try { existing = JSON.parse(fs.readFileSync(filepath, 'utf8')); } catch {}
      if (!Array.isArray(existing)) existing = [];
    }
    existing.push(newsItem);
    fs.writeFileSync(filepath, JSON.stringify(existing, null, 2), 'utf8');

    return NextResponse.json(newsItem);
  } catch (error) {
    console.error('Search data error:', error);
    return NextResponse.json({ error: 'Search failed' }, { status: 500 });
  }
}
