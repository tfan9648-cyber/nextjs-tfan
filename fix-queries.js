// 简单的查询解析和财务数据生成器
class FinancialDataQuery {
  static extractCompanyName(query) {
    // 使用正则表达式匹配公司名称
    const patterns = [
      /([\u4e00-\u9fff]{2,10})(集团|股份|控股|科技|有限|实业|公司)/,
      /([\u4e00-\u9fff]{2,8})[\s,，、]/,
      /(\S+)(\s|,|，|、)/
    ];
    
    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        // 过滤掉常见的非公司关键词
        const candidate = match[1].trim();
        const excluded = ['查询', '搜索', '查找', '每股', '分红', '收益', '营收', '利润', '金额', '数据'];
        
        if (!excluded.some(word => candidate.includes(word)) && candidate.length >= 2) {
          return candidate;
        }
      }
    }
    
    return '';
  }

  static extractYear(query) {
    const yearMatch = query.match(/(202[0-9]|20[0-9]{2})/);
    if (yearMatch) return yearMatch[1];
    
    // 处理相对年份
    const now = new Date();
    const currentYear = now.getFullYear();
    
    if (query.includes('去年') || query.includes('上一年') || query.includes('previous year')) {
      return (currentYear - 1).toString();
    }
    if (query.includes('今年') || query.includes('本年') || query.includes('this year')) {
      return currentYear.toString();
    }
    if (query.includes('明年') || query.includes('下一年') || query.includes('next year')) {
      return (currentYear + 1).toString();
    }
    
    return '';
  }

  static extractQueryType(query) {
    const typeMap = {
      '每股分红': 'dividend_per_share',
      '每股派息': 'dividend_per_share', 
      '分红金额': 'dividend',
      '派息金额': 'dividend',
      '股息': 'dividend',
      '每股收益': 'earnings_per_share',
      'EPS': 'earnings_per_share',
      '营业收入': 'revenue',
      '收入': 'revenue',
      '净利润': 'net_profit',
      '净利': 'net_profit',
      '利润': 'net_profit',
      '市值': 'market_cap',
      '股价': 'stock_price',
      '市盈率': 'pe_ratio',
      '市净率': 'pb_ratio'
    };

    query = query.toLowerCase();
    for (const [chinese, type] of Object.entries(typeMap)) {
      if (query.includes(chinese.toLowerCase())) {
        return type;
      }
    }
    
    return 'general';
  }

  static generateResponse(company, year, queryType, keywords) {
    if (!company) {
      return `🔍 请提供要查询的公司名称\n\n查询建议:\n• 格式: 公司名称 + 年份 + 查询指标\n• 示例: "贵州茅台2024年每股分红金额"\n• 示例: "中国平安2023年净利润"`;
    }
    
    if (!year) {
      return `📊 ${company}查询\n\n缺少年份信息，请指定年份:\n• 示例: "${company}2024年每股分红"\n• 或: "${company}去年净利润"\n• 或: "${company}今年营业收入"`;
    }
    
    const responses = {
      dividend_per_share: {
        title: `💰 ${company} ${year}年每股分红数据`,
        content: `• 每股分红金额: ${(Math.random() * 5 + 1).toFixed(2)}元\n` +
                 `• 分红总额: ${(Math.random() * 100 + 50).toFixed(1)}亿元\n` +
                 `• 股息率: ${(Math.random() * 3 + 2).toFixed(2)}%\n` +
                 `• 分红政策: 重视股东回报，分红比例保持稳定\n` +
                 `• 数据来源: 公司${year}年年度报告\n`
      },
      earnings_per_share: {
        title: `📈 ${company} ${year}年每股收益`,
        content: `• 每股收益(EPS): ${(Math.random() * 10 + 5).toFixed(2)}元\n` +
                 `• 同比增长: ${(Math.random() * 10 + 5).toFixed(1)}%\n` +
                 `• ROE(净资产收益率): ${(Math.random() * 10 + 15).toFixed(1)}%\n` +
                 `• 盈利能力: 处于行业${Math.random() > 0.5 ? '较高' : '中等'}水平\n`
      },
      revenue: {
        title: `🏢 ${company} ${year}年经营数据`,
        content: `• 营业收入: ${(Math.random() * 1000 + 500).toFixed(1)}亿元\n` +
                 `• 同比增长: ${(Math.random() * 15 + 8).toFixed(1)}%\n` +
                 `• 主营业务占比: ${(Math.random() * 20 + 70).toFixed(0)}%\n` +
                 `• 行业排名: 上市行业第${Math.floor(Math.random() * 10 + 1)}名\n`
      },
      net_profit: {
        title: `💵 ${company} ${year}年利润数据`,
        content: `• 净利润: ${(Math.random() * 200 + 100).toFixed(1)}亿元\n` +
                 `• 同比增长: ${(Math.random() * 20 + 10).toFixed(1)}%\n` +
                 `• 净利率: ${(Math.random() * 5 + 10).toFixed(1)}%\n` +
                 `• 经营效率: 成本控制良好，利润率提升\n`
      },
      market_cap: {
        title: `📊 ${company} 市值数据`,
        content: `• 总市值: ${(Math.random() * 5000 + 1000).toFixed(0)}亿元\n` +
                 `• 流通市值: ${(Math.random() * 3000 + 500).toFixed(0)}亿元\n` +
                 `• 同行业对比: 排名${Math.floor(Math.random() * 5 + 1)}\n` +
                 `• 市场表现: ${Math.random() > 0.5 ? '稳健' : '波动'}\n`
      },
      stock_price: {
        title: `📉 ${company} 股价信息`,
        content: `• 当前股价: ${(Math.random() * 100 + 50).toFixed(2)}元\n` +
                 `• 52周高点: ${(Math.random() * 120 + 70).toFixed(2)}元\n` +
                 `• 52周低点: ${(Math.random() * 40 + 20).toFixed(2)}元\n` +
                 `• 表现: ${Math.random() > 0.5 ? '跑赢大盘' : '与大盘同步'}\n`
      }
    };
    
    const responseData = responses[queryType] || {
      title: `📋 ${company} ${year}年财务概况`,
      content: `• 营业收入: ${(Math.random() * 1000 + 500).toFixed(1)}亿元\n` +
               `• 净利润: ${(Math.random() * 200 + 100).toFixed(1)}亿元\n` +
               `• 每股收益: ${(Math.random() * 10 + 5).toFixed(2)}元\n` +
               `• 每股净资产: ${(Math.random() * 30 + 15).toFixed(2)}元\n` +
               `• 数据更新: ${new Date().toLocaleDateString('zh-CN')}\n` +
               `\n💡 提示: 可以查询更具体的指标，如"每股分红"、"市盈率"等\n`
    };
    
    return `${responseData.title}\n\n${responseData.content}\n\n🔗 数据来源参考:\n• 公司${year}年年度报告\n• 交易所公开数据\n• 东方财富、同花顺平台\n\n⚠️ 注意: 这是模拟数据，仅供参考格式`;
  }

  static queryAnalysis(keywords) {
    const query = keywords.join(' ');
    const company = this.extractCompanyName(query);
    const year = this.extractYear(query); 
    const queryType = this.extractQueryType(query);
    
    console.log(`Query analysis:\n- Company: ${company}\n- Year: ${year}\n- Type: ${queryType}\n- Keywords: ${keywords.join(', ')}`);
    
    return this.generateResponse(company, year, queryType, keywords);
  }
}

module.exports = FinancialDataQuery;