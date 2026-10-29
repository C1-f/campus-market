import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { CATEGORIES } from '@/lib/constants';

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
      // 智能搜索：一个关键词同时匹配 商品名称/描述、价格（精确）、分类（中英文）、卖家（昵称/邮箱）
      const safeQ = q.replace(/[%,().]/g, ' ').trim();
      if (safeQ) {
        const orParts = [`title.ilike.%${safeQ}%`, `description.ilike.%${safeQ}%`];

        // 纯数字 → 价格精确匹配（如输入 400 匹配 ¥400.00）
        const num = Number(safeQ);
        if (!Number.isNaN(num)) orParts.push(`price.eq.${num}`);

        // 命中分类中文名或英文 key → 按分类过滤
        const cat = CATEGORIES.find(
          (c) => c.label.includes(q) || c.key === q.toLowerCase()
        );
        if (cat) orParts.push(`category.eq.${cat.key}`);

        // 卖家昵称/邮箱模糊匹配 → 转成 seller_id 集合
        const { data: sellers } = await db
          .from('profiles')
          .select('id')
          .or(`nickname.ilike.%${safeQ}%,email.ilike.%${safeQ}%`)
          .limit(20);
        if (sellers && sellers.length > 0) {
          orParts.push(`seller_id.in.(${sellers.map((s) => s.id).join(',')})`);
        }

        query = query.or(orParts.join(','));
      }
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
