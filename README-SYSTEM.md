# 上市公司新闻监控系统 v2.0

专业的企业新闻监控与分析平台，自动收集、整理和分析上市公司最新动态。

## 🚀 系统功能

### 核心功能
- **三栏专业布局**：上市公司列表 + 最新要闻 + 关键词分析
- **自动数据抓取**：每天8点自动抓取上市公司新闻
- **关键词智能搜索**：输入关键词生成分析报告
- **实时数据更新**：手动/自动两种更新模式
- **响应式设计**：适配桌面和移动设备

### 数据源
- 新浪财经
- 东方财富
- 证券时报网
- 谷歌搜索（关键词分析）

## 🏗️ 系统架构

```
绿联Ubuntu虚拟机 (24小时开机)
├── Next.js前端 (端口3002)
├── Python爬虫脚本 (定时运行)
├── 数据存储 (JSON文件)
└── 定时任务系统 (Cron)
```

## 📦 快速开始

### 1. 启动系统
```bash
cd /home/tfan/projects/nextjs-tfan
./manage-system.sh
```

选择 **选项8 (一键完整启动)** 进行全自动部署。

### 2. 访问系统
打开浏览器访问：http://localhost:3002

### 3. 日常管理
```bash
# 查看系统状态
./manage-system.sh

# 选择相应选项进行管理
```

## 🔧 技术组件

### 前端 (Next.js 14)
- React 18 + TypeScript
- Tailwind CSS
- Lucide React图标
- 完整的三栏交互界面

### 后端/爬虫 (Python 3)
- 多数据源爬取
- 数据清洗与格式化
- JSON数据存储
- 定时自动化

## ⏰ 自动化流程

### 每日工作流
1. **08:00** - 自动运行爬虫，抓取最新新闻
2. **全天** - Web界面持续可用
3. **随时** - 手动触发数据更新

### 数据流向
```
财经网站 → Python爬虫 → JSON数据文件 → Next.js前端 → 用户浏览器
```

## 📁 目录结构

```
nextjs-tfan/
├── app/                    # Next.js前端
│   ├── page.tsx           # 主界面
│   ├── api/news/          # 数据API
│   └── globals.css        # 样式文件
├── scripts/               # Python爬虫
│   ├── stock_crawler.py   # 主爬虫脚本
│   ├── run_crawler.sh     # 启动脚本
│   ├── setup_cron.sh      # 定时任务设置
│   └── requirements.txt   # Python依赖
├── data/                  # 数据存储
│   ├── config.json        # 系统配置
│   ├── news_latest.json   # 最新新闻
│   └── news_YYYYMMDD.json # 历史数据
├── manage-system.sh       # 管理脚本
└── package.json          # Node.js依赖
```

## 🛠️ 管理命令

### 常用操作
```bash
# 启动Web界面
./manage-system.sh  # 选择1

# 立即抓取数据
./manage-system.sh  # 选择2

# 设置定时任务
./manage-system.sh  # 选择3

# 查看系统状态
./manage-system.sh  # 选择4
```

### 服务控制
```bash
# 启动所有服务
./manage-system.sh 8

# 停止所有服务
./manage-system.sh 7

# 查看日志
./manage-system.sh 6
```

## 🔒 系统安全

### 数据安全
- 仅从公开网站抓取数据
- 不存储敏感信息
- 数据文件本地存储

### 访问控制
- 本地访问 only (localhost)
- 无用户认证系统
- 简单的文件权限控制

## 🔄 维护与更新

### 日常维护
1. 检查系统状态：`./manage-system.sh 4`
2. 查看日志：`./manage-system.sh 6`
3. 手动更新数据：`./manage-system.sh 2`

### 故障排除
```bash
# 如果Web界面无法访问
./manage-system.sh 7  # 停止所有服务
./manage-system.sh 8  # 重新启动

# 如果数据抓取失败
cd scripts/
./run_crawler.sh      # 查看详细错误
```

## 📊 数据格式

### 新闻数据格式
```json
{
  "metadata": {
    "generated_at": "2026-04-16T14:00:00",
    "date": "2026-04-16",
    "total_news": 6,
    "companies_covered": 5
  },
  "news": [
    {
      "id": "news-1",
      "date": "2026-04-16",
      "company": "腾讯控股",
      "title": "【2026-04-16】腾讯控股：AI大模型在游戏场景的突破性应用",
      "summary": "腾讯发布新一代游戏AI引擎...",
      "content": "完整内容...",
      "sources": ["https://finance.sina.com.cn/..."]
    }
  ]
}
```

## 🤝 技术支持

系统开发：小龙助手 🐉 (OpenClaw AI Assistant)
开发时间：2026年4月
最后更新：2026-04-16

## 📝 注意事项

1. **虚拟机需保持运行**：系统依赖Ubuntu虚拟机持续运行
2. **网络连接**：数据抓取需要互联网连接
3. **存储空间**：定期清理旧日志文件
4. **端口冲突**：如果3002端口被占用，会自动使用3003

## 🎯 未来增强

- [ ] 更多数据源集成
- [ ] 邮件通知功能
- [ ] 移动端App
- [ ] 数据分析报告
- [ ] 价格走势图表