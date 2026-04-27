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

type SearchResult = { title: string; url: string; snippet: string };

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function searchEastmoney(keyword: string): Promise<SearchResult[]> {
  const url = `https://so.eastmoney.com/news/s?keyword=${encodeURIComponent(keyword)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  const html = await res.text();
  const results: SearchResult[] = [];
  const blocks = html.match(/<div class="result-item[\s\S]*?<\/div>\s*<\/div>/g) || [];
  for (const block of blocks.slice(0, 5)) {
    const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/s);
    const snippetMatch = block.match(/<p[^>]*>(.*?)<\/p>/s);
    if (titleMatch) {
      results.push({
        title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
        url: titleMatch[1],
        snippet: snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || '',
      });
    }
  }
  return results;
}

async function searchCninfo(keyword: string): Promise<SearchResult[]> {
  const url = `http://www.cninfo.com.cn/new/fulltextSearch/full?searchkey=${encodeURIComponent(keyword)}&sdate=&edate=&isfulltext=false&sortName=pubdate&sortType=desc&pageNum=1&pageSize=10`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': 'http://www.cninfo.com.cn/', 'Accept': 'application/json' },
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  const results: SearchResult[] = [];
  const items = data?.announcements || data?.classifiedAnnouncements?.flatMap((c: any) => c.announcements || []) || [];
  for (const item of items.slice(0, 5)) {
    results.push({
      title: (item.announcementTitle || item.secName || '').replace(/<[^>]+>/g, '').trim(),
      url: item.adjunctUrl ? `http://www.cninfo.com.cn/${item.adjunctUrl}` : `http://www.cninfo.com.cn`,
      snippet: (item.announcementContent || item.announcementTitle || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
    });
  }
  return results;
}

async function searchSSE(keyword: string): Promise<SearchResult[]> {
  const url = `http://query.sse.com.cn/search/getSearchResult.do?search=1&searchword=${encodeURIComponent(keyword)}&perpage=10&page=1`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': 'http://www.sse.com.cn/' },
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  const results: SearchResult[] = [];
  const items = data?.result || data?.data || [];
  for (const item of (Array.isArray(items) ? items : []).slice(0, 5)) {
    results.push({
      title: (item.TITLE || item.title || '').replace(/<[^>]+>/g, '').trim(),
      url: item.URL || item.url || 'http://www.sse.com.cn',
      snippet: (item.CONTENT || item.content || item.TITLE || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
    });
  }
  return results;
}

async function searchSZSE(keyword: string): Promise<SearchResult[]> {
  const url = `http://www.szse.cn/api/search/content?keyword=${encodeURIComponent(keyword)}&range=news&pageNum=1&pageSize=10`;
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, 'Referer': 'http://www.szse.cn/' },
    signal: AbortSignal.timeout(10000),
  });
  const data = await res.json();
  const results: SearchResult[] = [];
  const items = data?.data || data?.results || [];
  for (const item of (Array.isArray(items) ? items : []).slice(0, 5)) {
    results.push({
      title: (item.doctitle || item.title || '').replace(/<[^>]+>/g, '').trim(),
      url: item.docurl || item.url || 'http://www.szse.cn',
      snippet: (item.docontent || item.snippet || item.doctitle || '').replace(/<[^>]+>/g, '').trim().slice(0, 300),
    });
  }
  return results;
}

async function searchSinaFinance(keyword: string): Promise<SearchResult[]> {
  const url = `https://search.sina.com.cn/?q=${encodeURIComponent(keyword)}&c=news&from=channel&ie=utf-8`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  const html = await res.text();
  const results: SearchResult[] = [];
  const blocks = html.match(/<div class="box-result[\s\S]*?<\/div>\s*<\/div>/g) || html.match(/<h2>.*?<\/h2>[\s\S]*?(?=<h2>|$)/g) || [];
  for (const block of blocks.slice(0, 5)) {
    const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/s);
    const snippetMatch = block.match(/<p[^>]*class="content"[^>]*>(.*?)<\/p>/s) || block.match(/<p[^>]*>(.*?)<\/p>/s);
    if (titleMatch) {
      results.push({
        title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
        url: titleMatch[1],
        snippet: snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || '',
      });
    }
  }
  return results;
}

async function searchIfeng(keyword: string): Promise<SearchResult[]> {
  const url = `https://so.ifeng.com/?q=${encodeURIComponent(keyword)}&c=1`;
  const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
  const html = await res.text();
  const results: SearchResult[] = [];
  const blocks = html.match(/<div class="[^"]*item[^"]*"[\s\S]*?<\/div>\s*<\/div>/g) || html.match(/<h2>.*?<\/h2>[\s\S]*?(?=<h2>|$)/g) || [];
  for (const block of blocks.slice(0, 5)) {
    const titleMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]+)"[^>]*>(.*?)<\/a>/s);
    const snippetMatch = block.match(/<p[^>]*>(.*?)<\/p>/s);
    if (titleMatch) {
      results.push({
        title: titleMatch[2].replace(/<[^>]+>/g, '').trim(),
        url: titleMatch[1],
        snippet: snippetMatch?.[1]?.replace(/<[^>]+>/g, '').trim().slice(0, 300) || '',
      });
    }
  }
  return results;
}

async function searchFinancialSites(keywords: string[]): Promise<SearchResult[]> {
  const allResults: SearchResult[] = [];
  const keyword = keywords.join(' ');

  const sites = [
    { name: '东方财富', fn: searchEastmoney },
    { name: '巨潮资讯', fn: searchCninfo },
    { name: '上交所', fn: searchSSE },
    { name: '深交所', fn: searchSZSE },
    { name: '新浪财经', fn: searchSinaFinance },
    { name: '凤凰财经', fn: searchIfeng },
  ];

  const promises = sites.map(async ({ name, fn }) => {
    try {
      const results = await fn(keyword);
      console.log(`📊 ${name}: ${results.length} results`);
      return results;
    } catch (e) {
      console.warn(`⚠️ ${name} failed:`, (e as Error).message);
      return [];
    }
  });

  const settled = await Promise.all(promises);
  for (const results of settled) {
    allResults.push(...results);
  }

  return allResults;
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

    // Search financial sites first, then general search
    const financialResults = await searchFinancialSites(validKeywords);
    console.log(`📊 Financial sites total: ${financialResults.length} results`);

    const query = validKeywords.join(' ') + ' 投资分析 行业趋势 财经';
    const generalResults = await searchWithFallback(query);

    // Merge: financial first, deduplicate by URL
    const seenUrls = new Set<string>();
    const searchResults: { title: string; url: string; snippet: string }[] = [];
    for (const r of [...financialResults, ...generalResults]) {
      if (!seenUrls.has(r.url) && r.title) {
        seenUrls.add(r.url);
        searchResults.push(r);
      }
    }

    // Build context from search results
    let searchContext = '';
    if (searchResults.length > 0) {
      searchContext = '以下是搜索到的相关信息：\n\n';
      searchResults.forEach((r, i) => {
        searchContext += `${i + 1}. ${r.title}\n   ${r.snippet}\n   来源: ${r.url}\n\n`;
      });
    }

    // Generate report via DeepSeek
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
      // Try to parse JSON response
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

    // Ensure title <= 20 chars
    if (title.length > 20) {
      title = title.slice(0, 18) + '…';
    }

    const sources = searchResults.map(r => r.url);
    if (sources.length === 0) {
      sources.push(`https://cn.bing.com/search?q=${encodeURIComponent(validKeywords.join(' '))}`);
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
    console.error('Investment report error:', error);
    return NextResponse.json({ error: 'Report generation failed' }, { status: 500 });
  }
}
