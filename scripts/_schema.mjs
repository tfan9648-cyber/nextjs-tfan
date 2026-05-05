import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
const env = readFileSync('.env','utf-8');
env.split('\n').forEach(l => { const [k,...v]=l.split('='); if(k && !k.startsWith('#')) process.env[k.trim()]=v.join('=').trim();});
const sql = neon(process.env.DATABASE_URL);
const cols = await sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='news' ORDER BY ordinal_position`;
console.log(cols);
