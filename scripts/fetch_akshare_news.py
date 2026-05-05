#!/home/tfan/projects/nextjs-tfan/scripts/venv/bin/python3
"""
AKShare 新闻抓取脚本（V3 严格 24h 过滤版）
从东方财富获取指定股票的近 24 小时新闻，输出 JSON 数组到 stdout

用法: python3 fetch_akshare_news.py <股票代码>
输出格式: [{"title", "content", "source", "url", "publishTime"}]

V3 关键约束:
- cutoff = 当前北京时间 - 24h
- publish_time < cutoff 的全部丢弃（不放宽）
- publish_time 解析失败 → 丢弃（不做"今日"宽松匹配）
- 输出的 publishTime 字段统一为 ISO 8601 (东八区)，便于上游 JS 直接 new Date()
"""

import sys
import json
import argparse
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional
import warnings

warnings.filterwarnings('ignore', category=UserWarning)

CHINA_TZ = timezone(timedelta(hours=8))


def parse_publish_time(raw: str) -> Optional[datetime]:
    """严格解析 AKShare 发布时间字段。无法解析返回 None。"""
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if not raw:
        return None
    # 常见格式
    fmts = [
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M",
        "%Y/%m/%d %H:%M:%S",
        "%Y/%m/%d %H:%M",
        "%Y-%m-%dT%H:%M:%S",
    ]
    for f in fmts:
        try:
            dt = datetime.strptime(raw, f)
            return dt.replace(tzinfo=CHINA_TZ)
        except ValueError:
            continue
    # 仅日期 → 视为当天 00:00（保守，再让 cutoff 比较）
    for f in ("%Y-%m-%d", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(raw, f)
            return dt.replace(tzinfo=CHINA_TZ)
        except ValueError:
            continue
    return None


def fetch_stock_news(symbol: str) -> List[Dict[str, Any]]:
    """获取指定股票的最近 24 小时新闻"""
    try:
        import akshare as ak
        df = ak.stock_news_em(symbol=symbol)
        if df is None or df.empty:
            return []

        now_china = datetime.now(CHINA_TZ)
        cutoff = now_china - timedelta(hours=24)

        recent: List[Dict[str, Any]] = []
        for _, row in df.iterrows():
            raw_time = row.get('发布时间') or ''
            dt = parse_publish_time(str(raw_time))
            if dt is None:
                # 时间无法解析 → 丢弃（V3 严格）
                continue
            if dt < cutoff:
                continue

            title = str(row.get('新闻标题', '')).strip()
            content = str(row.get('新闻内容', '')).replace('\ue628', '').strip()
            source = str(row.get('文章来源', '')).strip()
            url = str(row.get('新闻链接', '')).strip()

            if not title or not url:
                continue

            recent.append({
                "title": title,
                "content": content,
                "source": source or "东方财富",
                "url": url,
                # 统一 ISO 8601（带时区）
                "publishTime": dt.isoformat()
            })

        # 按时间倒序，最多 5 条
        recent.sort(key=lambda x: x["publishTime"], reverse=True)
        return recent[:5]
    except Exception as e:
        print(f"[ERROR] AKShare 查询失败 ({symbol}): {e}", file=sys.stderr)
        return []


def validate_symbol(symbol: str) -> str:
    symbol = symbol.strip()
    if symbol.isdigit():
        return symbol.zfill(6)
    return symbol


def main():
    parser = argparse.ArgumentParser(description='从东方财富获取股票新闻（严格24h）')
    parser.add_argument('symbol', help='股票代码（如: 000001）')
    parser.add_argument('--pretty', action='store_true', help='格式化JSON输出')
    args = parser.parse_args()

    try:
        import akshare  # noqa: F401
    except ImportError:
        print("[ERROR] 请确认 AKShare 已安装在虚拟环境中", file=sys.stderr)
        sys.exit(1)

    symbol = validate_symbol(args.symbol)
    news = fetch_stock_news(symbol)
    indent = 2 if args.pretty else None
    print(json.dumps(news, ensure_ascii=False, indent=indent))


if __name__ == '__main__':
    main()
