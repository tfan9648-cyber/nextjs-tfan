/**
 * Tavily Search API 封装
 * 替代之前的 Google/DuckDuckGo/Bing HTML 爬虫方案
 * 文档: https://tavily.com/docs
 */

const TAVILY_API_KEY = process.env.TAVILY_API_KEY || '';
const TAVILY_API_URL = 'https://api.tavily.com/search';

export interface TavilySearchResult {
  title: string;
  url: string;
  snippet: string;
  score?: number;
  rawContent?: string;
}

interface TavilyOptions {
  /** 结果数量 1-20，默认 10 */
  maxResults?: number;
  /** 搜索深度: basic | advanced，默认 basic */
  searchDepth?: 'basic' | 'advanced';
  /** 主题: general | news，默认 general */
  topic?: 'general' | 'news';
  /** 时间范围: day | week | month | year */
  timeRange?: 'day' | 'week' | 'month' | 'year';
  /** 仅搜索这些域名 */
  includeDomains?: string[];
  /** 排除这些域名 */
  excludeDomains?: string[];
  /** 是否包含原始内容 */
  includeRawContent?: boolean;
}

/**
 * 调用 Tavily Search API
 */
export async function searchTavily(
  query: string,
  options: TavilyOptions = {}
): Promise<TavilySearchResult[]> {
  if (!TAVILY_API_KEY) {
    console.error('❌ TAVILY_API_KEY not configured');
    return [];
  }

  const {
    maxResults = 10,
    searchDepth = 'basic',
    topic = 'general',
    timeRange,
    includeDomains,
    excludeDomains,
    includeRawContent = false,
  } = options;

  try {
    const body: Record<string, unknown> = {
      api_key: TAVILY_API_KEY,
      query,
      max_results: maxResults,
      search_depth: searchDepth,
      topic,
      include_raw_content: includeRawContent,
    };

    if (timeRange) body.time_range = timeRange;
    if (includeDomains?.length) body.include_domains = includeDomains;
    if (excludeDomains?.length) body.exclude_domains = excludeDomains;

    const res = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`❌ Tavily API error: ${res.status} ${errText}`);
      return [];
    }

    const data = await res.json();
    const results: TavilySearchResult[] = (data.results || []).map((r: any) => ({
      title: r.title || '',
      url: r.url || '',
      snippet: r.content || '',
      score: r.score,
      rawContent: r.raw_content,
    }));

    console.log(`✅ Tavily returned ${results.length} results for: ${query}`);
    return results;
  } catch (e) {
    console.error('❌ Tavily search failed:', (e as Error).message);
    return [];
  }
}

/**
 * 搜索财经新闻（专门为上市公司要闻优化）
 */
export async function searchFinanceNews(
  keywords: string[],
  maxResults = 10
): Promise<TavilySearchResult[]> {
  const query = keywords.join(' ') + ' 财经新闻 最新';
  const CN_FINANCE_DOMAINS = [
    'eastmoney.com', 'sina.com.cn', '10jqka.com.cn', 
    'cls.cn', 'cninfo.com.cn', 'stcn.com', 
    'cs.com.cn', 'caixin.com', 'wallstreetcn.com',
    'stockstar.com', 'hexun.com'
  ];
  return searchTavily(query, {
    maxResults,
    searchDepth: 'advanced',
    topic: 'general',
    timeRange: 'month',
    includeDomains: CN_FINANCE_DOMAINS,
    includeRawContent: true,
  });
}

/**
 * 搜索投资分析相关信息
 */
export async function searchInvestment(
  keywords: string[],
  maxResults = 15
): Promise<TavilySearchResult[]> {
  const query = keywords.join(' ') + ' 投资分析 行业趋势 财经';
  return searchTavily(query, {
    maxResults,
    searchDepth: 'advanced',
    topic: 'news',
    timeRange: 'month',
  });
}

/**
 * 搜索财务数据（专门为“查找数据信息”场景优化）
 */
export async function searchFinanceData(
  keywords: string[],
  maxResults = 10
): Promise<TavilySearchResult[]> {
  // 财务数据相关的关键词增强
  const financeTerms = ['财报', '季报', '年报', '净利润', '营业收入', '每股收益', '净资产收益率', '扣非净利润', '每股净资产'];
  const hasFinanceTerm = keywords.some(k => financeTerms.some(t => k.includes(t)));
  
  let query = keywords.join(' ');
  if (hasFinanceTerm) {
    query += ' 财务数据 具体数据 业绩';
  } else {
    query += ' 最新数据 财经';
  }
  
  const CN_FINANCE_DOMAINS = [
    'eastmoney.com', 'sina.com.cn', '10jqka.com.cn', 
    'cls.cn', 'cninfo.com.cn', 'stcn.com', 
    'cs.com.cn', 'caixin.com', 'wallstreetcn.com',
    'stockstar.com', 'hexun.com'
  ];
  
  return searchTavily(query, {
    maxResults,
    searchDepth: 'advanced',
    topic: 'general',
    timeRange: 'month',
    includeDomains: CN_FINANCE_DOMAINS,
    includeRawContent: true,
  });
}

/**
 * 将搜索结果格式化为上下文文本（给 DeepSeek 用）
 */
export function formatSearchContext(results: TavilySearchResult[]): string {
  if (results.length === 0) return '';
  let context = '以下是搜索到的相关信息：\n\n';
  results.forEach((r, i) => {
    context += `${i + 1}. ${r.title}\n   ${r.snippet.slice(0, 300)}\n`;
    // 只取原始内容的前1500字符，最多取前5条的rawContent
    if (r.rawContent && i < 5) {
      const truncated = r.rawContent.slice(0, 1500);
      context += `   详细内容: ${truncated}\n`;
    }
    context += `   来源: ${r.url}\n\n`;
  });
  return context;
}
