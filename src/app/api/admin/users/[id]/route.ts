import { NextRequest, NextResponse } from 'next/server';
import {
  requireAdmin,
  requireSuperAdmin,
  logAdminAction,
  AuthError,
} from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// 管理员处置用户：封禁 / 解封（管理员可执行）；授予 / 撤销管理员（仅超级管理员可执行）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { action, reason = '' } = await req.json();
    const db = createAdminClient();
    const targetId = params.id;

    if (action === 'promote' || action === 'demote') {
      // 升降权属于最高权限，仅超级管理员
      const superAdmin = await requireSuperAdmin();

      const { data: target } = await db
        .from('profiles')
        .select('id, role, nickname')
        .eq('id', targetId)
        .single();

      if (!target) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }
      if (target.role === 'super_admin') {
        return NextResponse.json({ error: '超级管理员身份不可变更' }, { status: 403 });
      }
      if (targetId === superAdmin.id) {
        return NextResponse.json({ error: '不可变更自己的身份' }, { status: 403 });
      }

      if (action === 'promote') {
        const { error } = await db
          .from('profiles')
          .update({ role: 'admin' })
          .eq('id', targetId);
        if (error) throw error;
        await logAdminAction(superAdmin.id, 'promote_admin', 'user', targetId, reason);
        return NextResponse.json({ ok: true });
      }

      // demote：撤销由普通用户升上来的管理员，回归普通用户
      const { error } = await db
        .from('profiles')
        .update({ role: 'user' })
        .eq('id', targetId);
      if (error) throw error;
      await logAdminAction(superAdmin.id, 'demote_admin', 'user', targetId, reason);
      return NextResponse.json({ ok: true });
    }

    if (action === 'ban' || action === 'unban') {
      const admin = await requireAdmin();

      const { data: target } = await db
        .from('profiles')
        .select('id, role')
        .eq('id', targetId)
        .single();

      if (!target) {
        return NextResponse.json({ error: '用户不存在' }, { status: 404 });
      }
      if (target.role === 'super_admin') {
        return NextResponse.json({ error: '超级管理员不可被封禁' }, { status: 403 });
      }
      if (targetId === admin.id) {
        return NextResponse.json({ error: '不可封禁自己' }, { status: 403 });
      }

      const { error } = await db
        .from('profiles')
        .update({ is_banned: action === 'ban' })
        .eq('id', targetId);
      if (error) throw error;

      // 封禁时同步下架其全部在售商品，避免违规内容继续展示
      if (action === 'ban') {
        await db
          .from('items')
          .update({ status: 'expired' })
          .eq('seller_id', targetId)
          .eq('status', 'available');
      }

      await logAdminAction(
        admin.id,
        action === 'ban' ? 'ban_user' : 'unban_user',
        'user',
        targetId,
        reason
      );
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('admin user action error', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
