import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// 收藏商品
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    // 商品必须存在
    const { data: item } = await supabase
      .from('items')
      .select('id')
      .eq('id', params.id)
      .single();
    if (!item) {
      return NextResponse.json({ error: '商品不存在' }, { status: 404 });
    }

    const { error } = await supabase
      .from('favorites')
      .insert({ user_id: user.id, item_id: params.id });
    if (error && error.code !== '23505') {
      // 23505 = 重复收藏，视为幂等成功
      console.error('favorite error', error);
      return NextResponse.json({ error: '收藏失败' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('favorite error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

// 取消收藏
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const { error } = await supabase
      .from('favorites')
      .delete()
      .eq('user_id', user.id)
      .eq('item_id', params.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('unfavorite error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
