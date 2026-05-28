import { neon } from '@neondatabase/serverless';

// 从.env.local读取DATABASE_URL
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '.env.local'), 'utf-8');
const match = envContent.match(/DATABASE_URL="([^"]+)"/);
const DATABASE_URL = match ? match[1] : '';

console.log('数据库URL:', DATABASE_URL.substring(0, 50) + '...');

const sql = neon(DATABASE_URL);

async function queryDatabase() {
  try {
    // 查询今天公司新闻数量
    const todayResult = await sql`
      SELECT COUNT(*) FROM news WHERE created_at >= '2026-05-14'::date AND category = 'company_news';
    `;
    console.log('今天(2026-05-14)公司新闻数量:', todayResult[0].count);
    
    // 查询最近几天的情况
    const recentResult = await sql`
      SELECT DATE(created_at) as date, COUNT(*) 
      FROM news 
      WHERE category='company_news' AND created_at >= '2026-05-10' 
      GROUP BY DATE(created_at) 
      ORDER BY date;
    `;
    console.log('\n最近几天公司新闻数量（自2026-05-10起）:');
    console.table(recentResult);
    
    // 查询所有类别最新数据
    const allRecent = await sql`
      SELECT category, COUNT(*) 
      FROM news 
      WHERE created_at >= '2026-05-14'::date
      GROUP BY category;
    `;
    console.log('\n今天所有类别新闻数量:');
    console.table(allRecent);
    
  } catch (error) {
    console.error('查询错误:', error.message);
  }
}

queryDatabase();