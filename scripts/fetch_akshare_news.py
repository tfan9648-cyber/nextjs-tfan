#!/home/tfan/projects/nextjs-tfan/scripts/venv/bin/python3
"""
AKShare 新闻抓取脚本
从东方财富获取指定股票的今日新闻，输出JSON格式

用法: python3 fetch_akshare_news.py <股票代码>
输出: JSON 数组到 stdout
格式: [{"title": "...", "content": "...", "source": "...", "url": "...", "publishTime": "..."}]
"""

import sys
import json
import argparse
from datetime import datetime, date, timezone, timedelta
from typing import List, Dict, Any
import warnings

warnings.filterwarnings('ignore', category=UserWarning)


def fetch_stock_news(symbol: str) -> List[Dict[str, Any]]:
    """获取指定股票的最新新闻，只保留今日的"""
    try:
        import akshare as ak
        df = ak.stock_news_em(symbol=symbol)
        if df.empty:
            return []
        
        # 中国时区（UTC+8）
        china_tz = timezone(timedelta(hours=8))
        now_china = datetime.now(china_tz)
        cutoff = now_china - timedelta(hours=24)  # 24小时之前
        
        recent_news = []
        
        for _, row in df.iterrows():
            publish_time = row.get('发布时间') or ''
            # 提取日期部分（可能包含时间）
            if isinstance(publish_time, str):
                # 尝试解析多种时间格式
                try:
                    # 格式1: "2026-04-29 09:22:00"
                    dt = datetime.strptime(publish_time, "%Y-%m-%d %H:%M:%S")
                except ValueError:
                    try:
                        # 格式2: "2026-04-29"
                        dt = datetime.strptime(publish_time, "%Y-%m-%d")
                    except ValueError:
                        dt = None
                
                if dt:
                    # 转换为中国时区
                    if dt.tzinfo is None:
                        dt = dt.replace(tzinfo=china_tz)
                    
                    # 24小时内才保留
                    if dt >= cutoff:
                        news_item = {
                            "title": str(row.get('新闻标题', '')).strip(),
                            "content": str(row.get('新闻内容', '')).replace('\ue628', '').strip(),
                            "source": str(row.get('文章来源', '')).strip(),
                            "url": str(row.get('新闻链接', '')).strip(),
                            "publishTime": publish_time.strip()
                        }
                        # 确保所有字段不为空
                        if all(news_item.values()):
                            recent_news.append(news_item)
                else:
                    # 简单字符串匹配日期部分
                    # 尝试简单日期匹配作为回退
                    date_part = publish_time.split(' ')[0]
                    try:
                        fallback_dt = datetime.strptime(date_part, "%Y-%m-%d").replace(tzinfo=china_tz)
                        if fallback_dt >= cutoff:
                            news_item = {
                                "title": str(row.get('新闻标题', '')).strip(),
                                "content": str(row.get('新闻内容', '')).replace('\ue628', '').strip(),
                                "source": str(row.get('文章来源', '')).strip(),
                                "url": str(row.get('新闻链接', '')).strip(),
                                "publishTime": publish_time.strip()
                            }
                            if all(news_item.values()):
                                recent_news.append(news_item)
                    except ValueError:
                        pass
        
        return recent_news[:5]  # 最多返回5条
    except Exception as e:
        print(f"[ERROR] AKShare 查询失败 ({symbol}): {e}", file=sys.stderr)
        return []


def validate_symbol(symbol: str) -> str:
    """验证股票代码格式并转换为AKShare需要的格式"""
    # 移除可能的空白字符
    symbol = symbol.strip()
    # 检查是否为数字格式（A股）
    if symbol.isdigit():
        # 补齐到6位（东财格式）
        return symbol.zfill(6)
    return symbol


def main():
    parser = argparse.ArgumentParser(description='从东方财富获取股票新闻')
    parser.add_argument('symbol', help='股票代码（如: 000001）')
    parser.add_argument('--pretty', action='store_true', help='格式化JSON输出')
    
    args = parser.parse_args()
    symbol = validate_symbol(args.symbol)
    
    # 检查环境是否已导入akshare
    try:
        import akshare
    except ImportError:
        print(f"[ERROR] 请确认AKShare已安装在虚拟环境中", file=sys.stderr)
        sys.exit(1)
    
    news = fetch_stock_news(symbol)
    
    indent = 2 if args.pretty else None
    print(json.dumps(news, ensure_ascii=False, indent=indent))


if __name__ == '__main__':
    main()