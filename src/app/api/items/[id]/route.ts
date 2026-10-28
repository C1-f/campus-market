import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 商品详情：商品 + 卖家 + 收藏/预约状态（卖家视角附带预约列表）
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const { data: item, error } = await supabase
      .from('items')
      .select('*, seller:profiles(id, email, nickname, created_at)')
      .eq('id', params.id)
      .single();

    if (error || !item) {
      return NextResponse.json({ error: '商品不存在或已删除' }, { status: 404 });
    }

    // 是否已过期（到期自动下架，仅展示层标记）
    const expired = item.status === 'available' && new Date(item.expires_at) <= new Date();

    const result: Record<string, unknown> = {
      item: { ...item, status: expired ? 'expired' : item.status },
      isExpired: expired,
    };

    // 收藏数与预约数（公开）
    const { count: favCount } = await supabase
      .from('favorites')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', item.id);
    const { count: resvCount } = await supabase
      .from('reservations')
      .select('*', { count: 'exact', head: true })
      .eq('item_id', item.id)
      .eq('status', 'pending');
    result.favoriteCount = favCount ?? 0;
    result.pendingReservationCount = resvCount ?? 0;

    if (user) {
      const { data: fav } = await supabase
        .from('favorites')
        .select('item_id')
        .eq('user_id', user.id)
        .eq('item_id', item.id)
        .maybeSingle();
      result.myFavorite = !!fav;

      const { data: myResv } = await supabase
        .from('reservations')
        .select('id, status')
        .eq('buyer_id', user.id)
        .eq('item_id', item.id)
        .maybeSingle();
      result.myReservation = myResv ?? null;
      result.isOwner = user.id === item.seller_id;

      // 卖家可见预约申请列表（含买家信息）
      if (user.id === item.seller_id) {
        const { data: reservations } = await supabase
          .from('reservations')
          .select('*, buyer:profiles(id, email, nickname, created_at)')
          .eq('item_id', item.id)
          .order('created_at', { ascending: false });
        result.reservations = reservations ?? [];
      }
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error('item detail error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 编辑 / 标记状态（仅卖家本人）
// body.action: 'mark_sold' 标记交易完成 | 'relist' 重新上架
// 无 action 时按传入字段更新（仅 available 状态可编辑）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: item, error: findErr } = await supabase
      .from('items')
      .select('id, seller_id, status')
      .eq('id', params.id)
      .single();
    if (findErr || !item) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 });
    }
    if (item.seller_id !== user.id) {
      return NextResponse.json({ error: '只能管理自己发布的商品' }, { status: 403 });
    }

    const body = await req.json();

    // 标记交易完成：available/reserved -> sold
    if (body.action === 'mark_sold') {
      const { error } = await supabase
        .from('items')
        .update({ status: 'sold' })
        .eq('id', item.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, status: 'sold' });
    }

    // 重新上架：延长有效期，sold/expired -> available
    if (body.action === 'relist') {
      const days = [7, 15, 30].includes(Number(body.days)) ? Number(body.days) : 15;
      const { error } = await supabase
        .from('items')
        .update({
          status: 'available',
          expires_at: new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq('id', item.id);
      if (error) throw error;
      return NextResponse.json({ ok: true, status: 'available' });
    }

    // 普通编辑：仅在售可编辑
    if (item.status !== 'available') {
      return NextResponse.json({ error: '该商品当前状态不可编辑' }, { status: 400 });
    }

    const allowed: Record<string, unknown> = {};
    if (body.title !== undefined) {
      const t = String(body.title).trim();
      if (t.length < 2 || t.length > 60) {
        return NextResponse.json({ error: '标题需为 2-60 个字符' }, { status: 400 });
      }
      allowed.title = t;
    }
    if (body.description !== undefined) allowed.description = String(body.description).trim();
    if (body.category !== undefined) allowed.category = body.category;
    if (body.price !== undefined) {
      const p = Number(body.price);
      if (isNaN(p) || p < 0) {
        return NextResponse.json({ error: '价格不合法' }, { status: 400 });
      }
      allowed.price = p;
    }
    if (body.negotiable !== undefined) allowed.negotiable = Boolean(body.negotiable);
    if (body.pickup_location !== undefined) {
      allowed.pickup_location = String(body.pickup_location).trim().slice(0, 50);
    }
    if (body.image_urls !== undefined) {
      if (!Array.isArray(body.image_urls) || body.image_urls.length > 3) {
        return NextResponse.json({ error: '图片最多 3 张' }, { status: 400 });
      }
      allowed.image_urls = body.image_urls;
    }

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: '没有需要更新的内容' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('items')
      .update(allowed)
      .eq('id', item.id)
      .select()
      .single();
    if (error) throw error;

    return NextResponse.json({ item: data });
  } catch (e) {
    console.error('update item error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 删除商品（仅卖家本人）
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: item, error: findErr } = await supabase
      .from('items')
      .select('id, seller_id')
      .eq('id', params.id)
      .single();
    if (findErr || !item) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 });
    }
    if (item.seller_id !== user.id) {
      return NextResponse.json({ error: '只能删除自己发布的商品' }, { status: 403 });
    }

    const { error } = await supabase.from('items').delete().eq('id', item.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('delete item error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
