import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { CATEGORIES } from '@/lib/constants';

const PAGE_SIZE = 12;
const VALID_CATEGORIES: string[] = CATEGORIES.map((c) => c.key);

// 商品列表：分类筛选 + 关键词搜索 + 分页 + 到期自动过滤
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get('category') || 'all';
    const q = (searchParams.get('q') || '').trim();
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

    const supabase = createClient();

    // 核心：只展示"在售 + 未到期"的商品（闲置到期自动下架）
    let query = supabase
      .from('items')
      .select('*, seller:profiles!items_seller_id_fkey(id, email, nickname, created_at)', { count: 'exact' })
      .eq('status', 'available')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false });

    if (category !== 'all') {
      if (!VALID_CATEGORIES.includes(category)) {
        return NextResponse.json({ error: '无效的分类' }, { status: 400 });
      }
      query = query.eq('category', category);
    }

    if (q) {
      // 转义 ilike 特殊字符，防注入
      const safeQ = q.replace(/[%,()]/g, ' ');
      query = query.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) {
      console.error('items list error', error);
      return NextResponse.json({ error: '获取商品列表失败' }, { status: 500 });
    }

    return NextResponse.json({
      items: data ?? [],
      total: count ?? 0,
      page,
      pageSize: PAGE_SIZE,
    });
  } catch (e) {
    console.error('items list error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 发布闲置物品
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await req.json();
    const {
      title,
      description = '',
      category,
      price,
      negotiable = true,
      image_urls = [],
      pickup_location = '',
      expire_days = 15,
    } = body;

    // 字段校验
    if (!title || String(title).trim().length < 2 || String(title).trim().length > 60) {
      return NextResponse.json({ error: '标题需为 2-60 个字符' }, { status: 400 });
    }
    if (!VALID_CATEGORIES.includes(category)) {
      return NextResponse.json({ error: '请选择有效的分类' }, { status: 400 });
    }
    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum < 0 || priceNum > 999999) {
      return NextResponse.json({ error: '价格不合法' }, { status: 400 });
    }
    if (![7, 15, 30].includes(Number(expire_days))) {
      return NextResponse.json({ error: '有效期只能选择 7/15/30 天' }, { status: 400 });
    }
    if (!Array.isArray(image_urls) || image_urls.length > 3) {
      return NextResponse.json({ error: '图片最多 3 张' }, { status: 400 });
    }

    const expiresAt = new Date(
      Date.now() + Number(expire_days) * 24 * 60 * 60 * 1000
    ).toISOString();

    const { data, error } = await supabase
      .from('items')
      .insert({
        seller_id: user.id,
        title: String(title).trim(),
        description: String(description).trim(),
        category,
        price: priceNum,
        negotiable: Boolean(negotiable),
        image_urls: image_urls.slice(0, 3),
        pickup_location: String(pickup_location).trim().slice(0, 50),
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (error) {
      console.error('create item error', error);
      return NextResponse.json({ error: '发布失败，请稍后重试' }, { status: 500 });
    }

    return NextResponse.json({ item: data }, { status: 201 });
  } catch (e) {
    console.error('create item error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
