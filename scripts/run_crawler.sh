#!/bin/bash
# 上市公司新闻监控系统 - 数据抓取启动脚本

set -e  # 遇到错误立即退出

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOG_FILE="$SCRIPT_DIR/crawler_$(date +%Y%m%d_%H%M%S).log"

echo "========================================"
echo "上市公司新闻监控系统 - 数据抓取任务"
echo "执行时间: $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================"

# 进入脚本目录
cd "$SCRIPT_DIR"

# 检查Python环境
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 未安装，请先安装Python3"
    exit 1
fi

echo "✅ Python3 版本: $(python3 --version)"

# 检查依赖
echo "检查Python依赖..."
if [ ! -d "venv" ]; then
    echo "创建Python虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境并安装依赖
source venv/bin/activate
pip install --upgrade pip > /dev/null 2>&1
pip install -r requirements.txt > /dev/null 2>&1
echo "✅ Python依赖已安装"

# 运行爬虫
echo "启动数据抓取..."
if python3 stock_crawler.py 2>&1 | tee -a "$LOG_FILE"; then
    echo "✅ 数据抓取成功完成！"
    echo ""
    echo "📊 执行结果:"
    echo "   日志文件: $LOG_FILE"
    echo "   数据文件: $PROJECT_ROOT/data/news_latest.json"
    echo "   配置文件: $PROJECT_ROOT/data/config.json"
    echo ""
    
    # 更新前端显示
    if [ -f "$PROJECT_ROOT/data/config.json" ]; then
        UPDATED_TIME=$(date -Iseconds)
        echo "   最后更新时间: $UPDATED_TIME"
    fi
    
    # 清理旧日志（保留最近7天）
    find "$SCRIPT_DIR" -name "crawler_*.log" -mtime +7 -delete 2>/dev/null || true
    
    exit 0
else
    echo "❌ 数据抓取失败"
    echo "   查看日志: $LOG_FILE"
    exit 1
fi