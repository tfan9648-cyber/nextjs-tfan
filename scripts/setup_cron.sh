#!/bin/bash
# 设置定时任务（每天8点自动运行）

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_JOB="0 8 * * * cd $SCRIPT_DIR && ./run_crawler.sh >> $SCRIPT_DIR/cron.log 2>&1"

echo "设置上市公司新闻监控系统定时任务"
echo "========================================"
echo "任务描述: 每天上午8点自动抓取上市公司新闻"
echo "执行命令: $CRON_JOB"
echo "========================================"

# 检查当前用户的crontab
CRON_FILE="/tmp/crontab_$(whoami)"

# 备份现有的crontab
crontab -l > "$CRON_FILE" 2>/dev/null || touch "$CRON_FILE"

# 删除现有的相同任务
sed -i '/run_crawler\.sh/d' "$CRON_FILE"

# 添加新任务
echo "# 上市公司新闻监控系统 - 每天8点自动抓取" >> "$CRON_FILE"
echo "$CRON_JOB" >> "$CRON_FILE"

# 安装crontab
crontab "$CRON_FILE"

# 清理临时文件
rm -f "$CRON_FILE"

echo ""
echo "✅ 定时任务设置完成！"
echo ""
echo "📅 定时任务列表:"
crontab -l | grep -A1 -B1 "run_crawler"
echo ""
echo "🔧 管理定时任务:"
echo "   查看所有任务: crontab -l"
echo "   编辑任务: crontab -e"
echo "   立即测试: cd $SCRIPT_DIR && ./run_crawler.sh"
echo ""
echo "🔄 系统将在每天8点自动运行"
echo "   下次运行: 明天 08:00"