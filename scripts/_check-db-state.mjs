#!/usr/bin/env node
import { neon } from '@neondatabase/serverless';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const envContent = readFileSync(join(__dirname, '..', '.env'), 'utf-8');
envContent.split('\n').forEach(line => {
  const [key, ...vals] = line.split('=');
  if (key && !key.startsWith('#')) process.env[key.trim()] = vals.join('=').trim();
});

const sql = neon(process.env.DATABASE_URL);
const today = new Date().toISOString().split('T')[0];
console.log('today =', today);
const rows = await sql`SELECT date, company, title, length(summary) AS s_len, length(summary_short) AS ss_len, sources FROM news WHERE date = ${today} ORDER BY company`;
console.log('Today rows:', rows.length);
for (const r of rows) {
  let pubs = [];
  try {
    const arr = typeof r.sources === 'string' ? JSON.parse(r.sources) : r.sources;
    pubs = (arr || []).map(s => s.publishTime).slice(0, 3);
  } catch {}
  console.log(`  [${r.company}] ss_len=${r.ss_len} title="${r.title}" pubs=${JSON.stringify(pubs)}`);
}
const recent = await sql`SELECT date, count(*) FROM news GROUP BY date ORDER BY date DESC LIMIT 7`;
console.log('Recent dates:', recent);
