"use client";
import React, { useState } from 'react';

export default function Page() {
  const [companies] = useState(['腾讯控股', '阿里巴巴', '贵州茅台', '特斯拉']);
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchNews = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/news', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companies })
      });
      const data = await res.json();
      setNews(data);
    } catch (e) {
      alert("抓取失败");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', margin: 0, backgroundColor: '#f0f2f5', fontFamily: 'sans-serif' }}>
      <div style={{ width: '200px', backgroundColor: '#ffffff', borderRight: '1px solid #ddd', padding: '15px' }}>
        <h3 style={{ color: '#0052d9' }}>上市公司</h3>
        {companies.map((name, i) => (
          <div key={i} style={{ padding: '10px', border: '1px solid #eee', marginBottom: '5px', borderRadius: '4px' }}>{name}</div>
        ))}
        <button onClick={fetchNews} style={{ width: '100%', marginTop: '20px', padding: '10px', backgroundColor: '#0052d9', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? '正在抓取...' : '手动更新要闻'}
        </button>
      </div>
      <div style={{ flex: 1, backgroundColor: '#ffffff', padding: '20px', overflowY: 'auto' }}>
        <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>最新要闻</h2>
        {news.length === 0 && <p style={{ color: '#999' }}>点击左侧按钮开始更新...</p >}
        {news.map((item, i) => (
          <div key={i} style={{ marginBottom: '20px', padding: '15px', borderBottom: '1px solid #eee' }}>
            <h4 style={{ margin: '10px 0' }}>{item.title}</h4>
            <p style={{ fontSize: '14px', color: '#333' }}>{item.summary}</p >
            <a href= "_blank" style={{ color: '#0052d9', fontSize: '12px' }}>查看原文链接</a >
          </div>
        ))}
      </div>
    </div>
  );
}
