// 用 cron 配置中存的 key
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.DATABASE_URL);
console.log('key first 8:', (process.env.DEEPSEEK_API_KEY||'').slice(0,12), '... last 4:', (process.env.DEEPSEEK_API_KEY||'').slice(-4));
