#!/usr/bin/env node

import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 测试AKShare脚本
console.log('🧪 测试 AKShare 脚本...\n');

// 公司-股票代码映射
const COMPANY_STOCK_MAP = {
  "中国平安": "000001",
  "美的集团": "000333",
  "伊利股份": "600887",
  "招商银行": "600036",
  "贵州茅台": "600519",
  "泸州老窖": "000568",
  "万华化学": "600309",
  "福耀玻璃": "600660",
  "昱能科技": "688348",
  "凌霄泵业": "002884",
  "长江电力": "600900"
};

function testAkShare(stockCode) {
  try {
    const scriptPath = join(__dirname, 'fetch_akshare_news.py');
    const command = `${scriptPath} ${stockCode}`;
    console.log(`测试股票: ${stockCode}`);
    
    const result = execSync(command, {
      encoding: 'utf-8',
      maxBuffer: 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
    });
    
    if (!result.trim()) {
      console.log(`  ℹ️  AKShare 返回空结果\n`);
      return [];
    }
    
    const news = JSON.parse(result.trim());
    console.log(`  ✅ 成功获取 ${news.length} 条新闻`);
    if (news.length > 0) {
      console.log(`  示例: ${news[0].title.substring(0, 50)}...`);
    }
    console.log('');
    return news;
  } catch (error) {
    console.error(`  ❌ AKShare 搜索失败:`, error.message);
    return [];
  }
}

// 测试几个股票
const testSymbols = ['000001', '000333', '600519'];
for (const symbol of testSymbols) {
  testAkShare(symbol);
  // 延迟1秒防止限速
  await new Promise(r => setTimeout(r, 1000));
}

// 测试Python脚本直接
console.log('🔧 测试Python脚本直接执行...');
try {
  const output = execSync(`/home/tfan/projects/nextjs-tfan/scripts/venv/bin/python3 ${__dirname}/fetch_akshare_news.py 000001`, {
    encoding: 'utf-8'
  });
  console.log('Python脚本执行成功，输出长度:', output.length);
  if (output.trim()) {
    try {
      const parsed = JSON.parse(output.trim());
      console.log(`解析到 ${parsed.length} 条新闻`);
    } catch { }
  }
} catch (error) {
  console.error('Python脚本执行失败:', error.message);
}

console.log('\n✅ AKShare脚本测试完成');