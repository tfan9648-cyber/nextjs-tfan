#!/usr/bin/env node

/**
 * AKShare新闻抓取脚本 - 智能标题版
 * 老板要求的方案2：从summary中提取关键词生成有信息的标题
 */

import akshare from 'akshare';
import { neon } from '@neondatabase/serverless';
import { generateSmartTitle } from './generate-smart-title.mjs';

// 环境变量
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-ai/DeepSeek-V3.2';
const DATABASE_URL = process.env.DATABASE_URL || '';

// 公司列表
const COMPANY_STOCK_MAP = {
  '中国平安': '601318.SH',
  '美的集团': '000333.SZ',
  '伊利股份': '600887.SH',
  '招商银行': '600036.SH',
  '贵州茅台': '600519.SH',
  '万华化学': '600309.SH',
  '福耀玻璃': '600660.SH',
  '昱能科技': '688348.SH',
  '凌霄泵业': '002884.SZ',
  '长江电力': '600900.SH'
};

/**
 * 获取公司新闻 (AKShare)
 */
async function fetchCompanyNews(company, stockCode) {
  console.log(`📰 处理: ${company} (${stockCode})`);
  
  try {
    const newsData = await akshare.stock_news_em({
      symbol: stockCode,
      start_date: '2026-04-01',
      end_date: '2026-05-04',
    });
    
    if (!newsData || newsData.length === 0) {
      console.warn(`⚠️  ${company}: 未找到新闻数据`);
      return null;
    }
    
    // 取最新的3条新闻
    const latestNews = newsData.slice(0, 3);
    const newsItems = latestNews.map(n => ({
      title: n.新闻标题 || '',
      content: n.新闻内容 || '',
      publishTime: n.发布时间 || '',
      source: n.文章来源 || '未知来源'
    }));
    
    console.log(`✅ ${company}: 找到 ${newsItems.length} 条新闻`);
    return newsItems;
    
  } catch (error) {
    console.error(`❌ ${company} 新闻获取失败:`, error.message);
    return null;
  }
}

/**
 * 用DeepSeek生成总结
 */
async function generateSummary(company, newsItems) {
  if (!newsItems || newsItems.length === 0) return null;
  
  console.log(`🤖 ${company}: 生成AI总结...`);
  
  // 合并所有新闻内容
  const allContent = newsItems.map((n, i) => 
    `第${i+1}条: ${n.title}\n内容: ${n.content}`
  ).join('\n\n');
  
  const prompt = `你是一个财经新闻分析师。请根据以下${company}的最新新闻，生成一个简洁的新闻摘要：

公司：${company}
新闻：
${allContent}

要求：
1. 总结核心信息（不要超过300字）
2. 突出重要数据和关键事件
3. 语言简洁专业，适合投资者阅读
4. 用中文回答

摘要：`;

  try {
    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      console.error(`❌ ${company} 总结失败: API请求失败 ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();
    
  } catch (error) {
    console.error(`❌ ${company} 总结失败:`, error.message);
    return null;
  }
}

/**
 * 写入数据库（使用智能标题）
 */
async function writeToDatabaseWithSmartTitle(company, summary, newsItems) {
  if (!DATABASE_URL) {
    console.error('❌ 缺少 DATABASE_URL 环境变量');
    return false;
  }

  if (!summary) {
    console.log(`⏭️ ${company}: 无总结内容，跳过数据库写入`);
    return false;
  }

  try {
    const sql = neon(DATABASE_URL);
    const today = new Date().toISOString().split('T')[0];
    
    // 构建完整新闻内容
    const fullContent = summary + '\n\n---\n\n原始新闻：\n' + 
      newsItems.map((n, i) => `${i + 1}. ${n.title} - ${n.source} (${n.publishTime})`).join('\n');

    // 生成智能标题
    console.log(`🏷️  ${company}: 生成智能标题...`);
    const smartTitle = await generateSmartTitle(company, summary, today);
    console.log(`   智能标题: "${smartTitle}"`);
    
    // 删除可能存在的旧记录
    try {
      await sql`DELETE FROM news WHERE date = ${today} AND company = ${company}`;
    } catch (e) {
      // 忽略删除错误
    }
    
    // 生成ID
    const timestamp = Date.now();
    const companySlug = company.replace(/[\s\/]/g, '-');
    const id = `company-news-${companySlug}-${today}-${timestamp}`;
    
    // 插入新记录
    console.log(`💾 ${company}: 写入数据库`);
    await sql`
      INSERT INTO news (id, date, company, title, content, category, created_at)
      VALUES (${id}, ${today}, ${company}, ${smartTitle}, ${fullContent}, 'company_news', NOW())
    `;
    
    return true;
    
  } catch (error) {
    console.error(`❌ ${company} 数据库写入失败:`, error.message);
    return false;
  }
}

/**
 * 处理单个公司
 */
async function processCompany(company, stockCode, index, total) {
  console.log(`\n🔍 进度: ${index + 1}/${total} - ${company}`);
  
  // 添加延迟避免API限速
  if (index > 0) {
    console.log(`⏳ 等待3秒避免API限速...`);
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // 1. 获取新闻
  const newsItems = await fetchCompanyNews(company, stockCode);
  if (!newsItems) {
    console.log(`⏭️  ${company}: 跳过，无新闻数据`);
    return false;
  }
  
  // 2. 生成AI总结
  const summary = await generateSummary(company, newsItems);
  if (!summary) {
    console.log(`⏭️  ${company}: 跳过，AI总结失败`);
    return false;
  }
  
  // 3. 存入数据库（智能标题）
  const success = await writeToDatabaseWithSmartTitle(company, summary, newsItems);
  
  // 额外延迟，避免密集API调用
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  return success;
}

/**
 * 主函数
 */
async function main() {
  console.log('🚀 开始 AKShare 新闻抓取任务（智能标题版）');
  console.log('='.repeat(50));
  
  // 检查环境变量
  if (!DEEPSEEK_API_KEY) {
    console.error('❌ 缺少 DEEPSEEK_API_KEY 环境变量');
    console.log('💡 请设置环境变量或在.env文件中配置');
    process.exit(1);
  }
  
  if (!DATABASE_URL) {
    console.error('❌ 缺少 DATABASE_URL 环境变量');
    process.exit(1);
  }
  
  console.log('📋 从硬编码映射加载公司列表');
  
  const companies = Object.entries(COMPANY_STOCK_MAP);
  console.log(`🔍 处理 ${companies.length} 家公司`);
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < companies.length; i++) {
    const [company, stockCode] = companies[i];
    
    try {
      const success = await processCompany(company, stockCode, i, companies.length);
      if (success) successCount++;
      else failCount++;
    } catch (error) {
      console.error(`❌ ${company} 处理失败:`, error.message);
      failCount++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✅ 任务完成！');
  console.log(`📊 统计: 成功 ${successCount}, 失败 ${failCount}, 总计 ${companies.length}`);
  console.log('\n🎉 智能标题已应用到所有公司新闻！');
  console.log('💡 网站将显示更有信息量的标题，如');
  console.log('   "【2026-05-04】中国平安一季度净利润增长"');
  console.log('   "【2026-05-04】招商银行行长辞任 获终身荣誉行员"');
}

// 执行
main().catch(error => {
  console.error('❌ 脚本运行失败:', error.message);
  process.exit(1);
});