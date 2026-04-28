#!/usr/bin/env python3
"""
股票数据查询工具 - 基于 AKShare
用法:
    python3 stock_query.py price 贵州茅台          # 查实时行情
    python3 stock_query.py kline 贵州茅台 30       # 查K线(最近N天)
    python3 stock_query.py finance 贵州茅台        # 查财务数据
    python3 stock_query.py sector 白酒             # 查板块行情
    python3 stock_query.py search 茅台             # 搜索股票代码
    python3 stock_query.py hot                     # 查热门股票
    python3 stock_query.py news 贵州茅台           # 查个股新闻
    python3 stock_query.py index                   # 查大盘指数
"""

import sys
import json
import warnings
warnings.filterwarnings('ignore')

try:
    import akshare as ak
    import pandas as pd
except ImportError:
    print(json.dumps({"error": "akshare 未安装，请运行: pip install akshare"}, ensure_ascii=False))
    sys.exit(1)


# 股票代码缓存
_stock_list_cache = None

def _get_stock_list():
    """获取A股列表(带缓存)"""
    global _stock_list_cache
    if _stock_list_cache is not None:
        return _stock_list_cache
    try:
        df = ak.stock_info_a_code_name()
        _stock_list_cache = df
        return df
    except Exception:
        return pd.DataFrame()


def search_stock(keyword: str) -> dict:
    """搜索股票代码"""
    try:
        df = _get_stock_list()
        if df.empty:
            return {"error": "获取股票列表失败"}
        
        matches = df[df['name'].str.contains(keyword, na=False)]
        if matches.empty:
            matches = df[df['code'].str.contains(keyword, na=False)]
        
        if matches.empty:
            return {"error": f"未找到匹配 '{keyword}' 的股票"}
        
        results = []
        for _, row in matches.head(10).iterrows():
            results.append({
                "code": str(row['code']),
                "name": str(row['name']),
            })
        return {"results": results, "total": len(matches)}
    except Exception as e:
        return {"error": f"搜索失败: {str(e)}"}


def get_stock_code(name_or_code: str) -> tuple:
    """根据名称或代码获取股票代码和名称"""
    try:
        df = _get_stock_list()
        if df.empty:
            return None, None
        
        # 精确匹配名称
        match = df[df['name'] == name_or_code]
        if not match.empty:
            row = match.iloc[0]
            return str(row['code']), str(row['name'])
        
        # 模糊匹配名称
        match = df[df['name'].str.contains(name_or_code, na=False)]
        if not match.empty:
            row = match.iloc[0]
            return str(row['code']), str(row['name'])
        
        # 按代码匹配
        match = df[df['code'] == name_or_code]
        if not match.empty:
            row = match.iloc[0]
            return str(row['code']), str(row['name'])
        
        match = df[df['code'].str.contains(name_or_code, na=False)]
        if not match.empty:
            row = match.iloc[0]
            return str(row['code']), str(row['name'])
        
        return None, None
    except Exception:
        return None, None


def get_price(keyword: str) -> dict:
    """查询实时行情"""
    try:
        code, name = get_stock_code(keyword)
        if not code:
            return {"error": f"未找到 '{keyword}'"}
        
        # 用个股实时行情接口，比全量接口快得多
        try:
            df = ak.stock_bid_ask_em(symbol=code)
            if not df.empty:
                info = {}
                for _, row in df.iterrows():
                    info[str(row.iloc[0])] = row.iloc[1]
                
                result = {
                    "code": code,
                    "name": name,
                    "price": float(info.get('最新', 0)),
                    "change": float(info.get('涨跌额', 0)),
                    "change_pct": float(info.get('涨跌幅', 0)),
                    "high": float(info.get('最高', 0)),
                    "low": float(info.get('最低', 0)),
                    "open": float(info.get('今开', 0)),
                    "prev_close": float(info.get('昨收', 0)),
                    "volume": info.get('成交量', None),
                    "amount": info.get('成交额', None),
                }
                return {"data": [result]}
        except Exception:
            pass
        
        # fallback: 用个股信息
        df = ak.stock_individual_info_em(symbol=code)
        if not df.empty:
            info = {}
            for _, row in df.iterrows():
                info[str(row.iloc[0])] = str(row.iloc[1])
            return {"code": code, "name": name, "info": info}
        
        return {"error": f"获取 {name}({code}) 行情失败"}
    except Exception as e:
        return {"error": f"查询行情失败: {str(e)}"}


def get_kline(keyword: str, days: int = 30) -> dict:
    """查询K线数据"""
    try:
        code, name = get_stock_code(keyword)
        if not code:
            return {"error": f"未找到 '{keyword}'"}
        
        df = ak.stock_zh_a_hist(symbol=code, period="daily", adjust="qfq")
        df = df.tail(days)
        
        records = []
        for _, row in df.iterrows():
            records.append({
                "date": str(row['日期']),
                "open": float(row['开盘']),
                "close": float(row['收盘']),
                "high": float(row['最高']),
                "low": float(row['最低']),
                "volume": float(row['成交量']),
                "amount": float(row['成交额']),
                "change_pct": float(row['涨跌幅']),
            })
        
        # 计算简单统计
        closes = [r['close'] for r in records]
        stats = {
            "period_start": records[0]['date'] if records else None,
            "period_end": records[-1]['date'] if records else None,
            "start_price": closes[0] if closes else None,
            "end_price": closes[-1] if closes else None,
            "highest": max(r['high'] for r in records) if records else None,
            "lowest": min(r['low'] for r in records) if records else None,
            "total_change_pct": round((closes[-1] - closes[0]) / closes[0] * 100, 2) if closes else None,
            "avg_volume": round(sum(r['volume'] for r in records) / len(records)) if records else None,
        }
        
        return {"code": code, "name": name, "days": days, "stats": stats, "kline": records}
    except Exception as e:
        return {"error": f"查询K线失败: {str(e)}"}


def get_finance(keyword: str) -> dict:
    """查询财务数据"""
    try:
        code, name = get_stock_code(keyword)
        if not code:
            return {"error": f"未找到 '{keyword}'"}
        
        result = {"code": code, "name": name}
        
        # 主要财务指标
        try:
            df = ak.stock_financial_abstract_ths(symbol=code, indicator="按年度")
            if not df.empty:
                latest = df.head(3)
                financials = []
                for _, row in latest.iterrows():
                    item = {}
                    for col in row.index:
                        val = row[col]
                        if pd.notna(val):
                            item[col] = str(val) if not isinstance(val, (int, float)) else val
                    financials.append(item)
                result["financial_summary"] = financials
        except Exception as e:
            result["financial_summary_error"] = str(e)
        
        # 个股信息
        try:
            df = ak.stock_individual_info_em(symbol=code)
            if not df.empty:
                info = {}
                for _, row in df.iterrows():
                    info[str(row.iloc[0])] = str(row.iloc[1])
                result["basic_info"] = info
        except Exception as e:
            result["basic_info_error"] = str(e)
        
        return result
    except Exception as e:
        return {"error": f"查询财务数据失败: {str(e)}"}


def get_sector(keyword: str) -> dict:
    """查询板块行情"""
    try:
        df = ak.stock_board_industry_name_em()
        match = df[df['板块名称'].str.contains(keyword, na=False)]
        
        if match.empty:
            # 列出所有板块供参考
            all_sectors = df['板块名称'].tolist()[:20]
            return {"error": f"未找到 '{keyword}' 板块", "available_sectors_sample": all_sectors}
        
        results = []
        for _, row in match.head(5).iterrows():
            sector_name = str(row['板块名称'])
            item = {"name": sector_name}
            
            # 获取板块内股票
            try:
                stocks_df = ak.stock_board_industry_cons_em(symbol=sector_name)
                if not stocks_df.empty:
                    stocks = []
                    for _, s in stocks_df.head(10).iterrows():
                        stocks.append({
                            "code": str(s['代码']),
                            "name": str(s['名称']),
                            "price": float(s['最新价']) if pd.notna(s['最新价']) else None,
                            "change_pct": float(s['涨跌幅']) if pd.notna(s['涨跌幅']) else None,
                        })
                    item["top_stocks"] = stocks
                    item["total_stocks"] = len(stocks_df)
            except Exception:
                pass
            
            results.append(item)
        
        return {"sectors": results}
    except Exception as e:
        return {"error": f"查询板块失败: {str(e)}"}


def get_hot() -> dict:
    """查询热门股票"""
    try:
        df = ak.stock_hot_rank_em()
        if df.empty:
            return {"error": "获取热门股票失败"}
        
        results = []
        for _, row in df.head(20).iterrows():
            results.append({
                "rank": int(row.get('当前排名', 0)) if pd.notna(row.get('当前排名')) else None,
                "code": str(row.get('股票代码', '')),
                "name": str(row.get('股票名称', '')),
            })
        
        return {"hot_stocks": results}
    except Exception as e:
        return {"error": f"查询热门股票失败: {str(e)}"}


def get_news(keyword: str) -> dict:
    """查询个股新闻"""
    try:
        code, name = get_stock_code(keyword)
        if not code:
            return {"error": f"未找到 '{keyword}'"}
        
        try:
            df = ak.stock_news_em(symbol=code)
            if df.empty:
                return {"code": code, "name": name, "news": [], "message": "暂无新闻"}
            
            news_list = []
            for _, row in df.head(10).iterrows():
                news_list.append({
                    "title": str(row.get('新闻标题', '')),
                    "content": str(row.get('新闻内容', ''))[:300],
                    "source": str(row.get('文章来源', '')),
                    "time": str(row.get('发布时间', '')),
                    "url": str(row.get('新闻链接', '')),
                })
            
            return {"code": code, "name": name, "news": news_list}
        except Exception as e:
            return {"code": code, "name": name, "error": f"获取新闻失败: {str(e)}"}
    except Exception as e:
        return {"error": f"查询新闻失败: {str(e)}"}


def get_index() -> dict:
    """查询大盘指数"""
    try:
        df = ak.stock_zh_index_spot_em()
        
        # 主要指数
        major_indices = ['上证指数', '深证成指', '创业板指', '沪深300', '中证500', '科创50']
        results = []
        
        for idx_name in major_indices:
            match = df[df['名称'].str.contains(idx_name, na=False)]
            if not match.empty:
                row = match.iloc[0]
                results.append({
                    "code": str(row['代码']),
                    "name": str(row['名称']),
                    "price": float(row['最新价']) if pd.notna(row['最新价']) else None,
                    "change": float(row['涨跌额']) if pd.notna(row['涨跌额']) else None,
                    "change_pct": float(row['涨跌幅']) if pd.notna(row['涨跌幅']) else None,
                })
        
        return {"indices": results}
    except Exception as e:
        return {"error": f"查询指数失败: {str(e)}"}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "用法: python3 stock_query.py <command> [args]", "commands": [
            "price <股票名称/代码> - 实时行情",
            "kline <股票名称/代码> [天数] - K线数据",
            "finance <股票名称/代码> - 财务数据",
            "sector <板块名称> - 板块行情",
            "search <关键词> - 搜索股票",
            "hot - 热门股票",
            "news <股票名称/代码> - 个股新闻",
            "index - 大盘指数",
        ]}, ensure_ascii=False))
        sys.exit(1)
    
    command = sys.argv[1]
    arg = sys.argv[2] if len(sys.argv) > 2 else ''
    arg2 = sys.argv[3] if len(sys.argv) > 3 else ''
    
    if command == 'price':
        result = get_price(arg)
    elif command == 'kline':
        days = int(arg2) if arg2.isdigit() else 30
        result = get_kline(arg, days)
    elif command == 'finance':
        result = get_finance(arg)
    elif command == 'sector':
        result = get_sector(arg)
    elif command == 'search':
        result = search_stock(arg)
    elif command == 'hot':
        result = get_hot()
    elif command == 'news':
        result = get_news(arg)
    elif command == 'index':
        result = get_index()
    else:
        result = {"error": f"未知命令: {command}"}
    
    print(json.dumps(result, ensure_ascii=False, indent=2, default=str))


if __name__ == "__main__":
    main()
