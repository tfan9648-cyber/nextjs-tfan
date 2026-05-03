import { NextRequest, NextResponse } from 'next/server';
import { getDb, initDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('x-api-key');
    const secretKey = process.env.API_SECRET_KEY;
    if (!secretKey || apiKey !== secretKey) {
      return NextResponse.json({ error: '未授权访问' }, { status: 401 });
    }

    const { companies } = await request.json();
    
    if (!Array.isArray(companies)) {
      return NextResponse.json(
        { error: 'companies参数必须是数组' },
        { status: 400 }
      );
    }
    
    const validCompanies = companies.filter((c: unknown) => {
      return typeof c === 'string' && c.trim().length > 0;
    }).map((c: string) => c.trim());
    
    if (validCompanies.length === 0) {
      return NextResponse.json(
        { error: '没有有效的公司名称' },
        { status: 400 }
      );
    }
    
    const sql = getDb();
    await initDb();
    
    // 用数据库存公司列表（config表，key-value形式）
    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    
    await sql`
      INSERT INTO config (key, value, updated_at)
      VALUES ('supported_companies', ${JSON.stringify(validCompanies)}::jsonb, NOW())
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
    `;
    
    console.log(`✅ 公司列表已更新: ${validCompanies.length} 家公司`);
    
    return NextResponse.json({ 
      success: true, 
      message: '公司列表更新成功',
      companyCount: validCompanies.length,
      companies: validCompanies,
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('更新公司列表出错:', error);
    return NextResponse.json(
      { error: '更新公司列表失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const sql = getDb();
    await initDb();
    
    await sql`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `;
    
    const rows = await sql`SELECT value FROM config WHERE key = 'supported_companies'`;
    
    if (rows.length === 0) {
      // 返回默认公司列表
      const defaultCompanies = [
        '中国平安', '美的集团', '伊利股份', '招商银行', '贵州茅台',
        '泸州老窖', '腾讯控股', '阿里巴巴', '万华化学', '福耀玻璃',
        '昱能科技', '凌霄泵业', '长江电力'
      ];
      return NextResponse.json({
        success: true,
        companies: defaultCompanies,
        companyCount: defaultCompanies.length,
        lastUpdate: null
      });
    }
    
    const companies = rows[0].value;
    return NextResponse.json({
      success: true,
      companies,
      companyCount: companies.length,
      lastUpdate: null
    });
  } catch (error) {
    console.error('获取公司列表出错:', error);
    return NextResponse.json(
      { 
        success: false,
        error: '获取公司列表失败', 
        details: (error as Error).message 
      },
      { status: 500 }
    );
  }
}