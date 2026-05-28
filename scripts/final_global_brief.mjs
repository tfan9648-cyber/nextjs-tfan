import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const sql = neon(process.env.DATABASE_URL);

function cleanAndFormatContent(text) {
  if (!text) return '';
  
  // 清理Markdown格式和多余标点
  let cleaned = text
    .replace(/\*\*/g, '')
    .replace(/\*/g, '')
    .replace(/---/g, '')
    .replace(/--/g, '')
    .replace(/\/\/\//g, '')
    .replace(/\/\//g, '')
    .replace(/#{1,6}/g, '')
    .replace(/\[.*?\]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // 替换英文标点为中文标点
  cleaned = cleaned
    .replace(/,/g, '，')
    .replace(/:/g, '：')
    .replace(/!/g, '！')
    .replace(/\?/g, '？')
    .replace(/;/g, '；');
  
  // 添加分段
  cleaned = cleaned.replace(/\s*政治\/外交\s*/g, '\n\n【政治/外交】\n');
  cleaned = cleaned.replace(/\s*经济\/市场\s*/g, '\n\n【经济/市场】\n');
  cleaned = cleaned.replace(/\s*军事\/安全\s*/g, '\n\n【军事/安全】\n');
  cleaned = cleaned.replace(/\s*科技\/产业\s*/g, '\n\n【科技/产业】\n');
  
  return cleaned;
}

function limitTo1000Chars(text) {
  if (text.length <= 1000) return text;
  
  // 在接近1000字的时候找到合适的断句位置
  const maxLength = 1000;
  let truncated = text.substring(0, maxLength);
  
  // 尝试在句号、逗号或空格处断开
  const lastPeriod = truncated.lastIndexOf('。');
  const lastComma = truncated.lastIndexOf('，');
  const lastSpace = truncated.lastIndexOf(' ');
  
  if (lastPeriod > maxLength * 0.8) {
    truncated = truncated.substring(0, lastPeriod + 1);
  } else if (lastComma > maxLength * 0.8) {
    truncated = truncated.substring(0, lastComma + 1);
  } else if (lastSpace > maxLength * 0.8) {
    truncated = truncated.substring(0, lastSpace);
  }
  
  return truncated + '...';
}

async function getFinalGlobalBrief() {
  const today = '2026-05-20';
  
  try {
    // 查询今天的环球时政记录
    const result = await sql`
      SELECT id, title, content, category, created_at 
      FROM news 
      WHERE category = 'global_politics' 
        AND DATE(created_at) = ${today}
      ORDER BY created_at DESC 
      LIMIT 1
    `;
    
    if (result.length === 0) {
      // 查询最近的一条记录
      const recentResult = await sql`
        SELECT id, title, content, category, created_at 
        FROM news 
        WHERE category = 'global_politics' 
        ORDER BY created_at DESC 
        LIMIT 1
      `;
      
      if (recentResult.length === 0) {
        return '数据库中没有找到环球时政简报记录。';
      }
      
      return formatBrief(recentResult[0], false);
    }
    
    return formatBrief(result[0], true);
    
  } catch (error) {
    return `数据库查询错误: ${error.message}`;
  }
}

function formatBrief(row, isToday) {
  const dateStr = isToday ? '2026-05-20' : new Date(row.created_at).toISOString().split('T')[0];
  
  // 获取并清理内容
  let content = row.content || '';
  content = cleanAndFormatContent(content);
  content = limitTo1000Chars(content);
  
  // 计算字数
  const charCount = content.replace(/\s/g, '').length;
  
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
  
  const datePrefix = isToday ? `📰 环球时政简报 ${dateStr}` : `📰 环球时政简报（最近更新：${dateStr}）`;
  
  const output = `${datePrefix}\n\n${content}\n\n字数: ${charCount}字\n来源: 上市公司要闻汇总系统\n📅 ${beijingTime}`;
  
  return output;
}

// 执行并输出最终结果
getFinalGlobalBrief().then(result => {
  console.log(result);
  process.exit(0);
}).catch(error => {
  console.error('执行错误:', error.message);
  process.exit(1);
});