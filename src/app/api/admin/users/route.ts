import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// 用户列表（含角色、封禁状态、发布数量）
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = createAdminClient();
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();

    let query = db
      .from('profiles')
      .select('id, email, nickname, role, is_banned, created_at, session_id, session_last_seen')
      .order('created_at', { ascending: false })
      .limit(100);

    if (q) {
      const safeQ = q.replace(/[%,()]/g, ' ');
      query = query.or(`nickname.ilike.%${safeQ}%,email.ilike.%${safeQ}%`);
    }

    const { data, error } = await query;
    if (error) {
      console.error('admin users error', error);
      return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
    }

    return NextResponse.json({ users: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('admin users error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
