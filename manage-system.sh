#!/bin/bash
# 上市公司新闻监控系统 - 管理脚本

set -e

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPTS_DIR="$PROJECT_ROOT/scripts"

echo "========================================"
echo "上市公司新闻监控系统 v2.0 - 管理面板"
echo "========================================"

show_menu() {
    echo ""
    echo "请选择操作:"
    echo "1. 启动Web界面 (Next.js)"
    echo "2. 立即运行数据抓取"
    echo "3. 设置定时任务 (每天8点自动运行)"
    echo "4. 查看系统状态"
    echo "5. 检查依赖环境"
    echo "6. 查看日志文件"
    echo "7. 停止所有服务"
    echo "8. 一键完整启动"
    echo "0. 退出"
    echo ""
    read -p "请输入选项 (0-8): " choice
    echo ""
}

start_web_interface() {
    echo "▶️ 启动Web界面..."
    cd "$PROJECT_ROOT"
    
    # 检查端口占用
    if lsof -ti:3000,3001,3002 > /dev/null 2>&1; then
        echo "⚠️ 端口3000-3002已被占用，使用3003端口"
        PORT=3003
    else
        PORT=3002
    fi
    
    echo "🌐 启动Next.js开发服务器 (端口: $PORT)..."
    nohup npm run dev -- -p $PORT > "$PROJECT_ROOT/nextjs.log" 2>&1 &
    SERVER_PID=$!
    
    sleep 3
    if ps -p $SERVER_PID > /dev/null; then
        echo "✅ Web界面启动成功!"
        echo "   访问: http://localhost:$PORT"
        echo "   日志文件: $PROJECT_ROOT/nextjs.log"
        echo "   PID: $SERVER_PID"
    else
        echo "❌ Web界面启动失败"
        echo "   查看日志: $PROJECT_ROOT/nextjs.log"
    fi
}

run_data_crawler() {
    echo "📊 运行数据抓取..."
    cd "$SCRIPTS_DIR"
    
    if [ -f "run_crawler.sh" ]; then
        ./run_crawler.sh
    else
        echo "❌ 找不到抓取脚本: run_crawler.sh"
    fi
}

setup_cron_job() {
    echo "⏰ 设置定时任务..."
    cd "$SCRIPTS_DIR"
    
    if [ -f "setup_cron.sh" ]; then
        ./setup_cron.sh
    else
        echo "❌ 找不到定时任务设置脚本"
    fi
}

check_system_status() {
    echo "📈 系统状态检查..."
    
    # 检查Web服务器
    echo "1. Web服务器状态:"
    if pgrep -f "next dev" > /dev/null; then
        echo "   ✅ 正在运行"
        ps -f -p $(pgrep -f "next dev") | tail -1
    else
        echo "   ❌ 未运行"
    fi
    
    # 检查数据文件
    echo ""
    echo "2. 数据文件状态:"
    if [ -f "$PROJECT_ROOT/data/news_latest.json" ]; then
        FILE_SIZE=$(stat -c%s "$PROJECT_ROOT/data/news_latest.json")
        LAST_UPDATE=$(stat -c%y "$PROJECT_ROOT/data/news_latest.json" 2>/dev/null | cut -d' ' -f1)
        echo "   ✅ 存在最新数据文件"
        echo "      文件大小: $(($FILE_SIZE/1024)) KB"
        echo "      最后更新: $LAST_UPDATE"
        
        # 读取数据统计
        if [ -f "$PROJECT_ROOT/data/config.json" ]; then
            TOTAL_NEWS=$(grep -o '"totalNews":[0-9]*' "$PROJECT_ROOT/data/config.json" | cut -d: -f2)
            LAST_UPDATE_TIME=$(grep -o '"lastUpdate":"[^"]*"' "$PROJECT_ROOT/data/config.json" | cut -d'"' -f4)
            echo "      新闻数量: $TOTAL_NEWS 条"
            echo "      系统记录: $LAST_UPDATE_TIME"
        fi
    else
        echo "   ❌ 无数据文件"
    fi
    
    # 检查定时任务
    echo ""
    echo "3. 定时任务状态:"
    CRON_JOBS=$(crontab -l 2>/dev/null | grep -c "run_crawler")
    if [ "$CRON_JOBS" -gt 0 ]; then
        echo "   ✅ 定时任务已设置 ($CRON_JOBS 个)"
        crontab -l | grep -A1 -B1 "run_crawler"
    else
        echo "   ❌ 无定时任务"
    fi
    
    # 检查端口监听
    echo ""
    echo "4. 网络端口状态:"
    for PORT in 3000 3001 3002 3003; do
        if lsof -ti:$PORT > /dev/null 2>&1; then
            echo "   ✅ 端口 $PORT 已被占用"
        fi
    done
}

check_dependencies() {
    echo "🔧 检查系统依赖..."
    
    echo "1. 基础依赖:"
    
    # Python
    if command -v python3 &> /dev/null; then
        echo "   ✅ Python3: $(python3 --version 2>&1)"
    else
        echo "   ❌ Python3: 未安装"
    fi
    
    # Node.js
    if command -v node &> /dev/null; then
        echo "   ✅ Node.js: $(node --version)"
    else
        echo "   ❌ Node.js: 未安装"
    fi
    
    # npm
    if command -v npm &> /dev/null; then
        echo "   ✅ npm: $(npm --version)"
    else
        echo "   ❌ npm: 未安装"
    fi
    
    echo ""
    echo "2. 项目依赖:"
    
    # Next.js项目依赖
    if [ -f "$PROJECT_ROOT/node_modules/.bin/next" ]; then
        echo "   ✅ Next.js: 已安装"
    else
        echo "   ⚠️  Next.js: 需要安装 (运行: cd $PROJECT_ROOT && npm install)"
    fi
    
    # Python虚拟环境
    if [ -d "$SCRIPTS_DIR/venv" ]; then
        echo "   ✅ Python虚拟环境: 已创建"
    else
        echo "   ⚠️  Python虚拟环境: 未创建"
    fi
}

view_logs() {
    echo "📄 日志文件列表:"
    
    # Next.js日志
    if [ -f "$PROJECT_ROOT/nextjs.log" ]; then
        echo "1. Web服务器日志 ($PROJECT_ROOT/nextjs.log):"
        tail -20 "$PROJECT_ROOT/nextjs.log"
    else
        echo "1. Web服务器日志: 无"
    fi
    
    echo ""
    
    # 爬虫日志
    CRAWLER_LOGS=$(find "$SCRIPTS_DIR" -name "crawler_*.log" 2>/dev/null | sort -r | head -1)
    if [ -n "$CRAWLER_LOGS" ] && [ -f "$CRAWLER_LOGS" ]; then
        echo "2. 最新爬虫日志 ($CRAWLER_LOGS):"
        tail -20 "$CRAWLER_LOGS"
    else
        echo "2. 爬虫日志: 无"
    fi
    
    echo ""
    
    # cron日志
    if [ -f "$SCRIPTS_DIR/cron.log" ]; then
        echo "3. 定时任务日志 ($SCRIPTS_DIR/cron.log):"
        tail -10 "$SCRIPTS_DIR/cron.log"
    else
        echo "3. 定时任务日志: 无"
    fi
}

stop_all_services() {
    echo "🛑 停止所有服务..."
    
    # 停止Next.js
    if pgrep -f "next dev" > /dev/null; then
        echo "停止Web服务器..."
        pkill -f "next dev"
        sleep 1
        echo "✅ Web服务器已停止"
    else
        echo "Web服务器未运行"
    fi
    
    # 停止所有Python爬虫
    if pgrep -f "stock_crawler.py" > /dev/null; then
        echo "停止数据抓取进程..."
        pkill -f "stock_crawler.py"
        sleep 1
        echo "✅ 数据抓取进程已停止"
    fi
}

full_startup() {
    echo "🚀 一键完整启动..."
    
    # 检查依赖
    check_dependencies
    
    echo ""
    
    # 启动Web界面
    start_web_interface
    
    echo ""
    
    # 运行一次数据抓取
    echo "运行初始数据抓取..."
    run_data_crawler
    
    echo ""
    
    # 设置定时任务
    echo "设置自动化..."
    setup_cron_job
    
    echo ""
    echo "🎉 系统启动完成!"
    echo ""
    echo "📋 访问地址: http://localhost:3002 (如果端口被占用可能是3003)"
    echo "📊 数据位置: $PROJECT_ROOT/data/"
    echo "📝 管理脚本: $0"
}

# 主循环
while true; do
    show_menu
    
    case $choice in
        1)
            start_web_interface
            ;;
        2)
            run_data_crawler
            ;;
        3)
            setup_cron_job
            ;;
        4)
            check_system_status
            ;;
        5)
            check_dependencies
            ;;
        6)
            view_logs
            ;;
        7)
            stop_all_services
            ;;
        8)
            full_startup
            ;;
        0)
            echo "退出管理面板"
            exit 0
            ;;
        *)
            echo "无效选项，请重新输入"
            ;;
    esac
    
    read -p "按回车键继续..."
done