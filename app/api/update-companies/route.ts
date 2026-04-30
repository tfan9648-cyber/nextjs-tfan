import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 配置文件路径
const configPath = path.join(process.cwd(), 'data', 'config.json');

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
    
    // 验证公司名称
    const validCompanies = companies.filter(c => {
      return typeof c === 'string' && c.trim().length > 0;
    }).map(c => c.trim());
    
    if (validCompanies.length === 0) {
      return NextResponse.json(
        { error: '没有有效的公司名称' },
        { status: 400 }
      );
    }
    
    // 读取现有配置
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      existingConfig = JSON.parse(configData);
    } else {
      // 如果配置文件不存在，创建基础配置
      existingConfig = {
        lastUpdate: new Date().toISOString(),
        totalNews: 0,
        systemStatus: "running",
        nextAutoUpdate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString(),
        version: "2.0",
        defaultKeywords: [
          "人工智能发展趋势",
          "云计算市场分析", 
          "电商行业竞争",
          "新能源汽车政策",
          "数字货币监管"
        ]
      };
    }
    
    // 更新公司列表
    const updatedConfig = {
      ...existingConfig,
      supportedCompanies: validCompanies,
      lastUpdate: new Date().toISOString()
    };
    
    // 确保data目录存在
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    
    // 写入配置文件
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
    
    console.log(`✅ 公司列表已更新: ${validCompanies.length} 家公司: ${validCompanies.slice(0, 3).join(', ')}${validCompanies.length > 3 ? '...' : ''}`);
    
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
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({
        success: false,
        message: '配置文件不存在',
        companies: []
      });
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    return NextResponse.json({
      success: true,
      companies: config.supportedCompanies || [],
      companyCount: config.supportedCompanies?.length || 0,
      lastUpdate: config.lastUpdate
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