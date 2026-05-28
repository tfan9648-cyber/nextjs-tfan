/**
 * 读书郎 - 数据库连接 & 表初始化
 * 复用项目现有 @neondatabase/serverless 连接方式
 */
import { neon } from '@neondatabase/serverless';

let readerDbInitialized = false;

export function getReaderDb() {
  return neon(process.env.DATABASE_URL || process.env.POSTGRES_URL || '');
}

/** 幂等建表 */
export async function initReaderDb() {
  if (readerDbInitialized) return true;
  const sql = getReaderDb();

  await sql`CREATE TABLE IF NOT EXISTS reader_users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reader_devices (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES reader_users(id) ON DELETE SET NULL,
    device_uuid VARCHAR(64) UNIQUE NOT NULL,
    platform VARCHAR(20) NOT NULL,
    last_seen TIMESTAMP DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reader_files (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES reader_users(id) ON DELETE SET NULL,
    device_id INTEGER REFERENCES reader_devices(id) ON DELETE CASCADE,
    filename VARCHAR(500) NOT NULL,
    r2_key VARCHAR(500),
    size_bytes BIGINT,
    mime_type VARCHAR(100),
    text_extracted BOOLEAN DEFAULT FALSE,
    extracted_text TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reader_playlist_items (
    id SERIAL PRIMARY KEY,
    device_id INTEGER REFERENCES reader_devices(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES reader_users(id) ON DELETE SET NULL,
    file_id INTEGER REFERENCES reader_files(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'unplayed',
    added_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reader_progress (
    id SERIAL PRIMARY KEY,
    file_id INTEGER REFERENCES reader_files(id) ON DELETE CASCADE,
    device_id INTEGER REFERENCES reader_devices(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES reader_users(id) ON DELETE SET NULL,
    position_char INTEGER DEFAULT 0,
    position_pct REAL DEFAULT 0,
    completed BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(file_id, device_id)
  )`;
  await sql`CREATE TABLE IF NOT EXISTS reader_verify_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(6) NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
  )`;

  readerDbInitialized = true;
  return true;
}
