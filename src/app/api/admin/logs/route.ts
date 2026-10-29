import { NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// 管理操作日志（审计）
export async function GET() {
  try {
    await requireAdmin();
    const db = createAdminClient();

    const { data, error } = await db
      .from('admin_logs')
      .select('*, admin:profiles!admin_logs_admin_id_fkey(id, nickname, email, role)')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('admin logs error', error);
      return NextResponse.json({ error: '获取操作日志失败' }, { status: 500 });
    }

    return NextResponse.json({ logs: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('admin logs error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
