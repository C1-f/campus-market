import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 处理预约：
// - confirm（仅卖家）：确认预约，商品状态 -> reserved
// - cancel（买家本人或卖家）：取消预约；若商品处于 reserved 且确认的就是该预约，商品回 available
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { data: resv, error: findErr } = await supabase
      .from('reservations')
      .select('id, item_id, buyer_id, status')
      .eq('id', params.id)
      .single();
    if (findErr || !resv) {
      return NextResponse.json({ error: '预约不存在' }, { status: 404 });
    }

    const { data: item } = await supabase
      .from('items')
      .select('id, seller_id, status')
      .eq('id', resv.item_id)
      .single();
    if (!item) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 });
    }

    const isSeller = item.seller_id === user.id;
    const isBuyer = resv.buyer_id === user.id;
    if (!isSeller && !isBuyer) {
      return NextResponse.json({ error: '无权操作该预约' }, { status: 403 });
    }

    const body = await req.json();
    const action = body?.action;

    if (action === 'confirm') {
      if (!isSeller) {
        return NextResponse.json({ error: '仅卖家可确认预约' }, { status: 403 });
      }
      if (resv.status !== 'pending') {
        return NextResponse.json({ error: '该预约已处理' }, { status: 400 });
      }
      if (item.status !== 'available') {
        return NextResponse.json({ error: '商品当前不可预约' }, { status: 400 });
      }
      await supabase.from('reservations').update({ status: 'confirmed' }).eq('id', resv.id);
      await supabase.from('items').update({ status: 'reserved' }).eq('id', item.id);
      return NextResponse.json({ ok: true, status: 'confirmed' });
    }

    if (action === 'cancel') {
      if (resv.status === 'cancelled') {
        return NextResponse.json({ ok: true });
      }
      await supabase.from('reservations').update({ status: 'cancelled' }).eq('id', resv.id);
      // 若因此商品回到可预约状态
      if (item.status === 'reserved') {
        await supabase.from('items').update({ status: 'available' }).eq('id', item.id);
      }
      return NextResponse.json({ ok: true, status: 'cancelled' });
    }

    return NextResponse.json({ error: '无效的操作' }, { status: 400 });
  } catch (e) {
    console.error('reservation patch error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
