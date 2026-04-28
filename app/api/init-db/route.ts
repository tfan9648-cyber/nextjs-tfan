import { NextResponse } from 'next/server';
import { initDb } from '@/lib/db';

export async function GET() {
  try {
    await initDb();
    return NextResponse.json({ success: true, message: 'Database initialized' });
  } catch (error) {
    console.error('Init DB error:', error);
    return NextResponse.json({ error: 'Failed to init DB' }, { status: 500 });
  }
}
