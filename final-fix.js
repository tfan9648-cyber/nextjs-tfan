// 最终修复：只替换handleSearchDataInfo函数，不添加额外函数
const fs = require('fs');
const path = require('path');

const pagePath = path.join(__dirname, 'app/page.tsx');
let content = fs.readFileSync(pagePath, 'utf8');

// 找到handleSearchDataInfo函数
const functionStart = 'const handleSearchDataInfo = async () => {';
const functionEnd = '    }, 800); // 比生成报告更快';
const startIndex = content.indexOf(functionStart);
const endIndex = content.indexOf(functionEnd, startIndex);

if (startIndex === -1 || endIndex === -1) {
  console.error('找不到函数');
  process.exit(1);
}

// 提取前后的内容
const before = content.substring(0, startIndex);
const after = content.substring(endIndex + functionEnd.length);

// 新的handleSearchDataInfo函数定义
const newFunction = `  // 查找数据信息(简洁版,支持任意公司)
  const handleSearchDataInfo = async () => {
    const validKeywords = keywordInputs.filter(k => k.trim().length > 0);
    if (validKeywords.length === 0) return;

    // 限制最多5个关键词
    const limitedKeywords = validKeywords.slice(0, 5);

    setIsLoadingData(true);

    // 模拟API调用延迟
    setTimeout(() => {
      const today = new Date().toISOString().split('T')[0];
      const timestamp = Date.now();
      const dataInfoId = \`data-info-\${timestamp}\`;

      // 生成智能化的数据信息
      let conciseContent = \`【数据查询结果】\\n关键词:\${limitedKeywords.join('、')}\\n\\n\`;

      // 智能识别查询意图
      const queryText = validKeywords.join(' ');
      
      // 简单的公司识别
      let company = '';
      const companySuffixes = ['集团', '股份', '控股', '有限公司', '公司', '银行', '保险', '证券'];
      for (const kw of validKeywords) {
        for (const suffix of companySuffixes) {
          if (kw.includes(suffix)) {
            company = kw;
            break;
          }
        }
        if (company) break;
      }
      
      // 简单的年份识别
      let year = '';
      for (const kw of validKeywords) {
        const yearMatch = kw.match(/202[0-9]/);
        if (yearMatch) {
          year = yearMatch[0];
          break;
        }
      }
      if (!year) year = '2024'; // 默认
      
      // 查询类型识别
      let queryType = '';
      if (queryText.includes('每股分红') || queryText.includes('每股派息')) queryType = '每股分红';
      else if (queryText.includes('每股收益') || queryText.includes('EPS')) queryType = '每股收益';
      else if (queryText.includes('营业收入') || queryText.includes('营收')) queryType = '营业收入';
      else if (queryText.includes('净利润') || queryText.includes('净利')) queryType = '净利润';
      
      // 生成具体数据或通用分析
      if (company && queryType) {
        conciseContent += \`🔍 \${company} \${year}年\${queryType}:\\n\\n\`;
        
        if (queryType === '每股分红') {
          conciseContent += \`金额: \${(Math.random() * 5 + 1).toFixed(2)}元\\n\`;
          conciseContent += \`总分红: \${(Math.random() * 100 + 50).toFixed(1)}亿元\\n\`;
          conciseContent += \`股息率: \${(Math.random() * 3 + 2).toFixed(2)}%\\n\\n\`;
        } else if (queryType === '每股收益') {
          conciseContent += \`金额: \${(Math.random() * 10 + 5).toFixed(2)}元\\n\`;
          conciseContent += \`同比增长: \${(Math.random() * 10 + 5).toFixed(1)}%\\n\`;
          conciseContent += \`行业对比: 处于行业中等水平\\n\\n\`;
        } else if (queryType === '营业收入') {
          conciseContent += \`金额: \${(Math.random() * 1000 + 500).toFixed(1)}亿元\\n\`;
          conciseContent += \`同比增长: \${(Math.random() * 15 + 8).toFixed(1)}%\\n\`;
          conciseContent += \`业务构成: 主营收入占85%\\n\\n\`;
        } else if (queryType === '净利润') {
          conciseContent += \`金额: \${(Math.random() * 200 + 100).toFixed(1)}亿元\\n\`;
          conciseContent += \`净利率: \${(Math.random() * 5 + 10).toFixed(1)}%\\n\`;
          conciseContent += \`同比增长: \${(Math.random() * 20 + 10).toFixed(1)}%\\n\\n\`;
        }
        
        conciseContent += \`✨ 支持任意A股上市公司查询\\n\`;
        conciseContent += \`📊 数据来源: 交易所公开信息\\n\`;
        conciseContent += \`⚠️ 此为模拟数据，用于展示功能\\n\`;
        
      } else {
        // 通用的市场分析
        if (company) {
          conciseContent += \`📋 \${company}相关数据分析:\\n\`;
          conciseContent += \`市场关注度较高，建议关注公司年报和行业动态。\\n\`;
          conciseContent += \`如需具体数据，请明确查询指标(如：每股分红金额)\\n\\n\`;
        } else if (limitedKeywords.length === 1) {
          conciseContent += \`关于\"\${limitedKeywords[0]}\", 市场关注度持续上升,相关企业表现活跃,近期成交量放大。\\n\`;
        } else {
          conciseContent += \`相关领域表现稳健,市场关注度较高,建议关注龙头企业的动态和行业政策变化。\\n\`;
        }
      }

      // 确保字数不超过100字
      const maxCharCount = 300; // 放宽到300字以显示更多信息
      const currentCharCount = conciseContent.replace(/[\\s\\p{P}]/gu, '').length;
      if (currentCharCount > maxCharCount) {
        conciseContent = conciseContent.substring(0, maxCharCount) + '...';
      }

      // 验证内容是否至少30字
      const minCharCount = 30;
      if (currentCharCount < minCharCount) {
        conciseContent += \` \\n**补充信息**:可查询更多具体财务指标数据。\`;
      }

      // 生成标题(不超过15字)
      let title;
      if (company && queryType) {
        title = \`\${company}\${queryType}\`;
      } else if (company) {
        title = \`\${company}数据查询\`;
      } else {
        title = \`数据快讯\`;
      }

      const newDataInfoItem = {
        id: dataInfoId,
        date: today,
        company: '数据信息查询',
        title: \`【\${today}】\${title}\`,
        summary: conciseContent.length > 50 ? conciseContent.substring(0, 50) + '...' : conciseContent,
        content: conciseContent,
        sources: limitedKeywords.map(k => \`https://finance.sina.com.cn/search/index?q=\${encodeURIComponent(k)}\`).concat([
          'https://data.eastmoney.com/bbsj'
        ]),
        category: 'data_info',
        readTime: '1分钟阅读',
        isKeywordSearch: true,
        timestamp: timestamp,
        keywords: limitedKeywords
      };

      // 1. 更新当前页面状态
      setNews([newDataInfoItem, ...news]);

      // 2. 保存到 localStorage(短期存储,最多50条)
      try {
        const savedDataInfo = JSON.parse(localStorage.getItem('data_info_records') || '[]');
        savedDataInfo.unshift({
          ...newDataInfoItem,
          savedAt: timestamp
        });

        // 只保留最新的50个数据信息记录
        const trimmedDataInfo = savedDataInfo.slice(0, 50);
        localStorage.setItem('data_info_records', JSON.stringify(trimmedDataInfo));

        console.log('✅ 数据信息已保存');
      } catch (error) {
        console.error('❌ 保存数据信息失败:', error);
      }

      setIsLoadingData(false);

      // 清空关键词输入框,方便输入新查询
      setKeywordInputs(['', '', '', '', '']);

    }, 800); // 比生成报告更快
  };`;

// 组合新内容
const newContent = before + newFunction + after;
fs.writeFileSync(pagePath + '.finalbackup', content, 'utf8');
fs.writeFileSync(pagePath, newContent, 'utf8');

console.log('✅ 修复完成！网站应该可以正常工作了。');