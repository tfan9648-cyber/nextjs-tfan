#!/bin/bash
echo "正在部署上市公司新闻监控系统 v2.0..."
echo "=========================================="

# 检查当前状态
echo "1. 检查Git状态..."
git status

# 创建备份
echo -e "\n2. 创建备份..."
if [ ! -f "app/page.backup.tsx" ]; then
    cp app/page.tsx app/page.backup.tsx
    echo "✅ 已创建备份: app/page.backup.tsx"
else
    echo "✅ 备份已存在"
fi

# 检查需要安装的依赖
echo -e "\n3. 检查项目依赖..."
if ! grep -q "@dnd-kit" package.json; then
    echo "⚠️  需要安装拖拽排序依赖"
    echo "   运行: npm install @dnd-kit/core @dnd-kit/sortable"
fi

if ! grep -q "react-hot-toast" package.json; then
    echo "⚠️  需要安装通知提示依赖"
    echo "   运行: npm install react-hot-toast"
fi

# 显示部署说明
echo -e "\n4. 部署说明:"
echo "   ✅ 新页面已准备就绪: app/page.tsx"
echo "   📁 备份文件: app/page.backup.tsx"
echo "   🚀 要恢复原版: cp app/page.backup.tsx app/page.tsx"
echo -e "\n5. 运行步骤:"
echo "   a. 检查依赖: npm install"
echo "   b. 启动开发: npm run dev"
echo "   c. 访问: http://localhost:3000"
echo -e "\n6. 功能特性:"
echo "   • 三栏专业布局（上市公司 + 要闻 + 关键词）"
echo "   • 可编辑的上市公司列表"
echo "   • 关键词智能搜索"
echo "   • 规范化的新闻展示"
echo "   • 每日8点自动更新"

echo -e "\n=========================================="
echo "部署完成！需要我帮您提交到GitHub吗？"
echo "运行: git add . && git commit -m '升级: 上市公司新闻监控系统 v2.0' && git push"