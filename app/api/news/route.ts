import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';

function rowToNews(row: any) {
  return {
    id: row.id,
    date: row.date,
    company: row.company,
    title: row.title,
    summary: row.summary || '',
    content: row.content || '',
    sources: row.sources || [],
    category: row.category || 'company_news',
    readTime: row.read_time || '',
    isKeywordSearch: row.is_keyword_search || false,
    timestamp: row.timestamp ? Number(row.timestamp) : 0,
    keywords: row.keywords || [],
  };
}

export async function GET(request: NextRequest) {
  try {
    const sql = getDb();
    await initDb();

    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company');
    const dateFilter = searchParams.get('date');
    const category = searchParams.get('category');

    let rows: any[];

    if (dateFilter === 'last3days') {
      const days: string[] = [];
      for (let i = 0; i < 3; i++) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push(d.toISOString().split('T')[0]);
      }
      if (company && company !== 'all') {
        if (category) {
          rows = await sql`SELECT * FROM news WHERE date = ANY(${days}) AND company = ${company} AND category = ${category} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        } else {
          rows = await sql`SELECT * FROM news WHERE date = ANY(${days}) AND company = ${company} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        }
      } else {
        if (category) {
          rows = await sql`SELECT * FROM news WHERE date = ANY(${days}) AND category = ${category} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        } else {
          rows = await sql`SELECT * FROM news WHERE date = ANY(${days}) ORDER BY date DESC, timestamp DESC LIMIT 200`;
        }
      }
    } else if (dateFilter && dateFilter !== 'all') {
      if (company && company !== 'all') {
        if (category) {
          rows = await sql`SELECT * FROM news WHERE date = ${dateFilter} AND company = ${company} AND category = ${category} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        } else {
          rows = await sql`SELECT * FROM news WHERE date = ${dateFilter} AND company = ${company} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        }
      } else {
        if (category) {
          rows = await sql`SELECT * FROM news WHERE date = ${dateFilter} AND category = ${category} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        } else {
          rows = await sql`SELECT * FROM news WHERE date = ${dateFilter} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        }
      }
    } else {
      if (company && company !== 'all') {
        if (category) {
          rows = await sql`SELECT * FROM news WHERE company = ${company} AND category = ${category} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        } else {
          rows = await sql`SELECT * FROM news WHERE company = ${company} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        }
      } else {
        if (category) {
          rows = await sql`SELECT * FROM news WHERE category = ${category} ORDER BY date DESC, timestamp DESC LIMIT 200`;
        } else {
          rows = await sql`SELECT * FROM news ORDER BY date DESC, timestamp DESC LIMIT 200`;
        }
      }
    }

    const news = rows.map(rowToNews);
    return NextResponse.json({ news, total: news.length });
  } catch (error) {
    console.error('Error loading news:', error);
    return NextResponse.json({ error: 'Failed to load news' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const sql = getDb();
    await initDb();
    const result = await sql`DELETE FROM news WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting news:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const sql = getDb();
    await initDb();

    const body = await request.json();
    const items: any[] = Array.isArray(body) ? body : [body];
    const today = new Date().toISOString().split('T')[0];

    for (const item of items) {
      if (!item.id) {
        item.id = `${item.category || 'news'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      if (!item.date) item.date = today;
      if (!item.timestamp) item.timestamp = Date.now();

      await sql`
        INSERT INTO news (id, date, company, title, summary, content, sources, category, read_time, is_keyword_search, timestamp, keywords)
        VALUES (${item.id}, ${item.date}, ${item.company || ''}, ${item.title || ''}, ${item.summary || ''}, ${item.content || ''}, ${JSON.stringify(item.sources || [])}, ${item.category || 'company_news'}, ${item.readTime || ''}, ${item.isKeywordSearch || false}, ${item.timestamp}, ${JSON.stringify(item.keywords || [])})
        ON CONFLICT (id) DO UPDATE SET
          content = EXCLUDED.content,
          summary = EXCLUDED.summary,
          sources = EXCLUDED.sources
      `;
    }

    return NextResponse.json({ success: true, count: items.length });
  } catch (error) {
    console.error('Error saving news:', error);
    return NextResponse.json({ error: 'Failed to save news' }, { status: 500 });
  }
}
