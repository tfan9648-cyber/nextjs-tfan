"use client";

import React from 'react';

export default function Page() {
  const companies = ['腾讯控股', '阿里巴巴', '贵州茅台', '特斯拉'];
  const keywords = ['关键词 1', '关键词 2', '关键词 3', '关键词 4', '关键词 5'];

  return (
    <div style={{ display: 'flex', height: '100vh', margin: 0, backgroundColor: '#f0f2f5' }}>
      
      {/* 左侧栏：上市公司 */}
      <div style={{ width: '200px', backgroundColor: '#ffffff', borderRight: '1px solid #ddd', padding: '15px' }}>
        <h3 style={{ color: '#0052d9' }}>上市公司</h3>
        {companies.map((name, i) => (
          <div key={i} style={{ padding: '10px', border: '1px solid #eee', marginBottom: '5px', borderRadius: '4px' }}>
            {name}
          </div>
        ))}
        <button style={{ width: '100%', marginTop: '10px' }}>编辑</button>
      </div>

      {/* 中间栏：最新要闻 */}
      <div style={{ flex: 1, backgroundColor: '#ffffff', padding: '20px', overflowY: 'auto' }}>
        <h2 style={{ borderBottom: '2px solid #eee', paddingBottom: '10px' }}>最新要闻</h2>
        <div style={{ marginBottom: '20px', padding: '15px', borderBottom: '1px solid #eee' }}>
          <p style={{ color: '#888', fontSize: '12px' }}>2024-05-20 | 腾讯控股</p >
          <h4 style={{ margin: '10px 0' }}>腾讯控股：发布全新大模型更新</h4>
          <p style={{ fontSize: '14px', color: '#333' }}>这是新闻内容摘要示例，点击下方链接查看详情。</p >
          <a href=" " target="_blank" style={{ color: '#0052d9', fontSize: '12px' }}>查看原文链接</a >
        </div>
      </div>

      {/* 右侧栏：提问关键词 */}
      <div style={{ width: '250px', backgroundColor: '#fafafa', borderLeft: '1px solid #ddd', padding: '15px' }}>
        <h3 style={{ color: '#2ba471' }}>提问关键词</h3>
        {keywords.map((kw, i) => (
          <div key={i} style={{ marginBottom: '15px' }}>
            <label style={{ fontSize: '12px', display: 'block', marginBottom: '5px' }}>输入框 {i+1}</label>
            <input type="text" style={{ width: '100%', padding: '5px', boxSizing: 'border-box' }} placeholder="请输入..." />
          </div>
        ))}
        <button style={{ width: '100%' }}>编辑按钮</button>
      </div>

    </div>
  );
}
