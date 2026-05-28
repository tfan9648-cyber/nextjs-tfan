const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://neondb_owner:npg_0HWy5KbOrlVT@ep-curly-dream-amneuepk-pooler.c-5.us-east-1.aws.neon.tech/neondb?channel_binding=require&sslmode=require'
});

async function query() {
  try {
    const client = await pool.connect();
    
    // 查询今天公司新闻数量
    const todayResult = await client.query(
      "SELECT COUNT(*) FROM news WHERE created_at >= '2026-05-14'::date AND category = 'company_news'"
    );
    console.log('今天(2026-05-14)公司新闻数量:', todayResult.rows[0].count);
    
    // 查询最近几天的情况
    const recentResult = await client.query(
      "SELECT DATE(created_at) as date, COUNT(*) FROM news WHERE category='company_news' AND created_at >= '2026-05-10' GROUP BY DATE(created_at) ORDER BY date"
    );
    console.log('\n最近几天公司新闻数量（自2026-05-10起）:');
    console.table(recentResult.rows);
    
    client.release();
  } catch (err) {
    console.error('查询错误:', err);
  } finally {
    await pool.end();
  }
}

query();