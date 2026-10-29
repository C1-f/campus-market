import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, logAdminAction, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// 管理员对商品的处置：强制下架 / 恢复上架 / 彻底删除
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const admin = await requireAdmin();
    const { action, reason = '' } = await req.json();
    const db = createAdminClient();

    if (action === 'takedown') {
      const { error } = await db
        .from('items')
        .update({ status: 'expired' })
        .eq('id', params.id);
      if (error) throw error;
      await logAdminAction(admin.id, 'takedown_item', 'item', params.id, reason);
      return NextResponse.json({ ok: true });
    }

    if (action === 'restore') {
      // 恢复时若有效期已过，自动顺延 7 天
      const { data: item } = await db
        .from('items')
        .select('expires_at')
        .eq('id', params.id)
        .single();
      let expiresAt = item?.expires_at;
      if (!expiresAt || new Date(expiresAt).getTime() < Date.now()) {
        expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
      }
      const { error } = await db
        .from('items')
        .update({ status: 'available', expires_at: expiresAt })
        .eq('id', params.id);
      if (error) throw error;
      await logAdminAction(admin.id, 'restore_item', 'item', params.id, reason);
      return NextResponse.json({ ok: true });
    }

    if (action === 'delete') {
      const { error } = await db.from('items').delete().eq('id', params.id);
      if (error) throw error;
      await logAdminAction(admin.id, 'delete_item', 'item', params.id, reason);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('admin item action error', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
