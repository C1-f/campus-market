import { NextRequest, NextResponse } from 'next/server';
import { requireSuperAdmin, logAdminAction, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// 审批管理员申请：approve（通过）/ reject（拒绝）——仅超级管理员
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const superAdmin = await requireSuperAdmin();
    const { action, note = '' } = await req.json();

    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }

    const db = createAdminClient();

    // 只能审批待审申请
    const { data: app, error: readError } = await db
      .from('admin_applications')
      .select('id, user_id, status')
      .eq('id', params.id)
      .single();

    if (readError || !app) {
      return NextResponse.json({ error: '申请不存在' }, { status: 404 });
    }
    if (app.status !== 'pending') {
      return NextResponse.json({ error: '该申请已处理过了' }, { status: 409 });
    }

    const { error: updateError } = await db
      .from('admin_applications')
      .update({
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewer_id: superAdmin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', params.id);

    if (updateError) throw updateError;

    // 通过：把申请人提升为管理员（若其当前是普通用户）
    if (action === 'approve') {
      const { data: target } = await db
        .from('profiles')
        .select('role')
        .eq('id', app.user_id)
        .single();
      if (target && target.role === 'user') {
        await db.from('profiles').update({ role: 'admin' }).eq('id', app.user_id);
      }
    }

    await logAdminAction(
      superAdmin.id,
      action === 'approve' ? 'approve_application' : 'reject_application',
      'application',
      params.id,
      note
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('review application error', e);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}
