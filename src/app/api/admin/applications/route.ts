import { NextRequest, NextResponse } from 'next/server';
import { requireProfile, AuthError } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// 提交管理员申请（普通用户）
export async function POST(req: NextRequest) {
  try {
    const me = await requireProfile();
    const { reason = '' } = await req.json();

    if (me.role === 'admin' || me.role === 'super_admin') {
      return NextResponse.json({ error: '你已经是管理员了' }, { status: 400 });
    }
    if (reason.trim().length < 5) {
      return NextResponse.json(
        { error: '请至少填写 5 个字的申请理由' },
        { status: 400 }
      );
    }

    const db = createAdminClient();
    const { error } = await db
      .from('admin_applications')
      .insert({ user_id: me.id, reason: reason.trim().slice(0, 200) });

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: '你已有一条待审申请，请等待处理' },
        { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('create application error', e);
    return NextResponse.json({ error: '提交失败' }, { status: 500 });
  }
}

// 查看申请列表：超级管理员看全部，普通用户只看自己的
export async function GET(req: NextRequest) {
  try {
    const me = await requireProfile();
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') || 'all';

    let query = supabase
      .from('admin_applications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (me.role !== 'super_admin') {
      query = query.eq('user_id', me.id);
    }
    if (status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      console.error('list applications error', error);
      return NextResponse.json({ error: '获取申请列表失败' }, { status: 500 });
    }

    // 附带申请人信息（仅超管可见全部）
    const apps = data ?? [];
    const ids = Array.from(new Set(apps.map((a) => a.user_id)));
    let profileMap: Record<string, { id: string; email: string; nickname: string; role?: string }> = {};
    if (ids.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, email, nickname, role')
        .in('id', ids);
      (profiles ?? []).forEach((p) => {
        profileMap[p.id] = p;
      });
    }

    return NextResponse.json({
      applications: apps.map((a) => ({
        ...a,
        applicant: profileMap[a.user_id] as never,
      })),
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('list applications error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
