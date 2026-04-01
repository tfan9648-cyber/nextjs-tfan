"use client";

import React, { useState } from 'react';

export default function Dashboard() {
  // 1. 状态管理
  const [companies, setCompanies] = useState(['腾讯控股', '阿里巴巴', '贵州茅台', '特斯拉']);
  const [keywords, setKeywords] = useState(['AI 芯片进展', '三季度财报预测', '行业新规', '高管变动', '竞品动态']);
  
  // 模拟新闻数据
  const news = [
    { id: 1, date: '2024-05-20', company: '腾讯控股', title: '2024-05-20 腾讯控股：发布全新混元大模型更新', summary: '这是新闻总结示例，每个上市公司要闻的正文不超过300字。在这里会显示核心内容提取...', url: '#', type: 'daily' },
    { id: 2, date: '2024-05-20', company: '特斯拉', title: '2024-05-20 特斯拉：FSD在华落地取得新进展', summary: '特斯拉自动驾驶技术在中国市场的最新动态总结...', url: '#', type: 'daily' }
  ];

  return (
    <div style={{ display: 'flex', h: '100vh', height: '100vh', backgroundColor: '#f3f4f6', fontFamily: 'sans-serif', margin: 0 }}>
      
      {/* 左边栏：上市公司 */}
      <aside style={{ width: '200px', backgroundColor: 'white', borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ color: '#2563eb' }}>上市公司</b>
          <button style={{ fontSize: '10px' }}>编辑</button>
        </div>
        <div style={{ flex: 1, padding: '10px', overflowY: 'auto' }}>
          {companies.map((item, i) => (
            <div key={i} style={{ padding: '10px', marginBottom: '8px', border: '1px solid #eee', borderRadius: '4px', fontSize: '13px' }}>
              {item}
            </div>
          ))}
          <button style={{ width: '100%', padding: '5px', border: '1px dashed #ccc', cursor: 'pointer', color: '#999' }}>+ 添加</button>
        </div>
      </aside>

      {/* 中间栏：最新要闻 */}
      <main style={{ flex: 1, backgroundColor: 'white', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{ padding: '15px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
          <b style={{ fontSize: '18px' }}>最新要闻</b>
          <span style={{ fontSize: '12px', color: '#999' }}>每日 8:00 更新</span>
        </header>
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
          {news.map(item => (
            <div key={item.id} style={{ marginBottom: '30px', borderBottom: '1px solid #f9f9f9', paddingBottom: '15px' }}>
              <div style={{ fontSize: '12px', color: '#3b82f6', marginBottom: '5px' }}>● 每日要闻 | {item.date}</div>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#111', cursor: 'pointer' }}>{item.title}</h3>
              <p style={{ fontSize: '14px', color: '#666', lineHeight: '1.5' }}>{item.summary}</p >
              <a href= '12px', color: '#3b82f6', textDecoration: 'none' }}>查看原文链接 &rarr;</a >
            </div>
          ))}
        </div>
      </main>

      {/* 右边栏：提问关键词 */}
      <aside style={{ width: '250px', backgroundColor: '#f9fafb', borderLeft: '1px solid #e5e7eb' }}>
        <div style={{ padding: '15px', borderBottom: '1px solid #eee', backgroundColor: 'white' }}>
          <b style={{ color: '#10b981' }}>提问关键词</b>
        </div>
        <div style={{ padding: '15px' }}>
          {keywords.map((_, i) => (
            <div key={i} style={{ marginBottom: '15px' }}>
              <div style={{ fontSize: '11px', color: '#999', marginBottom: '4px' }}>关键词框 {i + 1}</div>
              <div style={{ display: 'flex' }}>
                <input type="text" placeholder="搜索..." style={{ flex: 1, padding: '6px', border: '1px solid #ddd', borderRadius: '4px 0 0 4px' }} />
                <button style={{ backgroundColor: '#10b981', color: 'white', border: 'none', padding: '0 10px', borderRadius: '0 4px 4px 0', cursor: 'pointer' }}>Go</button>
              </div>
            </div>
          ))}
        </div>
      </aside>

    </div>
  );
}
