import { neon } from '@neondatabase/serverless';
import { config } from 'dotenv';
config({ path: '.env.local' });
const sql = neon(process.env.DATABASE_URL);
const rows = await sql`SELECT id, filename, text_extracted, length(extracted_text) as text_len, size_bytes, mime_type FROM reader_files ORDER BY id DESC LIMIT 8`;
console.table(rows);
