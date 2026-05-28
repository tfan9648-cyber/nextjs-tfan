// 简单查询脚本，不使用pg模块
const https = require('https');

const dbUrl = "postgresql://neondb_owner:npg_0HWy5KbOrlVT@ep-curly-dream-amneuepk-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require";

// 使用curl命令查询
const { execSync } = require('child_process');

try {
  // 查询今天公司新闻数量
  const query1 = `SELECT COUNT(*) FROM news WHERE created_at >= '2026-05-14'::date AND category = 'company_news';`;
  const cmd1 = `psql "${dbUrl}" -c "${query1}"`;
  
  console.log('执行查询1:', query1);
  try {
    const result1 = execSync(cmd1, { encoding: 'utf-8' });
    console.log('结果1:', result1);
  } catch (e) {
    console.log('查询失败1:', e.message);
  }
  
  // 查询最近几天的情况
  const query2 = `SELECT DATE(created_at) as date, COUNT(*) FROM news WHERE category='company_news' AND created_at >= '2026-05-10' GROUP BY DATE(created_at) ORDER BY date;`;
  const cmd2 = `psql "${dbUrl}" -c "${query2}"`;
  
  console.log('\n执行查询2:', query2);
  try {
    const result2 = execSync(cmd2, { encoding: 'utf-8' });
    console.log('结果2:', result2);
  } catch (e) {
    console.log('查询失败2:', e.message);
  }
  
} catch (error) {
  console.error('错误:', error.message);
}