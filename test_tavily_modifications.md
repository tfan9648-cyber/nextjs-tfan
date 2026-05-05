# 修改验证报告

## 已完成的修改

### 1. `/home/tfan/projects/nextjs-tfan/lib/tavily.ts`
- ✅ 修改了 `searchFinanceNews` 函数：搜索深度从 `basic` 改为 `advanced`，添加了 `includeRawContent: true`，指定了中文财经域名
- ✅ 新增了 `searchFinanceData` 函数：专门为财务数据查询场景优化，自动增强财务关键词，包含原始内容
- ✅ 修改了 `formatSearchContext` 函数：现在包含原始内容的截取（前2000字符）

### 2. `/home/tfan/projects/nextjs-tfan/app/api/search-data/route.ts`
- ✅ 导入改为 `searchFinanceData` 函数
- ✅ system prompt 完善：明确要求提取具体财务指标（营收、净利润、EPS、ROE等）
- ✅ user prompt 完善：要求提取具体数字、使用表格格式、标注报告期和来源
- ✅ max_tokens 从2000增加到4000，提供更多输出空间
- ✅ Tavily 无结果时的提示优化，推荐具体的数据源网站

## 核心改进
1. **搜索深度**：`basic` → `advanced`（获取更全面的结果）
2. **原始内容**：`includeRawContent: true`（获取页面完整内容，可能包含财务数据表格）
3. **域名限制**：限制在中文财经网站（东方财富、新浪财经、巨潮资讯等）
4. **关键词优化**：检测财务关键词并增强搜索query
5. **AI提示优化**：明确要求提取具体数字，而不是模糊描述

## 预期效果
当用户搜索"美的集团 2026年一季报 每股收益"时：
1. Tavily 会在指定的中文财经网站深度搜索，获取包含原始内容的结果
2. 搜索结果会包含相关的财务数据页面
3. DeepSeek 会专门从原始内容中提取具体的财务数字
4. 返回的结果会以表格或列表形式展示具体数据

## 重要提醒
- `rawContent` 可能很大，我们只截取前2000字符以避免超出上下文限制
- 测试时需确保 `REPLICATE_API_KEY` 环境变量正确配置
- 财经网站可能有反爬虫机制，Tavily 的 `advanced` 搜索能更好地处理这个问题