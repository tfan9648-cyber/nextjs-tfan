import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const newsDir = path.join(process.cwd(), 'data', 'news');

function ensureDir() {
  if (!fs.existsSync(newsDir)) {
    fs.mkdirSync(newsDir, { recursive: true });
  }
}

function getAllNewsFiles(): string[] {
  ensureDir();
  return fs.readdirSync(newsDir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .reverse();
}

function loadNewsFromFile(filepath: string): any[] {
  try {
    const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
    if (Array.isArray(data)) return data;
    if (data.news && Array.isArray(data.news)) return data.news;
    return [];
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    ensureDir();
    const { searchParams } = new URL(request.url);
    const company = searchParams.get('company');
    const dateFilter = searchParams.get('date'); // 'last3days' | 'all' | specific date
    const category = searchParams.get('category'); // 'company_news' | 'keyword_analysis' | 'data_info' | 'investment_report'

    // Also load legacy data files from parent data/ dir
    const parentDataDir = path.join(process.cwd(), 'data');
    
    let allNews: any[] = [];

    // Load from data/news/ directory
    const newsFiles = getAllNewsFiles();
    for (const file of newsFiles) {
      const items = loadNewsFromFile(path.join(newsDir, file));
      allNews.push(...items);
    }

    // Also load from legacy data/*.json files (news_YYYYMMDD.json format)
    if (fs.existsSync(parentDataDir)) {
      const legacyFiles = fs.readdirSync(parentDataDir)
        .filter(f => f.startsWith('news_') && f.endsWith('.json') && f !== 'news_latest.json')
        .sort()
        .reverse();
      for (const file of legacyFiles) {
        const items = loadNewsFromFile(path.join(parentDataDir, file));
        allNews.push(...items);
      }
    }

    // Deduplicate by id
    const seen = new Set<string>();
    allNews = allNews.filter(item => {
      const id = item.id || `${item.date}-${item.title}`;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

    // Filter by date
    if (dateFilter && dateFilter !== 'all') {
      if (dateFilter === 'last3days') {
        const days: string[] = [];
        for (let i = 0; i < 3; i++) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push(d.toISOString().split('T')[0]);
        }
        allNews = allNews.filter(item => days.includes(item.date));
      } else {
        // Specific date
        allNews = allNews.filter(item => item.date === dateFilter);
      }
    }

    // Filter by company
    if (company && company !== 'all') {
      allNews = allNews.filter(item => item.company === company);
    }

    // Filter by category
    if (category) {
      allNews = allNews.filter(item => item.category === category);
    }

    // Sort by date desc
    allNews.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    return NextResponse.json({ news: allNews, total: allNews.length });
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
    
    ensureDir();
    const files = getAllNewsFiles();
    let deleted = false;
    
    for (const file of files) {
      const filepath = path.join(newsDir, file);
      const items = loadNewsFromFile(filepath);
      const filtered = items.filter((item: any) => item.id !== id);
      if (filtered.length < items.length) {
        fs.writeFileSync(filepath, JSON.stringify(filtered, null, 2), 'utf8');
        deleted = true;
        break;
      }
    }
    
    if (!deleted) {
      const parentDataDir = path.join(process.cwd(), 'data');
      if (fs.existsSync(parentDataDir)) {
        const legacyFiles = fs.readdirSync(parentDataDir)
          .filter(f => f.startsWith('news_') && f.endsWith('.json') && f !== 'news_latest.json');
        for (const file of legacyFiles) {
          const filepath = path.join(parentDataDir, file);
          const items = loadNewsFromFile(filepath);
          const filtered = items.filter((item: any) => item.id !== id);
          if (filtered.length < items.length) {
            fs.writeFileSync(filepath, JSON.stringify(filtered, null, 2), 'utf8');
            deleted = true;
            break;
          }
        }
      }
    }
    
    return NextResponse.json({ success: deleted });
  } catch (error) {
    console.error('Error deleting news:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    ensureDir();
    const body = await request.json();
    const items: any[] = Array.isArray(body) ? body : [body];

    const today = new Date().toISOString().split('T')[0];
    const filename = `${today}.json`;
    const filepath = path.join(newsDir, filename);

    // Load existing
    let existing: any[] = [];
    if (fs.existsSync(filepath)) {
      existing = loadNewsFromFile(filepath);
    }

    // Add new items with IDs
    for (const item of items) {
      if (!item.id) {
        item.id = `${item.category || 'news'}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      if (!item.date) item.date = today;
      if (!item.timestamp) item.timestamp = Date.now();
      existing.push(item);
    }

    fs.writeFileSync(filepath, JSON.stringify(existing, null, 2), 'utf8');

    return NextResponse.json({ success: true, count: items.length });
  } catch (error) {
    console.error('Error saving news:', error);
    return NextResponse.json({ error: 'Failed to save news' }, { status: 500 });
  }
}
