#!/usr/bin/env node
/**
 * init-code-map.mjs
 * 初始化 company_code_map 表，将所有20家公司的股票代码预填入数据库
 * 包含 13 家 A 股 (AKShare) + 7 家港股 (yfinance)
 */
import { neon } from '@neondatabase/serverless';
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: join(__dirname, '..', '.env.local') });

const DATABASE_URL = process.env.DATABASE_URL || '';

// A股公司 (AKShare 数据源)
const A_SHARE_MAP = {
  "中国平安": "000001",
  "美的集团": "000333",
  "伊利股份": "600887",
  "招商银行": "600036",
  "贵州茅台": "600519",
  "泸州老窖": "000568",
  "万华化学": "600309",
  "福耀玻璃": "600660",
  "昱能科技": "688348",
  "凌霄泵业": "002884",
  "长江电力": "600900",
  "国投电力": "600886",
  "川投能源": "600674"
};

// 港股公司 (yfinance 数据源)
const HK_SHARE_MAP = {
  "腾讯控股": "0700.HK",
  "阿里巴巴": "9988.HK",
  "中国海洋石油": "0883.HK",
  "华润电力": "0836.HK",
  "申洲国际": "2313.HK",
  "金斯瑞生物科技": "1548.HK",
  "美团-W": "3690.HK"
};

async function main() {
  if (!DATABASE_URL) {
    console.error('❌ 缺少 DATABASE_URL');
    process.exit(1);
  }

  const sql = neon(DATABASE_URL);

  // 确保表存在
  await sql`CREATE TABLE IF NOT EXISTS company_code_map (
    company TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'auto',
    market TEXT NOT NULL DEFAULT 'A',
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`;

  console.log('📋 开始初始化 company_code_map 表...\n');

  let count = 0;

  // 插入 A 股
  for (const [company, symbol] of Object.entries(A_SHARE_MAP)) {
    await sql`INSERT INTO company_code_map (company, symbol, source, market, verified, updated_at)
      VALUES (${company}, ${symbol}, 'init-hardcoded', 'A', TRUE, NOW())
      ON CONFLICT (company) DO UPDATE SET symbol = ${symbol}, source = 'init-hardcoded', market = 'A', verified = TRUE, updated_at = NOW()`;
    console.log(`  ✅ ${company} -> ${symbol} (A股)`);
    count++;
  }

  // 插入港股
  for (const [company, symbol] of Object.entries(HK_SHARE_MAP)) {
    await sql`INSERT INTO company_code_map (company, symbol, source, market, verified, updated_at)
      VALUES (${company}, ${symbol}, 'init-hardcoded', 'HK', TRUE, NOW())
      ON CONFLICT (company) DO UPDATE SET symbol = ${symbol}, source = 'init-hardcoded', market = 'HK', verified = TRUE, updated_at = NOW()`;
    console.log(`  ✅ ${company} -> ${symbol} (港股)`);
    count++;
  }

  console.log(`\n🎉 初始化完成！共写入 ${count} 条记录`);

  // 验证
  const rows = await sql`SELECT company, symbol, market FROM company_code_map ORDER BY market, company`;
  console.log(`\n📊 验证 - company_code_map 共 ${rows.length} 条记录:`);
  const aShares = rows.filter(r => r.market === 'A');
  const hkShares = rows.filter(r => r.market === 'HK');
  console.log(`   A股: ${aShares.length} 家 | 港股: ${hkShares.length} 家`);
  rows.forEach(r => console.log(`   ${r.company} -> ${r.symbol} (${r.market})`));
}

main().catch(err => {
  console.error('❌ 错误:', err);
  process.exit(1);
});
