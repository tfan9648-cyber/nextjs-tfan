import React, { useState, useEffect } from 'react';
import { Plus, Trash2, GripVertical, Edit2, Check } from 'lucide-react';

export default function Dashboard() {
  // 1. 状态管理
  const [isEditing, setIsEditing] = useState(false);
  const [companies, setCompanies] = useState(['腾讯控股', '阿里巴巴', '贵州茅台', '特斯拉']);
  const [keywords, setKeywords] = useState(['AI 芯片进展', '三季度财报预测']);
  const [news, setNews] = useState([
    { id: 1, date: '2024-05-20', company: '腾讯控股', title: '2024-05-20 腾讯控股：发布全新混元大模型更新', summary: '正文内容不超过300字示例...', url: '#', type: 'daily' },
    { id: 2, date: '2024-05-20', company: '特斯拉', title: '2024-05-20 特斯拉：FSD在华落地取得新进展', summary: '正文内容示例...', url: '#', type: 'daily' },
    { id: 3, date: '2024-05-19', company: '阿里巴巴', title: '2024-05-19 阿里巴巴：阿里云宣布大规模降价', summary: '正文内容示例...', url: '#', type: 'daily' },
  ]);

  // 2. 处理公司增删（排序逻辑建议后续引入 dnd-kit）
  const addCompany = () => setCompanies([...companies, '新上市公司']);
  const removeCompany = (index) => setCompanies(companies.filter((_, i) => i !== index));

  return (
    <div className="flex h-screen bg-gray-100 text-gray-800 font-sans">
      
      {/* 左边栏：上市公司 */}
      <aside className="w-64 bg-white border-r flex flex-col">
        <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
          <h2 className="font-bold text-blue-600">上市公司</h2>
          <button onClick={() => setIsEditing(!isEditing)} className="text-gray-500 hover:text-blue-500">
            {isEditing ? <Check size={18} /> : <Edit2 size={18} />}
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {companies.map((name, index) => (
            <div key={index} className="flex items-center p-3 mb-2 bg-white rounded border hover:shadow-sm group">
              {isEditing && <GripVertical size={14} className="mr-2 text-gray-400 cursor-move" />}
              <span className="flex-1 text-sm">{name}</span>
              {isEditing && (
                <button onClick={() => removeCompany(index)} className="text-red-400 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
          {isEditing && (
            <button onClick={addCompany} className="w-full py-2 border-2 border-dashed rounded text-gray-400 flex items-center justify-center hover:bg-gray-50">
              <Plus size={16} className="mr-1" /> 添加公司
            </button>
          )}
        </div>
      </aside>

      {/* 中间栏：最新要闻 */}
      <main className="flex-1 flex flex-col overflow-hidden bg-white shadow-inner">
        <header className="p-4 border-b bg-white z-10 flex justify-between items-center">
          <h2 className="font-bold text-lg">最新要闻</h2>
          <span className="text-xs text-gray-400">每日 8:00 自动更新</span>
        </header>
        
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {news.map((item) => (
            <article key={item.id} className="border-b pb-4 hover:bg-gray-50 transition p-2 rounded">
              <div className="flex items-center space-x-2 mb-1">
                <span className={`px-2 py-0.5 text-[10px] rounded ${item.type === 'daily' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                  {item.type === 'daily' ? '每日要闻' : '专项搜索'}
                </span>
                <time className="text-xs text-gray-400">{item.date}</time>
              </div>
              <h3 className="text-md font-semibold text-gray-900 cursor-pointer hover:text-blue-600 underline-offset-4">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3">
                {item.summary}
              </p >
              <div className="mt-2 flex justify-between items-center">
                <a href= "text-xs text-blue-400 hover:underline">查看原文链接 &rarr;</a >
                <span className="text-xs text-gray-300">来源：财经快讯</span>
              </div>
            </article>
          ))}
        </div>
      </main>

      {/* 右边栏：提问关键词 */}
      <aside className="w-72 bg-gray-50 border-l flex flex-col">
        <div className="p-4 border-b bg-white flex justify-between items-center">
          <h2 className="font-bold text-green-600">提问关键词</h2>
          <button className="text-gray-400 hover:text-green-500"><Plus size={18} /></button>
        </div>
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {keywords.map((kw, idx) => (
            <div key={idx} className="space-y-1">
              <label className="text-[10px] text-gray-400 uppercase font-bold">关键词框 {idx + 1}</label>
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="输入关键词..." 
                  className="w-full p-2 text-sm border rounded shadow-sm focus:ring-2 focus:ring-green-500 outline-none"
                />
                <button className="absolute right-2 top-2 text-[10px] bg-green-500 text-white px-2 py-1 rounded">搜索</button>
              </div>
            </div>
          ))}
        </div>
      </aside>
      
    </div>
  );
}
