"use client";

import React, { useState, useEffect } from 'react';
import { 
  Building2, Newspaper, Search, Edit3, Save, X, GripVertical, 
  ExternalLink, Calendar, Clock, Filter, ChevronDown, RefreshCw,
  Plus, Trash2, CheckCircle, AlertCircle
} from 'lucide-react';

// 类型定义
interface Company {
  id: string;
  name: string;
  order: number;
  newsCount: number;
}

interface Keyword {
  id: string;
  text: string;
  order: number;
}

interface NewsItem {
  id: string;
  date: string;
  company: string;
  title: string;
  summary: string;
  content: string;
  sources: string[];
  category: 'company_news' | 'keyword_analysis';
  readTime: string;
  isKeywordSearch: boolean;
}

export default function StockMonitorPage() {
  // 状态管理
  const [companies, setCompanies] = useState<Company[]>([
    { id: '1', name: '腾讯控股', order: 1, newsCount: 3 },
    { id: '2', name: '阿里巴巴', order: 2, newsCount: 2 },
    { id: '3', name: '美团点评', order: 3, newsCount: 4 },
    { id: '4', name: '京东集团', order: 4, newsCount: 1 },
    { id: '5', name: '小米集团', order: 5, newsCount: 2 },
  ]);
  
  const [keywords, setKeywords] = useState<Keyword[]>([
    { id: 'k1', text: '人工智能发展趋势', order: 1 },
    { id: 'k2', text: '云计算市场分析', order: 2 },
    { id: 'k3', text: '电商行业竞争', order: 3 },
    { id: 'k4', text: '新能源汽车政策', order: 4 },
    { id: 'k5', text: '数字货币监管', order: 5 },
  ]);
  
  const [news, setNews] = useState<NewsItem[]>([]);
  const [filteredNews, setFilteredNews] = useState<NewsItem[]>([]);
  
  const [isEditingCompanies, setIsEditingCompanies] = useState(false);
  const [isEditingKeywords, setIsEditingKeywords] = useState(false);
  const [newCompany, setNewCompany] = useState('');
  const [newKeyword, setNewKeyword] = useState('');
  const [keywordInputs, setKeywordInputs] = useState<string[]>(['', '', '', '', '']);
  const [selectedCompany, setSelectedCompany] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>('today');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  
  // 模拟数据 - 在实际项目中从API获取
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const mockNews: NewsItem[] = [
      {
        id: '1',
        date: today,
        company: '腾讯控股',
        title: `【${today}】腾讯控股：AI大模型在游戏场景的突破性应用`,
        summary: '腾讯发布新一代游戏AI引擎，通过大语言模型技术实现智能NPC对话和动态剧情生成，预计将重塑游戏交互体验。',
        content: `腾讯今日正式发布新一代游戏AI引擎"智游"，该引擎集成最新的多模态大语言模型技术，能够实现智能NPC对话、动态剧情生成和实时场景适配三大核心功能。\n\n技术总监表示，这是AI在游戏领域的重要突破，预计将大幅提升游戏的沉浸感和可玩性。该技术已在内测游戏中取得良好反响，将在下半年逐步开放给更多开发者使用。`,
        sources: ['https://finance.sina.com.cn/tech/2026-04-16', 'https://www.tencent.com/news/20260416'],
        category: 'company_news',
        readTime: '4分钟阅读',
        isKeywordSearch: false
      },
      {
        id: '2',
        date: today,
        company: '阿里巴巴',
        title: `【${today}】阿里巴巴：云计算业务季度增长超预期`,
        summary: '阿里云本季度营收同比增长35%，主要受益于企业数字化转型加速和AI算力需求激增。',
        content: `阿里巴巴集团公布最新季度财报，其中云计算业务表现尤为亮眼，营收同比增长35%，超出市场预期。公司CEO在电话会议中表示，增长主要得益于企业数字化转型加速和人工智能算力需求的快速增长。\n\n分析师指出，随着AI技术的普及和企业上云需求的持续，阿里云有望保持快速增长态势。公司计划在未来三年内投入超过1000亿元用于数据中心建设和技术研发。`,
        sources: ['https://finance.eastmoney.com/a/202604160100123.html', 'https://www.alibabagroup.com/cn/news'],
        category: 'company_news',
        readTime: '5分钟阅读',
        isKeywordSearch: false
      },
      {
        id: '3',
        date: yesterdayStr,
        company: '美团点评',
        title: `【${yesterdayStr}】美团点评：即时零售业务实现规模化盈利`,
        summary: '美团闪购业务首次实现季度盈利，标志着即时零售商业模式趋于成熟，未来发展空间广阔。',
        content: `美团点评发布季度业绩报告，其中即时零售业务（美团闪购）首次实现季度盈利，成为公司新的增长引擎。业务负责人表示，这标志着即时零售商业模式已经趋于成熟，未来发展空间广阔。\n\n报告显示，美团闪购的日均订单量已突破1000万单，覆盖全国超过2800个县区。公司计划进一步加大在仓储物流和技术研发方面的投入，巩固市场领先地位。`,
        sources: ['https://news.stcn.com/news/20260415', 'https://about.meituan.com/news'],
        category: 'company_news',
        readTime: '3分钟阅读',
        isKeywordSearch: false
      },
      {
        id: '4',
        date: today,
        company: '关键词分析',
        title: `【${today}】关键词分析：人工智能发展趋势深度解读`,
        summary: '基于谷歌搜索数据的综合分析显示，人工智能技术在医疗、金融、教育等领域的应用正在加速落地。',
        content: `通过对谷歌搜索数据的深度分析和多源信息整合，人工智能发展趋势呈现以下特点：\n\n1. 技术层面：大语言模型技术创新不断，多模态能力显著提升\n2. 应用层面：从概念验证向实际应用快速过渡，特别是在医疗诊断、金融风控、个性化教育等领域\n3. 产业层面：全球范围内形成完整的AI产业链，中国在应用场景方面具有优势\n4. 政策层面：各国政府积极布局AI发展战略，相关支持政策陆续出台\n\n投资建议：关注具有核心技术优势和丰富应用场景的AI企业。`,
        sources: [
          'https://www.google.com/search?q=人工智能发展趋势',
          'https://scholar.google.com/scholar?q=AI+trends+2026',
          'https://news.google.com/search?q=artificial+intelligence'
        ],
        category: 'keyword_analysis',
        readTime: '8分钟阅读',
        isKeywordSearch: true
      }
    ];
    
    setNews(mockNews);
    setFilteredNews(mockNews.filter(item => item.date === today));
  }, []);
  
  // 筛选新闻
  useEffect(() => {
    let filtered = [...news];
    
    // 日期筛选
    if (selectedDate === 'today') {
      const today = new Date().toISOString().split('T')[0];
      filtered = filtered.filter(item => item.date === today);
    } else if (selectedDate === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      filtered = filtered.filter(item => item.date === yesterdayStr);
    }
    
    // 公司筛选
    if (selectedCompany !== 'all') {
      filtered = filtered.filter(item => item.company === selectedCompany);
    }
    
    // 排序：按日期倒序，同日期按公司顺序
    filtered.sort((a, b) => {
      if (a.date !== b.date) {
        return b.date.localeCompare(a.date);
      }
      if (a.isKeywordSearch && !b.isKeywordSearch) return -1;
      if (!a.isKeywordSearch && b.isKeywordSearch) return 1;
      
      const companyOrderA = companies.findIndex(c => c.name === a.company);
      const companyOrderB = companies.findIndex(c => c.name === b.company);
      return companyOrderA - companyOrderB;
    });
    
    setFilteredNews(filtered.slice(0, 10)); // 只显示前10条
  }, [news, selectedCompany, selectedDate, companies]);
  
  // 添加新公司
  const handleAddCompany = () => {
    if (!newCompany.trim()) return;
    
    const newCompanyObj: Company = {
      id: Date.now().toString(),
      name: newCompany.trim(),
      order: companies.length + 1,
      newsCount: 0
    };
    
    setCompanies([...companies, newCompanyObj]);
    setNewCompany('');
  };
  
  // 删除公司
  const handleDeleteCompany = (id: string) => {
    setCompanies(companies.filter(company => company.id !== id));
  };
  
  // 添加新关键词
  const handleAddKeyword = () => {
    if (!newKeyword.trim()) return;
    
    const newKeywordObj: Keyword = {
      id: `k${Date.now()}`,
      text: newKeyword.trim(),
      order: keywords.length + 1
    };
    
    setKeywords([...keywords, newKeywordObj]);
    setNewKeyword('');
  };
  
  // 删除关键词
  const handleDeleteKeyword = (id: string) => {
    setKeywords(keywords.filter(keyword => keyword.id !== id));
  };
  
  // 更新关键词输入
  const handleKeywordInputChange = (index: number, value: string) => {
    const newInputs = [...keywordInputs];
    newInputs[index] = value;
    setKeywordInputs(newInputs);
  };
  
  // 搜索关键词
  const handleSearchKeywords = async () => {
    const validKeywords = keywordInputs.filter(k => k.trim().length > 0);
    if (validKeywords.length === 0) return;
    
    setIsLoading(true);
    
    // 模拟API调用延迟
    setTimeout(() => {
      const newNewsItem: NewsItem = {
        id: `search-${Date.now()}`,
        date: new Date().toISOString().split('T')[0],
        company: '关键词分析',
        title: `【${new Date().toISOString().split('T')[0]}】关键词分析：${validKeywords.join('、')}`,
        summary: `基于关键词"${validKeywords.join('、')}"的深度分析报告已生成，涵盖相关行业动态、市场趋势和投资机会。`,
        content: `关键词分析报告：${validKeywords.join('、')}\n\n基于对谷歌搜索数据的综合分析和多源信息整合，相关领域当前呈现以下特点：\n\n1. 市场热度：相关讨论量同比增长显著，关注度持续上升\n2. 技术进展：核心技术创新不断涌现，应用场景持续拓展\n3. 政策环境：相关政策逐步明朗，支持力度加大\n4. 投资趋势：资本关注度提高，相关领域融资活跃\n\n建议关注该领域的龙头企业和技术创新公司。`,
        sources: validKeywords.map(k => `https://www.google.com/search?q=${encodeURIComponent(k)}`),
        category: 'keyword_analysis',
        readTime: '6分钟阅读',
        isKeywordSearch: true
      };
      
      setNews([newNewsItem, ...news]);
      setIsLoading(false);
      
      // 清空输入框
      setKeywordInputs(['', '', '', '', '']);
    }, 1500);
  };
  
  // 手动更新新闻
  const handleRefreshNews = async () => {
    setIsLoading(true);
    
    // 模拟API调用
    setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      const newNewsItem: NewsItem = {
        id: `refresh-${Date.now()}`,
        date: today,
        company: companies[Math.floor(Math.random() * companies.length)].name,
        title: `【${today}】实时更新：最新市场动态分析`,
        summary: '根据最新市场数据，今日股市表现平稳，科技板块活跃，多只个股涨幅显著。',
        content: '最新市场动态分析报告显示，今日A股市场整体表现平稳，主要指数小幅上涨。科技板块表现活跃，特别是人工智能和云计算相关个股涨幅显著。\n\n分析人士指出，当前市场对科技创新的关注度持续提升，具备核心技术的公司有望获得更多市场关注。建议投资者关注基本面良好、技术优势明显的优质企业。',
        sources: ['https://finance.sina.com.cn/realstock', 'https://quote.eastmoney.com'],
        category: 'company_news',
        readTime: '3分钟阅读',
        isKeywordSearch: false
      };
      
      setNews([newNewsItem, ...news]);
      setIsLoading(false);
    }, 1000);
  };
  
  // 打开新闻详情
  const handleOpenNewsDetail = (newsItem: NewsItem) => {
    setSelectedNews(newsItem);
  };
  
  // 格式化日期
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    });
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50 p-4 md:p-6">
      {/* 顶部标题栏 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 mb-6 text-white shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Building2 className="w-8 h-8" />
              上市公司新闻监控系统
            </h1>
            <p className="text-blue-100 mt-2">专业分析平台 · 每日自动更新 · 智能关键词搜索</p>
          </div>
          <div className="mt-4 md:mt-0 flex flex-col items-end">
            <button
              onClick={handleRefreshNews}
              disabled={isLoading}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 px-6 py-3 rounded-lg font-semibold flex items-center gap-2 transition-colors"
            >
              <RefreshCw className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? '更新中...' : '立即更新数据'}
            </button>
            <div className="mt-3 text-sm text-blue-100">
              <div>最后更新: {new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</div>
              <div>下次自动更新: 08:00</div>
            </div>
          </div>
        </div>
      </div>
      
      {/* 三栏主要内容 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* 左边栏：上市公司列表 */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-blue-800 flex items-center gap-2">
                <Building2 className="w-5 h-5" />
                上市公司
              </h2>
              <button
                onClick={() => setIsEditingCompanies(!isEditingCompanies)}
                className="text-blue-600 hover:text-blue-800"
              >
                {isEditingCompanies ? <Save className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <div className="p-4">
            {isEditingCompanies ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newCompany}
                    onChange={(e) => setNewCompany(e.target.value)}
                    placeholder="新增公司名称..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddCompany()}
                  />
                  <button
                    onClick={handleAddCompany}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {companies.map((company) => (
                    <div key={company.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                        <span className="font-medium">{company.name}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteCompany(company.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingCompanies(false)}
                    className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    保存
                  </button>
                  <button
                    onClick={() => setIsEditingCompanies(false)}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 flex items-center justify-center gap-2"
                  >
                    <X className="w-5 h-5" />
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <ul className="space-y-2">
                  {companies.map((company) => (
                    <li
                      key={company.id}
                      onClick={() => setSelectedCompany(company.name)}
                      className={`p-3 rounded-lg cursor-pointer transition-colors ${
                        selectedCompany === company.name
                          ? 'bg-blue-50 border-2 border-blue-200'
                          : 'hover:bg-gray-50 border border-transparent'
                      }`}
                    >
                      <div className="flex justify-between items-center">
                        <span className="font-medium">{company.name}</span>
                        <span className="bg-blue-100 text-blue-800 text-xs font-bold px-2 py-1 rounded-full">
                          {company.newsCount}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
                
                <div className="mt-6 pt-4 border-t">
                  <div className="text-sm text-gray-600 space-y-1">
                    <div className="flex justify-between">
                      <span>共 {companies.length} 家公司</span>
                      <span className="font-medium">今日新闻: {news.filter(n => n.date === new Date().toISOString().split('T')[0]).length} 条</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* 中间栏：最新要闻 */}
        <div className="lg:col-span-8 bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h2 className="text-lg font-bold text-blue-800 flex items-center gap-2">
                <Newspaper className="w-5 h-5" />
                最新要闻
              </h2>
              
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-500" />
                  <select
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="today">今日要闻</option>
                    <option value="yesterday">昨日要闻</option>
                    <option value="all">全部要闻</option>
                  </select>
                </div>
                
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-gray-500" />
                  <select
                    value={selectedCompany}
                    onChange={(e) => setSelectedCompany(e.target.value)}
                    className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">所有公司</option>
                    {companies.map((company) => (
                      <option key={company.id} value={company.name}>{company.name}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4">
            {filteredNews.length === 0 ? (
              <div className="text-center py-12">
                <Newspaper className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">暂无相关要闻</p>
                <button
                  onClick={handleRefreshNews}
                  className="mt-4 bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600"
                >
                  更新数据
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredNews.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenNewsDetail(item)}
                    className="p-4 border rounded-xl hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-3 mb-3">
                      <span className="bg-blue-100 text-blue-800 text-sm font-medium px-3 py-1 rounded-full">
                        {item.date}
                      </span>
                      <span className="bg-indigo-100 text-indigo-800 text-sm font-medium px-3 py-1 rounded-full">
                        {item.company}
                      </span>
                      {item.isKeywordSearch && (
                        <span className="bg-emerald-100 text-emerald-800 text-sm font-medium px-3 py-1 rounded-full">
                          关键词分析
                        </span>
                      )}
                      <span className="text-gray-500 text-sm flex items-center gap-1 ml-auto">
                        <Clock className="w-4 h-4" />
                        {item.readTime}
                      </span>
                    </div>
                    
                    <h3 className="text-xl font-bold text-gray-800 mb-3">{item.title}</h3>
                    <p className="text-gray-600 mb-4 line-clamp-2">{item.summary}</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {item.sources.slice(0, 2).map((source, idx) => (
                        <a
                          key={idx}
                          href={source}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800 bg-blue-50 px-3 py-1 rounded-full"
                        >
                          <ExternalLink className="w-3 h-3" />
                          来源{idx + 1}
                        </a>
                      ))}
                    </div>
                  </div>
                ))}
                
                {filteredNews.length > 0 && (
                  <button className="w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors">
                    <ChevronDown className="w-5 h-5 inline-block mr-2" />
                    更多内容
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* 右边栏：关键词提问 */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-lg overflow-hidden">
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-blue-800 flex items-center gap-2">
                <Search className="w-5 h-5" />
                关键词提问
              </h2>
              <button
                onClick={() => setIsEditingKeywords(!isEditingKeywords)}
                className="text-blue-600 hover:text-blue-800"
              >
                {isEditingKeywords ? <Save className="w-5 h-5" /> : <Edit3 className="w-5 h-5" />}
              </button>
            </div>
          </div>
          
          <div className="p-4">
            {isEditingKeywords ? (
              <div className="space-y-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    placeholder="新增关键词..."
                    className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                  />
                  <button
                    onClick={handleAddKeyword}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {keywords.map((keyword) => (
                    <div key={keyword.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <GripVertical className="w-5 h-5 text-gray-400 cursor-move" />
                        <span className="font-medium">{keyword.text}</span>
                      </div>
                      <button
                        onClick={() => handleDeleteKeyword(keyword.id)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                
                <div className="flex gap-2">
                  <button
                    onClick={() => setIsEditingKeywords(false)}
                    className="flex-1 bg-green-500 text-white py-2 rounded-lg hover:bg-green-600 flex items-center justify-center gap-2"
                  >
                    <CheckCircle className="w-5 h-5" />
                    保存
                  </button>
                  <button
                    onClick={() => setIsEditingKeywords(false)}
                    className="flex-1 bg-gray-300 text-gray-700 py-2 rounded-lg hover:bg-gray-400 flex items-center justify-center gap-2"
                  >
                    <X className="w-5 h-5" />
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="space-y-4">
                  {keywordInputs.map((input, index) => (
                    <div key={index} className="relative">
                      <div className="absolute left-3 top-1/2 transform -translate-y-1/2 bg-blue-100 text-blue-800 w-6 h-6 rounded-full flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </div>
                      <input
                        type="text"
                        value={input}
                        onChange={(e) => handleKeywordInputChange(index, e.target.value)}
                        placeholder="输入关键词..."
                        className="w-full pl-10 pr-3 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ))}
                </div>
                
                <button
                  onClick={handleSearchKeywords}
                  disabled={isLoading || keywordInputs.every(k => !k.trim())}
                  className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-lg font-semibold hover:from-emerald-600 hover:to-teal-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <Search className="w-5 h-5" />
                  {isLoading ? '搜索中...' : '搜索全部关键词'}
                </button>
                
                <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
                  <AlertCircle className="w-4 h-4 inline-block mr-1" />
                  输入关键词后，点击搜索将自动生成详细分析报告
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* 底部信息 */}
      <div className="mt-6 text-center text-gray-600 text-sm">
        <p>专业投资分析工具 · 数据来源: 各大财经网站 & 谷歌搜索 · 更新时间: 每日08:00</p>
        <p className="mt-2">
          <span className="inline-flex items-center gap-2 bg-green-100 text-green-800 px-3 py-1 rounded-full">
            <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
            系统状态: 运行正常
          </span>
          <span className="mx-4">数据版本: v2.0</span>
          <span>技术支持: 小龙助手 🐉</span>
        </p>
      </div>
      
      {/* 新闻详情弹窗 */}
      {selectedNews && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold mb-2">{selectedNews.title}</h2>
                  <div className="flex flex-wrap gap-2">
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                      {selectedNews.date}
                    </span>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                      {selectedNews.company}
                    </span>
                    <span className="bg-white/20 px-3 py-1 rounded-full text-sm">
                      {selectedNews.readTime}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedNews(null)}
                  className="text-white hover:text-gray-200"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="prose max-w-none">
                <h3 className="text-lg font-bold text-gray-800 mb-4">内容摘要</h3>
                <p className="text-gray-700 mb-6">{selectedNews.summary}</p>
                
                <h3 className="text-lg font-bold text-gray-800 mb-4">详细内容</h3>
                <div className="whitespace-pre-line text-gray-700 mb-6">
                  {selectedNews.content}
                </div>
                
                <h3 className="text-lg font-bold text-gray-800 mb-4">信息来源</h3>
                <div className="space-y-2">
                  {selectedNews.sources.map((source, index) => (
                    <a
                      key={index}
                      href={source}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <ExternalLink className="w-4 h-4 text-blue-500" />
                        <span className="text-blue-600 hover:text-blue-800 break-all">
                          {source}
                        </span>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="border-t p-4">
              <button
                onClick={() => setSelectedNews(null)}
                className="w-full bg-blue-500 text-white py-3 rounded-lg hover:bg-blue-600 font-semibold"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}