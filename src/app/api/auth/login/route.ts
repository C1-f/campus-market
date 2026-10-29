import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureSuperAdmin } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    if (!email || !password) {
      return NextResponse.json({ error: '请输入邮箱和密码' }, { status: 400 });
    }

    const supabase = createClient();
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.toLowerCase().trim(),
      password,
    });

    if (error || !data.user) {
      return NextResponse.json({ error: '邮箱或密码错误' }, { status: 401 });
    }

    // 登录后引导超级管理员（环境变量 SUPER_ADMIN_EMAIL 指定）
    await ensureSuperAdmin(data.user.id, email);

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, nickname, role, is_banned')
      .eq('id', data.user.id)
      .single();

    // session 已由 @supabase/ssr 写入 cookie
    return NextResponse.json({
      user: profile ?? { id: data.user.id, email, nickname: '', role: 'user' },
    });
  } catch (e) {
    console.error('login error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
