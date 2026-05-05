#!/usr/bin/env node

/**
 * 智能标题生成器 - 从内容中提取关键词生成标题
 */

const DEEPSEEK_BASE_URL = 'https://api.siliconflow.cn/v1';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || 'sk-dqfikfcztvkxgznyjzwblbwalfbnpgbrroqgrkvyigmlodzl';
const DEEPSEEK_MODEL = 'deepseek-ai/DeepSeek-V3.2';

async function generateSmartTitle(company, summary, today = '2026-05-04') {
  if (!summary || summary.trim().length < 50) {
    // 内容太少，无法提取关键词，用默认标题
    return `【${today}】${company}重要动态`;
  }

  try {
    // 限制summary长度，避免token过多
    const limitedSummary = summary.length > 1000 ? summary.substring(0, 1000) + '...' : summary;
    
    const prompt = `作为财经新闻标题专家，请为以下${company}的新闻摘要生成一个简洁、吸引人的标题副标题部分。

新闻内容：
${limitedSummary}

任务要求：
1. 提取核心事件或关键数据（如：一季度净利润145亿元、行长因年龄辞任、AI算力涨价34%、签订合作协议、分红方案等）
2. 生成6-10个字的短语，作为标题后缀
3. 必须是中文，简洁有力，适合网页新闻标题
4. 不要包括公司名称和日期

标题后缀（6-10字）：`;

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`
      },
      body: JSON.stringify({
        model: DEEPSEEK_MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        max_tokens: 30
      })
    });

    if (!response.ok) {
      console.warn(`⚠️  API提取关键词失败: ${response.status}, 使用默认标题`);
      return `【${today}】${company}重要动态`;
    }

    const data = await response.json();
    let keywords = data.choices[0].message.content.trim();
    
    // 清理关键词
    keywords = keywords
      .replace(/(^["']|["']$)/g, '')  // 去除首尾引号
      .replace(/[\r\n]/g, ' ')         // 去除换行
      .replace(/\s+/g, ' ')            // 合并多个空格
      .trim();
    
    // 如果提取失败、太短或太长，用默认
    if (!keywords || keywords.length < 2 || keywords.length > 15) {
      return `【${today}】${company}重要动态`;
    }
    
    // 确保关键词以有意义的方式连接
    // 如果第一个字符已经是标点或空格，去掉
    keywords = keywords.replace(/^[，。！？、；：,.!?;:\s]+/, '');
    
    // 组合最终标题
    return `【${today}】${company}${keywords}`;
    
  } catch (error) {
    console.warn(`⚠️  关键词提取异常: ${error.message}, 使用默认标题`);
    return `【${today}】${company}重要动态`;
  }
}

// 测试函数
async function testSmartTitles() {
  const today = '2026-05-04';
  const testData = [
    {
      company: '中国平安',
      summary: '平安银行于2026年4月24日至25日期间披露了2026年第一季度报告。报告显示，公司当期实现营业总收入352.77亿元，同比增长4.7%；归属于上市公司股东的净利润为145.23亿元，同比增长3.0%。尽管营收与净利润保持同比增长，但公司经营活动产生的现金流量净额为378.02亿元，较去年同期大幅减少1251.44亿元，同比下降幅度达76.80%，现金流状况出现显著波动。'
    },
    {
      company: '招商银行',
      summary: '招商银行于2026年4月30日发布公告，宣布执行董事、行长王良因年龄原因辞去所有相关职务，辞任自当日起生效。王良辞去的具体职务包括执行董事、董事会战略与可持续发展委员会委员、董事会提名委员会委员、行长及授权代表等。公告中明确，王良确认其与董事会之间并无不同意见。董事会对王良在任期间的贡献予以高度评价，并授予其"招商银行终身荣誉行员"称号。此次人事变动是招商银行高层管理团队的一次重要调整。'
    },
    {
      company: '阿里巴巴',
      summary: '阿里云官网发布公告，因全球AI需求爆发、供应链涨价，阿里云AI算力、存储等产品最高涨价34%。此次调价与百度智能云近期宣布的AI算力产品涨价（上调约5%30%）几乎同步发生，市场分析认为这释放了由AI驱动的算力紧缺信号，国内云计算产业链的价格拐点可能已确立。'
    },
    {
      company: '腾讯控股',
      summary: '腾讯控股在游戏业务领域有两项重要动态。1. 与中国儒意签订游戏合作框架协议。腾讯代表公司（代表腾讯控股有限公司及其相关实体）于2026年4月7日与中国儒意签订《二零二六年游戏合作框架协议》。协议有效期自先决条件达成之日起至2028年12月31日止。合作内容涵盖发行合作、共同运营合作、营销服务及独家代理四类模式。协议项下拟筹备12款合作产品，预计于202...'
    }
  ];

  console.log('🤖 智能标题生成测试\n');
  console.log('旧格式（方案1）:');
  testData.forEach(item => {
    console.log(`   【${today}】${item.company}重要动态`);
  });
  
  console.log('\n新格式（方案2-智能模式）:');
  
  for (const item of testData) {
    const smartTitle = await generateSmartTitle(item.company, item.summary, today);
    console.log(`   ${smartTitle}`);
    // 添加延迟避免API限速
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log('\n🎯 对比点评：');
  console.log('   ✅ 智能模式一眼能看出内容');
  console.log('   ✅ 从摘要中自动提取关键词');
  console.log('   ✅ 更有信息量，更有价值');
  console.log('\n💡 注意：每家公司标题生成需要额外API调用');
  console.log('     但效果显著提升，值得投入！');
}

// 运行测试
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

if (import.meta.url === `file://${process.argv[1]}`) {
  testSmartTitles().catch(console.error);
}

export { generateSmartTitle };