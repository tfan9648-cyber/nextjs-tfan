import { neon } from '@neondatabase/serverless';

export function getDb() {
  const sql = neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
  return sql;
}

export async function initDb() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS news (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      company TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT DEFAULT '',
      content TEXT DEFAULT '',
      sources JSONB DEFAULT '[]',
      category TEXT DEFAULT 'company_news',
      read_time TEXT DEFAULT '',
      is_keyword_search BOOLEAN DEFAULT false,
      timestamp BIGINT,
      keywords JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`CREATE INDEX IF NOT EXISTS idx_news_date ON news(date)`;
  await sql`CREATE INDEX IF NOT EXISTS idx_news_company ON news(company)`;
  return true;
}
