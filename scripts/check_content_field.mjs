import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function checkContentField() {
  try {
    console.log('检查content字段内容...');
    
    // 查询今天的环球时政记录，包含content字段
    const today = '2026-05-20';
    const result = await sql`
      SELECT id, title, summary, content, category, created_at 
      FROM news 
      WHERE category = 'global_politics' 
        AND DATE(created_at) = ${today}
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    if (result.length > 0) {
      const row = result[0];
      console.log(`标题: ${row.title}`);
      console.log(`摘要: ${row.summary}`);
      console.log(`content字段类型: ${typeof row.content}`);
      console.log(`content字段长度: ${row.content ? row.content.length : 0}`);
      
      if (row.content && row.content.length > 0) {
        console.log('\ncontent字段内容（前500字符）:');
        console.log('--------------------------------------------------');
        console.log(row.content.substring(0, 500));
        console.log('--------------------------------------------------');
      } else {
        console.log('\ncontent字段为空，检查其他字段...');
        
        // 检查是否有其他相关表
        const otherTables = await sql`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
            AND table_name LIKE '%global%' OR table_name LIKE '%politic%'
          ORDER BY table_name
        `;
        
        console.log('相关表:');
        for (const tbl of otherTables) {
          console.log(`  ${tbl.table_name}`);
        }
      }
    } else {
      console.log(`未找到 ${today} 的记录`);
    }
    
  } catch (error) {
    console.error('数据库查询错误:', error.message);
  }
}

// 执行查询
checkContentField();