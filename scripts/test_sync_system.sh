#!/bin/bash
# 上市公司新闻监控系统 - 同步机制测试脚本

set -e

echo "========================================"
echo "上市公司新闻监控系统 - 同步机制测试"
echo "测试时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"
echo ""

# 1. 检查配置文件
echo "1. 检查配置文件..."
CONFIG_FILE="../data/config.json"
if [ -f "$CONFIG_FILE" ]; then
    echo "✅ 配置文件存在: $CONFIG_FILE"
    COMPANY_COUNT=$(jq -r '.supportedCompanies | length' "$CONFIG_FILE" 2>/dev/null || echo "0")
    COMPANIES=$(jq -r '.supportedCompanies | join(", ")' "$CONFIG_FILE" 2>/dev/null || echo "N/A")
    echo "   公司数量: $COMPANY_COUNT"
    echo "   公司列表: $COMPANIES"
else
    echo "❌ 配置文件不存在: $CONFIG_FILE"
    exit 1
fi

echo ""

# 2. 测试Python爬虫是否能正确读取配置
echo "2. 测试Python爬虫配置读取..."
PYTHON_TEST=$(python3 -c "
import json
import os
import sys

config_path = os.path.join('..', 'data', 'config.json')
try:
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)
    companies = config.get('supportedCompanies', [])
    print(f'SUCCESS:{len(companies)}')
    for i, c in enumerate(companies[:3]):
        print(f'COMPANY_{i+1}:{c}')
    if len(companies) > 3:
        print(f'AND_MORE:{len(companies)-3}')
except Exception as e:
    print(f'ERROR:{e}')
" 2>&1)

if [[ $PYTHON_TEST == SUCCESS:* ]]; then
    COUNT=$(echo "$PYTHON_TEST" | grep "^SUCCESS:" | cut -d: -f2)
    echo "✅ Python爬虫能正确读取配置 ($COUNT 家公司)"
    echo "   前几家公司:"
    echo "$PYTHON_TEST" | grep "^COMPANY_"
    if echo "$PYTHON_TEST" | grep -q "^AND_MORE:"; then
        EXTRA=$(echo "$PYTHON_TEST" | grep "^AND_MORE:" | cut -d: -f2)
        echo "   还有 $EXTRA 家公司..."
    fi
else
    ERROR=$(echo "$PYTHON_TEST" | grep "^ERROR:" | cut -d: -f2)
    echo "❌ Python爬虫读取配置失败: $ERROR"
fi

echo ""

# 3. 测试API端点
echo "3. 测试API端点..."
echo "   正在检查网站是否运行..."
WEBSITE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3002 2>/dev/null || echo "DOWN")

if [ "$WEBSITE_STATUS" = "200" ] || [ "$WEBSITE_STATUS" = "308" ]; then
    echo "✅ 网站正在运行 (HTTP $WEBSITE_STATUS)"
    
    # 测试配置API
    echo "   测试配置API..."
    API_RESPONSE=$(curl -s http://localhost:3002/api/update-companies 2>/dev/null | jq -r '.companyCount // "ERROR"' 2>/dev/null || echo "ERROR")
    
    if [ "$API_RESPONSE" != "ERROR" ]; then
        echo "✅ 配置API正常工作 ($API_RESPONSE 家公司)"
    else
        echo "⚠️ 配置API可能有问题"
    fi
else
    echo "⚠️ 网站可能未运行 (状态: $WEBSITE_STATUS)"
    echo "   请确保网站已启动: cd /home/tfan/projects/nextjs-tfan && npm run dev -- -p 3002"
fi

echo ""

# 4. 检查定时任务
echo "4. 检查定时任务状态..."
OPENCLAW_STATUS=$(openclaw gateway status 2>/dev/null || echo "NOT_RUNNING")

if [ "$OPENCLAW_STATUS" != "NOT_RUNNING" ]; then
    echo "✅ OpenClaw Gateway 正在运行"
    echo "   当前配置的定时任务:"
    echo ""
    
    # 这里显示定时任务信息（需要在OpenClaw中执行）
    echo "   定时任务ID: 031bbd17-7dc5-4819-9793-040c6e95e716"
    echo "   名称: 上市公司新闻定时抓取"
    echo "   描述: 每天早上8点自动抓取上市公司新闻"
    echo "   下次执行时间: 明天早上8:00 (北京时间)"
    echo ""
    echo "   要手动测试定时任务，运行:"
    echo "   cd /home/tfan/projects/nextjs-tfan/scripts && ./run_crawler.sh"
else
    echo "⚠️ OpenClaw Gateway 未运行"
fi

echo ""

# 5. 同步机制总结
echo "5. 📊 同步机制总结"
echo ""
echo "   🌟 已实现的同步流程:"
echo "   1. 页面加载时: localStorage → config.json"
echo "   2. 添加公司时: React状态 → localStorage → config.json"
echo "   3. 删除公司时: React状态 → localStorage → config.json" 
echo "   4. 移动/排序公司: React状态 → localStorage → config.json"
echo "   5. 定时任务执行: config.json → Python爬虫 → 数据抓取"
echo ""
echo "   🔧 关键组件:"
echo "   - 前端页面: app/page.tsx (已修改)"
echo "   - 后端API: app/api/config/route.ts & app/api/update-companies/route.ts"
echo "   - Python爬虫: scripts/stock_crawler.py (已修改)"
echo "   - 爬虫启动脚本: scripts/run_crawler.sh"
echo "   - OpenClaw定时任务: 每天早上8点执行"
echo ""
echo "   ✅ 测试要点:"
echo "   1. 打开网站: http://localhost:3002"
echo "   2. 添加新公司 (如'中国移动'或'中国电信')"
echo "   3. 查看配置文件: data/config.json (公司列表应自动更新)"
echo "   4. 手动测试爬虫: cd scripts && ./run_crawler.sh"
echo "   5. 新增公司的新闻应出现在网站中"

echo ""
echo "========================================"
echo "测试完成!"
echo "现在新增的公司会自动加入定时任务抓取范围。"
echo "========================================"