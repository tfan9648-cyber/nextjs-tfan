'use client';

import { useState } from 'react';

// 模拟公司数据
const defaultCompanies = ['苹果', '特斯拉', '微软', '谷歌', '亚马逊'];

export default function Home() {
  const [companies, setCompanies] = useState(defaultCompanies);
  const [isEditingCompanies, setIsEditingCompanies] = useState(false);
  const [keywords, setKeywords] = useState(['', '', '', '', '']);
  const [isEditingKeywords, setIsEditingKeywords] = useState(false);

  // 模拟新闻数据
  const newsList = [
    { id: 1, date: '2026-04-01', company: '苹果', title: '发布2026财年Q1财报，营收超预期', source: '华尔街日报', url: '#', summary: '苹果公司第一季度营收达到1230亿美元，同比增长8%，超出市场预期。' },
    { id: 2, date: '2026-04-01', company: '特斯拉', title: '中国工厂产量突破新高', source: '彭博社', url: '#', summary: '特斯拉上海超级工厂月度产量突破10万辆。' },
    { id: 3, date: '2026-04-01', company: '微软', title: '收购AI初创公司强化Azure', source: 'TechCrunch', url: '#', summary: '微软宣布斥资50亿美元收购AI初创公司。' },
  ];

  const moveCompany = (index: number, direction: 'up' | 'down') => {
    const newCompanies = [...companies];
    if (direction === 'up' && index > 0) {
      [newCompanies[index], newCompanies[index - 1]] = [newCompanies[index - 1], newCompanies[index]];
    } else if (direction === 'down' && index
