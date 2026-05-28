import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function checkGlobalPoliticsData() {
  try {
    console.log('检查数据库中的环球时政简报数据...');
    
    // 查询所有环球时政记录
    const result = await sql`
      SELECT id, title, summary, category, created_at 
      FROM news 
      WHERE category = 'global_politics' 
      ORDER BY created_at DESC 
      LIMIT 10
    `;
    
    console.log(`共找到 ${result.length} 条环球时政记录：\n`);
    
    for (const [index, row] of result.entries()) {
      const date = new Date(row.created_at).toISOString().split('T')[0];
      const summaryPreview = row.summary 
        ? row.summary.substring(0, 100) + (row.summary.length > 100 ? '...' : '')
        : '空';
      
      console.log(`${index + 1}. [${date}] ${row.title}`);
      console.log(`   摘要预览: ${summaryPreview}`);
      console.log(`   内容长度: ${row.summary ? row.summary.length : 0} 字符`);
      console.log(`   ID: ${row.id}`);
      console.log('');
    }
    
    // 检查表结构
    console.log('\n检查表结构...');
    const tableInfo = await sql`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'news'
      ORDER BY ordinal_position
    `;
    
    console.log('news表结构:');
    for (const col of tableInfo) {
      console.log(`  ${col.column_name}: ${col.data_type} ${col.is_nullable === 'YES' ? '(可为空)' : '(非空)'}`);
    }
    
  } catch (error) {
    console.error('数据库查询错误:', error.message);
  }
}

// 执行查询
checkGlobalPoliticsData();