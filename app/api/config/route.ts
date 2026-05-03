import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';

const DEFAULT_COMPANIES = [
  "中国平安", "美的集团", "伊利股份", "招商银行", "贵州茅台",
  "泸州老窖", "腾讯控股", "阿里巴巴", "万华化学", "福耀玻璃",
  "昱能科技", "凌霄泵业", "长江电力"
];

async function ensureConfigTable() {
  const sql = getDb();
  await initDb();
  await sql`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  return sql;
}

export async function GET() {
  try {
    const sql = await ensureConfigTable();
    
    const rows = await sql`SELECT value, updated_at FROM config WHERE key = 'supported_companies'`;
    
    const companies = rows.length > 0 ? rows[0].value : DEFAULT_COMPANIES;
    const lastUpdate = rows.length > 0 ? rows[0].updated_at : null;
    
    return NextResponse.json({
      lastUpdate,
      totalNews: 0,
      systemStatus: "running",
      version: "2.0",
      supportedCompanies: companies,
      defaultKeywords: []
    });
  } catch (error) {
    console.error('读取配置出错:', error);
    return NextResponse.json(
      { error: '读取配置失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const secretKey = process.env.API_SECRET_KEY;
    if (!secretKey || apiKey !== secretKey) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const data = await request.json();
    const sql = await ensureConfigTable();
    
    if (data.supportedCompanies) {
      await sql`
        INSERT INTO config (key, value, updated_at)
        VALUES ('supported_companies', ${JSON.stringify(data.supportedCompanies)}::jsonb, NOW())
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
      `;
    }
    
    console.log(`✅ 配置已更新`);
    return NextResponse.json({ 
      success: true, 
      message: '配置更新成功',
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('更新配置出错:', error);
    return NextResponse.json(
      { error: '更新配置失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}
