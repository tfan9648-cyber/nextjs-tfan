import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// 配置文件路径
const configPath = path.join(process.cwd(), 'data', 'config.json');

export async function GET() {
  try {
    if (!fs.existsSync(configPath)) {
      // 如果配置文件不存在，返回默认配置
      const defaultConfig = {
        lastUpdate: new Date().toISOString(),
        totalNews: 0,
        systemStatus: "running",
        nextAutoUpdate: new Date(new Date().getTime() + 24 * 60 * 60 * 1000).toISOString(),
        version: "2.0",
        supportedCompanies: [
          "腾讯控股", "阿里巴巴", "美团点评", "京东集团", "小米集团",
          "贵州茅台", "宁德时代", "比亚迪", "中国平安", "招商银行"
        ],
        defaultKeywords: [
          "人工智能发展趋势",
          "云计算市场分析", 
          "电商行业竞争",
          "新能源汽车政策",
          "数字货币监管"
        ]
      };
      
      // 确保目录存在并创建默认配置
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      
      return NextResponse.json(defaultConfig);
    }
    
    const configData = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configData);
    
    return NextResponse.json(config);
  } catch (error) {
    console.error('读取配置文件出错:', error);
    return NextResponse.json(
      { error: '读取配置文件失败', details: (error as Error).message },
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
    
    // 读取现有配置
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8');
      existingConfig = JSON.parse(configData);
    }
    
    // 合并配置，保留不冲突的字段
    const updatedConfig = {
      ...existingConfig,
      ...data,
      lastUpdate: new Date().toISOString(),
      version: "2.0"
    };
    
    // 确保data目录存在
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    
    // 写入配置文件
    fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');
    
    console.log(`✅ 配置文件已更新: ${data.supportedCompanies?.length || 0} 家公司`);
    return NextResponse.json({ 
      success: true, 
      message: '配置更新成功',
      updatedAt: new Date().toISOString()
    });
  } catch (error) {
    console.error('更新配置文件出错:', error);
    return NextResponse.json(
      { error: '更新配置文件失败', details: (error as Error).message },
      { status: 500 }
    );
  }
}