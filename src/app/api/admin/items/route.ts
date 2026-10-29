import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

const PAGE_SIZE = 20;

// 管理员视角的商品列表：不限状态、支持状态筛选与关键词搜索
export async function GET(req: NextRequest) {
  try {
    await requireAdmin();
    const db = createAdminClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    let query = db
      .from('items')
      .select('*, seller:profiles!items_seller_id_fkey(id, email, nickname, role)', {
        count: 'exact',
      })
      .order('created_at', { ascending: false });

    if (status !== 'all') {
      query = query.eq('status', status);
    }
    if (q) {
      const safeQ = q.replace(/[%,()]/g, ' ');
      query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const { data, error, count } = await query.range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('admin items error', error);
      return NextResponse.json({ error: '获取商品列表失败' }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [], total: count ?? 0, page, pageSize: PAGE_SIZE });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('admin items error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
