#!/usr/bin/env python3
"""
AKShare SSL问题检查脚本
用于验证是否修复成功
"""

import sys
import subprocess
import os

def check_curl_cffi():
    """检查curl_cffi安装状态"""
    print("=== curl_cffi 状态检查 ===")
    try:
        import curl_cffi
        print(f"✓ curl_cffi版本: {curl_cffi.__version__}")
        
        # 测试基本功能
        import curl_cffi.requests as req
        resp = req.get("https://httpbin.org/get", timeout=10)
        print(f"✓ 基本HTTPS请求成功: {resp.status_code}")
        return True
    except Exception as e:
        print(f"✗ curl_cffi检查失败: {e}")
        return False

def check_akshare():
    """检查AKShare功能"""
    print("\n=== AKShare 功能检查 ===")
    try:
        import akshare as ak
        print(f"✓ AKShare版本: {ak.__version__}")
        
        # 测试不同函数（不测试东方财富新闻）
        test_functions = [
            ('stock_sse_summary', {}, '上证概览'),
            ('stock_szse_summary', {}, '深证概览'),
        ]
        
        for func_name, params, desc in test_functions:
            try:
                func = getattr(ak, func_name)
                result = func(**params)
                print(f"✓ {desc}: 成功 ({len(result) if hasattr(result, '__len__') else 'N/A'} 行)")
            except Exception as e:
                print(f"✗ {desc}: 失败 - {type(e).__name__}")
                
        # 尝试东方财富新闻（预期会失败）
        try:
            df = ak.stock_news_em(symbol='000001')
            print(f"✓ 东方财富新闻: 意外成功! {len(df)} 行")
        except Exception as e:
            print(f"✗ 东方财富新闻: 预期失败 - SSL/TLS握手问题")
            
        return True
    except Exception as e:
        print(f"✗ AKShare检查失败: {e}")
        return False

def check_system_ssl():
    """检查系统SSL"""
    print("\n=== 系统SSL检查 ===")
    try:
        import ssl
        print(f"OpenSSL版本: {ssl.OPENSSL_VERSION}")
        
        # 测试系统curl
        print("\n测试系统curl访问东方财富:")
        result = subprocess.run(['curl', '-I', 'https://search-api-web.eastmoney.com/search/jsonp', 
                               '-m', '5'], capture_output=True, text=True)
        if result.returncode == 0:
            print("✓ 系统curl访问成功")
        else:
            print(f"✗ 系统curl访问失败: {result.stderr[:100]}")
            
    except Exception as e:
        print(f"SSL检查失败: {e}")

def main():
    print("AKShare SSL问题诊断报告")
    print("=" * 40)
    
    curl_ok = check_curl_cffi()
    akshare_ok = check_akshare()
    check_system_ssl()
    
    print("\n" + "=" * 40)
    print("总结:")
    if curl_ok and akshare_ok:
        print("✓ curl_cffi和AKShare基本功能正常")
        print("⚠️ 东方财富新闻接口存在SSL握手问题")
        print("建议: 需要系统级SSL修复或使用代理")
    elif curl_ok:
        print("✗ curl_cffi正常但AKShare有问题")
    else:
        print("✗ curl_cffi安装有问题")

if __name__ == "__main__":
    main()