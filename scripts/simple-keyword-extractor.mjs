#!/usr/bin/env node

/**
 * 简单关键词提取器 - 从摘要中提取核心信息
 * 如果AI提取失败，用这个规则匹配
 */

function extractKeywordsFromSummary(company, summary) {
  if (!summary || summary.length < 50) {
    return null;
  }
  
  // 转小写以便匹配
  const lowerSummary = summary.toLowerCase();
  const lowerCompany = company.toLowerCase();
  
  // 常见模式匹配
  const patterns = [
    // 季度报告模式
    { pattern: /一季度|第一季度|q1|第1季度/, keyword: '一季度业绩报告' },
    { pattern: /年报|年度报告|202[0-9]年年报/, keyword: '年度业绩报告' },
    { pattern: /净利润(\s|\u3000)*(\d+)(\.\d+)?(\s|\u3000)*亿元/, keyword: '净利润增长' },
    { pattern: /营收|营业收入(\s|\u3000)*(\d+)(\.\d+)?(\s|\u3000)*亿元/, keyword: '营收增长' },
    
    // 人事变动
    { pattern: /辞任|辞职|离职|退休/, keyword: '重要人事变动' },
    { pattern: /董事长|ceo|总经理/, keyword: '高管变动' },
    { pattern: /股东会|股东大会|董事会/, keyword: '董事会决议' },
    
    // 股价/分红
    { pattern: /分红|派息|股息/, keyword: '分红方案' },
    { pattern: /股价|股票|上涨|下跌|涨幅|跌幅/, keyword: '股价波动' },
    { pattern: /回购|增持|减持/, keyword: '股份变动' },
    
    // 业务动态
    { pattern: /签约|合作|框架协议/, keyword: '签订合作协议' },
    { pattern: /涨价|上调|提价/, keyword: '产品价格上调' },
    { pattern: /降价|下调|促销/, keyword: '产品价格下调' },
    { pattern: /扩张|扩建|投资/, keyword: '业务扩张' },
    { pattern: /裁员|优化|减员/, keyword: '人员优化' },
    
    // 技术/产品
    { pattern: /ai|人工智能/, keyword: 'AI业务进展' },
    { pattern: /云|云计算/, keyword: '云业务发展' },
    { pattern: /新能源|光伏|电池/, keyword: '新能源业务' },
    { pattern: /电动汽车|ev|电动车/, keyword: '电动车业务' },
    
    // 负面消息
    { pattern: /亏损|下降|减少|下滑/, keyword: '业绩承压' },
    { pattern: /裁员|裁员|优化/, keyword: '人员调整' },
    { pattern: /罚款|处罚|调查/, keyword: '监管问题' },
  ];
  
  // 找到匹配的模式
  const matchedKeywords = [];
  for (const { pattern, keyword } of patterns) {
    if (pattern.test(lowerSummary)) {
      matchedKeywords.push(keyword);
    }
    if (matchedKeywords.length >= 2) break; // 最多2个关键词
  }
  
  // 如果没有匹配，尝试提取数字关键词
  if (matchedKeywords.length === 0) {
    const numberMatch = summary.match(/(\d+(\.\d+)?)\s*亿元|亿/g);
    if (numberMatch && numberMatch.length > 0) {
      if (lowerSummary.includes('净利润')) {
        matchedKeywords.push('净利润' + numberMatch[0]);
      } else if (lowerSummary.includes('营收')) {
        matchedKeywords.push('营收' + numberMatch[0]);
      }
    }
  }
  
  // 如果还是没有，看是否有特定的产品/项目
  const productKeywords = ['产品发布', '项目启动', '新品上市', '技术突破', '战略合作'];
  for (const keyword of productKeywords) {
    if (matchedKeywords.length < 2 && lowerSummary.includes(keyword.toLowerCase())) {
      matchedKeywords.push(keyword);
    }
  }
  
  return matchedKeywords.length > 0 ? matchedKeywords.join(' ') : null;
}

/**
 * 智能标题生成器（规则+AI结合）
 */
async function generateBetterTitle(company, summary, today) {
  // 1. 先尝试规则匹配
  const ruleKeywords = extractKeywordsFromSummary(company, summary);
  
  if (ruleKeywords && ruleKeywords.length > 0 && !ruleKeywords.includes('重要动态')) {
    return `【${today}】${company}${ruleKeywords}`;
  }
  
  // 2. 如果规则匹配失败，用AI（需要设置API_KEY）
  const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (DEEPSEEK_API_KEY) {
    // 这里可以调用AI，但不在此实现
  }
  
  // 3. 最后用默认
  return `【${today}】${company}重要动态`;
}

// 测试
if (import.meta.url === `file://${process.argv[1]}`) {
  const today = '2026-05-04';
  
  const testCases = [
    {
      company: '中国平安',
      summary: '平安银行于2026年4月24日至25日期间披露了2026年第一季度报告。报告显示，公司当期实现营业总收入352.77亿元，同比增长4.7%；归属于上市公司股东的净利润为145.23亿元，同比增长3.0%。'
    },
    {
      company: '招商银行', 
      summary: '招商银行于2026年4月30日发布公告，宣布执行董事、行长王良因年龄原因辞去所有相关职务。董事会对王良在任期间的贡献予以高度评价，并授予其"招商银行终身荣誉行员"称号。'
    },
    {
      company: '阿里巴巴',
      summary: '阿里云官网发布公告，因全球AI需求爆发、供应链涨价，阿里云AI算力、存储等产品最高涨价34%。此次调价与百度智能云近期宣布的AI算力产品涨价几乎同步发生。'
    },
    {
      company: '美的集团',
      summary: '美的集团于2026年4月30日披露第一季度财务报告，当期营业总收入达1315.81亿元，归母净利润为126.75亿元，经营活动现金净流入145.29亿元。'
    }
  ];
  
  console.log('🏷️ 简单规则标题生成器测试\n');
  
  for (const { company, summary } of testCases) {
    const keywords = extractKeywordsFromSummary(company, summary);
    const title = keywords ? `【${today}】${company}${keywords}` : `【${today}】${company}重要动态`;
    
    console.log(`🗂️ ${company}:`);
    console.log(`   摘要: ${summary.substring(0, 80)}...`);
    console.log(`   提取关键词: ${keywords || '无'}`);
    console.log(`   生成标题: ${title}`);
    console.log();
  }
  
  console.log('🎯 策略：先匹配规则，失败再用AI，最后用默认');
}

export { extractKeywordsFromSummary, generateBetterTitle };