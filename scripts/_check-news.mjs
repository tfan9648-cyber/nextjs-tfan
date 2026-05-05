import { readFileSync } from 'fs';
const env = readFileSync('/home/tfan/projects/nextjs-tfan/.env', 'utf8');
for (const line of env.split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
}
const { neon } = await import('@neondatabase/serverless');
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, date, company, title, LEFT(content, 500) as content, category, created_at FROM news WHERE category='company_news' ORDER BY created_at DESC LIMIT 13`;
for (const r of rows) {
  console.log('---');
  console.log('ID:', r.id);
  console.log('TITLE:', r.title);
  console.log('CREATED:', r.created_at);
  console.log('CONTENT:', r.content);
  console.log('COMPANY:', r.company, '| DATE:', r.date);
}
