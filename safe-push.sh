#!/bin/bash
# 安全推送脚本 - 上市公司新闻监控系统v2.0
# 使用方法: GITHUB_TOKEN=你的令牌 ./safe-push.sh

set -e  # 遇到错误立即退出

echo "🔒 安全推送脚本 v1.0"
echo "========================================"

# 检查令牌
if [ -z "${GITHUB_TOKEN}" ]; then
    echo "❌ 错误: 请设置GITHUB_TOKEN环境变量"
    echo "   用法: GITHUB_TOKEN=你的令牌 ./safe-push.sh"
    exit 1
fi

echo "✅ 令牌已设置（前4位: ${GITHUB_TOKEN:0:4}****）"

# 进入项目目录
cd /tmp/nextjs-tfan-review

echo "📁 检查Git状态..."
git status

# 配置Git使用令牌
echo "⚙️  配置Git凭据..."
GIT_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/tfan9648-cyber/nextjs-tfan.git"

echo "📝 添加更改..."
git add app/page.tsx deploy-upgrade.sh

echo "💾 提交更改..."
git commit -m "升级: 上市公司新闻监控系统 v2.0 - 完整三栏布局

- 三栏专业布局（上市公司 + 要闻 + 关键词）
- 可编辑的上市公司列表
- 关键词智能搜索
- 规范化的新闻展示
- 每日8点自动更新机制
- 响应式设计，支持移动端

部署时间: $(date '+%Y-%m-%d %H:%M:%S')
技术支持: 小龙助手 🐉"

echo "🚀 推送到GitHub..."
if git push "${GIT_URL}" main; then
    echo "✅ 推送成功！"
    echo ""
    echo "🌐 访问仓库: https://github.com/tfan9648-cyber/nextjs-tfan"
    echo "📋 查看提交: git log --oneline -n 3"
    echo ""
    echo "🔧 后续步骤:"
    echo "   1. 在本地拉取更新: git pull"
    echo "   2. 安装依赖: npm install"
    echo "   3. 启动开发: npm run dev"
    echo "   4. 访问: http://localhost:3000"
    echo ""
    echo "⚠️  安全提醒:"
    echo "   - 立即在GitHub撤销使用的令牌"
    echo "   - 清除终端历史: history -c"
    echo "   - 取消设置环境变量: unset GITHUB_TOKEN"
else
    echo "❌ 推送失败，请检查令牌权限"
fi

echo "========================================"
echo "🎉 上市公司新闻监控系统v2.0部署完成！"