import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

async function queryTodayGlobalPolitics() {
  const today = '2026-05-20';
  
  try {
    console.log(`查询 ${today} 的环球时政简报（category='global_politics'）...`);
    
    // 查询今天的记录
    const todayResult = await sql`
      SELECT id, title, summary, category, created_at 
      FROM news 
      WHERE category = 'global_politics' 
        AND DATE(created_at) = ${today}
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    let row;
    let isToday = true;
    
    if (todayResult.length > 0) {
      row = todayResult[0];
    } else {
      // 查询最近的一条记录
      console.log(`未找到 ${today} 的环球时政简报，查询最近一条...`);
      const recentResult = await sql`
        SELECT id, title, summary, category, created_at 
        FROM news 
        WHERE category = 'global_politics' 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      if (recentResult.length > 0) {
        row = recentResult[0];
        isToday = false;
      } else {
        console.log('数据库中没有找到环球时政简报记录。');
        return;
      }
    }
    
    // 清理和格式化内容
    let content = row.summary || '';
    
    // 去掉多余的标点符号
    content = content
      .replace(/\*\*/g, '')        // 去掉 **
      .replace(/\*/g, '')          // 去掉 *
      .replace(/---/g, '')         // 去掉 ---
      .replace(/--/g, '')          // 去掉 --
      .replace(/\/\/\//g, '')      // 去掉 ///
      .replace(/\/\//g, '')        // 去掉 //
      .replace(/#{1,6}/g, '')      // 去掉 # ## ### 等
      .replace(/\[.*?\]/g, '')     // 去掉 [链接描述]
      .replace(/\(.*?\)/g, '')     // 去掉 (括号内容)
      .replace(/\s+/g, ' ')        // 合并多个空格
      .trim();
    
    // 限制在1000字以内
    if (content.length > 1000) {
      content = content.substring(0, 1000) + '...';
    }
    
    // 格式化日期时间
    const createdAt = new Date(row.created_at);
    const beijingTime = createdAt.toLocaleString('zh-CN', { 
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    
    const dateStr = isToday ? today : createdAt.toISOString().split('T')[0];
    const datePrefix = isToday ? `📰 环球时政简报 ${dateStr}` : `📰 环球时政简报（最近更新：${dateStr}）`;
    
    const output = `${datePrefix}\n\n${row.title}\n\n${content}\n\n来源：上市公司要闻汇总系统\n时间：${beijingTime}`;
    
    console.log(output);
    
  } catch (error) {
    console.error('数据库查询错误:', error.message);
  }
}

// 执行查询
queryTodayGlobalPolitics();