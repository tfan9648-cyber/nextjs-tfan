import type { Metadata } from 'next';
import ReaderClient from './ReaderClient';

export const metadata: Metadata = {
  title: '读书郎',
  description: '把文档读给你听',
};

export default function ReaderPage() {
  return <ReaderClient />;
}
