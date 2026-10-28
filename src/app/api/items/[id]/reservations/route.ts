import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 预约自提：买家对在售商品发起预约，等待卖家确认
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
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
      .select('id, seller_id, status, expires_at')
      .eq('id', params.id)
      .single();
    if (findErr || !item) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 });
    }
    if (item.seller_id === user.id) {
      return NextResponse.json({ error: '不能预约自己发布的商品' }, { status: 400 });
    }
    if (item.status !== 'available' || new Date(item.expires_at) <= new Date()) {
      return NextResponse.json({ error: '该商品已被预约/售出或已下架' }, { status: 400 });
    }

    const body = await req.json();
    const note = String(body?.note ?? '').trim().slice(0, 100);

    const { data, error } = await supabase
      .from('reservations')
      .insert({ item_id: params.id, buyer_id: user.id, note })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '你已预约过该商品' }, { status: 409 });
      }
      console.error('reservation error', error);
      return NextResponse.json({ error: '预约失败，请稍后重试' }, { status: 500 });
    }

    return NextResponse.json({ reservation: data }, { status: 201 });
  } catch (e) {
    console.error('reservation error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
