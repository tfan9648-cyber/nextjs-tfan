#!/usr/bin/env node
const { Pool } = require('pg');
const { readFileSync } = require('fs');

async function parseEnvFile(envPath) {
  const content = readFileSync(envPath, 'utf8');
  const env = {};
  content.split('\n').forEach(line => {
    line = line.trim();
    if (line && !line.startsWith('#')) {
      const equalIndex = line.indexOf('=');
      if (equalIndex !== -1) {
        const key = line.slice(0, equalIndex).trim();
        const value = line.slice(equalIndex + 1).trim();
        env[key] = value;
      }
    }
  });
  return env;
}

async function main() {
  try {
    // 读取环境变量
    const env = parseEnvFile('.env');
    const databaseUrl = env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL not found in .env file');
      process.exit(1);
    }
    
    // 创建数据库连接池
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 1
    });
    
    console.log('🔍 正在查询 2026-05-14 的上市公司新闻数据...');
    
    // 查询今天的新闻
    const result = await pool.query(`
      SELECT 
        id, 
        date, 
        company, 
        title, 
        content,
        category, 
        created_at, 
        timestamp
      FROM news 
      WHERE date = '2026-05-14' AND category = 'company_news'
      ORDER BY created_at DESC
    `);
    
    const rows = result.rows;
    console.log(`✅ 数据库查询成功，找到 ${rows.length} 条记录`);
    console.log('='.repeat(60));
    
    if (rows.length === 0) {
      console.log('⚠️  没有找到 2026-05-14 的上市公司新闻数据');
      await pool.end();
      return;
    }
    
    // 统计公司分布
    const companyCount = {};
    rows.forEach(row => {
      companyCount[row.company] = (companyCount[row.company] || 0) + 1;
    });
    
    // 打印汇总信息
    console.log('📊 数据汇总：');
    console.log(`- 总条数：${rows.length}`);
    console.log(`- 公司数：${Object.keys(companyCount).length}`);
    console.log('- 公司分布：');
    Object.entries(companyCount).forEach(([company, count]) => {
      console.log(`  ${company}: ${count} 条`);
    });
    
    // 检查数据完整性
    console.log('\n🔍 数据完整性检查：');
    let hasEmptyContent = 0;
    let hasMissingTimestamp = 0;
    let titleFormatIssues = 0;
    let contentLengthStats = {
      min: Infinity,
      max: 0,
      avg: 0
    };
    
    const contentLengths = [];
    
    rows.forEach((row, index) => {
      // 检查content是否为空
      if (!row.content || row.content.trim().length === 0) {
        hasEmptyContent++;
      } else {
        contentLengths.push(row.content.length);
      }
      
      // 检查timestamp
      if (!row.timestamp) {
        hasMissingTimestamp++;
      }
      
      // 检查title格式
      if (!row.title.includes('【2026-05-14】') || !row.title.includes('·')) {
        titleFormatIssues++;
      }
      
      // 打印前3条数据详情
      if (index < 3) {
        console.log(`\n📝 示例 ${index + 1}：`);
        console.log(`   公司：${row.company}`);
        console.log(`   标题：${row.title}`);
        console.log(`   分类：${row.category}`);
        console.log(`   内容长度：${row.content ? row.content.length : 0} 字符`);
        console.log(`   创建时间：${row.created_at}`);
        console.log(`   时间戳：${row.timestamp || '空'}`);
      }
    });
    
    // 计算内容长度统计
    if (contentLengths.length > 0) {
      contentLengthStats.min = Math.min(...contentLengths);
      contentLengthStats.max = Math.max(...contentLengths);
      contentLengthStats.avg = Math.round(contentLengths.reduce((a, b) => a + b, 0) / contentLengths.length);
    }
    
    console.log('\n✅ 完整性检查结果：');
    console.log(`- 空内容：${hasEmptyContent} 条`);
    console.log(`- 缺失时间戳：${hasMissingTimestamp} 条`);
    console.log(`- 标题格式问题：${titleFormatIssues} 条`);
    console.log(`- 内容长度：最小 ${contentLengthStats.min}，最大 ${contentLengthStats.max}，平均 ${contentLengthStats.avg} 字符`);
    
    // 检查是否正好是11条（腾讯阿里跳过）
    console.log('\n📈 与预期对比：');
    console.log(`- 实际条数：${rows.length}`);
    console.log(`- 预期条数：11条（腾讯阿里跳过）`);
    console.log(`- 状态：${rows.length === 11 ? '✅ 符合预期' : '⚠️ 不符合预期'}`);
    
    // 列出所有公司
    console.log('\n🏢 入库公司列表：');
    const companies = Object.keys(companyCount).sort();
    companies.forEach(company => {
      console.log(`  ${company}`);
    });
    
    await pool.end();
    console.log('\n✅ 数据库查询完成');
    
  } catch (error) {
    console.error('❌ 查询失败：', error.message);
    console.error('完整错误：', error);
    process.exit(1);
  }
}

// 运行主函数
main();