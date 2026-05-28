const fetch = require('node-fetch');

// 使用Neon serverless连接检查数据库
const DB_URL = 'postgresql://neondb_owner:npg_0HWy5KbOrlVT@ep-curly-dream-amneuepk-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require';

async function queryDB(sql) {
  const response = await fetch('https://ep-curly-dream-amneuepk.c-5.us-east-1.aws.neon.tech/sql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + 'npg_0HWy5KbOrlVT'
    },
    body: JSON.stringify({
      query: sql
    })
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

async function main() {
  console.log('检查数据库状态...\n');
  
  // 检查global_politics今天的记录
  console.log('=== global_politics (2026-05-14) ===');
  try {
    const res1 = await queryDB("SELECT id, date, title, category, created_at FROM news WHERE category='global_politics' AND date='2026-05-14' ORDER BY created_at DESC LIMIT 5");
    console.log(`找到 ${res1.rows.length} 条记录`);
    res1.rows.forEach(row => {
      console.log(`- ID: ${row.id}, 标题: "${row.title}", 创建时间: ${row.created_at}`);
    });
  } catch (e) {
    console.log(`查询失败: ${e.message}`);
  }
  
  // 检查company_news今天的记录
  console.log('\n=== company_news (2026-05-14) ===');
  try {
    const res2 = await queryDB("SELECT id, date, company, title, category, created_at FROM news WHERE category='company_news' AND date='2026-05-14' ORDER BY created_at DESC LIMIT 10");
    console.log(`找到 ${res2.rows.length} 条记录`);
    res2.rows.forEach((row, i) => {
      console.log(`- ${i+1}. ID: ${row.id}, 公司: "${row.company}", 标题: "${row.title?.substring(0, 50)}...", 创建时间: ${row.created_at}`);
    });
  } catch (e) {
    console.log(`查询失败: ${e.message}`);
  }
  
  // 检查总数
  console.log('\n=== 各分类总数统计 ===');
  try {
    const res3 = await queryDB("SELECT category, COUNT(*) as count FROM news WHERE date='2026-05-14' GROUP BY category");
    res3.rows.forEach(row => {
      console.log(`- ${row.category}: ${row.count} 条`);
    });
  } catch (e) {
    console.log(`查询失败: ${e.message}`);
  }
}

main().catch(console.error);
