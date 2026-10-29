import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureSuperAdmin } from '@/lib/auth';
import { isSessionActive, SESSION_COOKIE, sessionIdleMs } from '@/lib/session';

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

    // 单设备登录：该账号若已在其他设备在线，拒绝本次登录
    const db = createAdminClient();
    const { data: state } = await db
      .from('profiles')
      .select('session_id, session_last_seen')
      .eq('id', data.user.id)
      .single();

    if (isSessionActive(state)) {
      // 撤销刚刚建立的会话，避免被拒的设备仍持有登录态
      await supabase.auth.signOut();
      const idleMinutes = Math.round(sessionIdleMs() / 60000);
      return NextResponse.json(
        {
          error: `该账号已在其他设备登录，请先在原设备退出登录（原设备连续 ${idleMinutes} 分钟无操作后会自动释放）`,
        },
        { status: 409 }
      );
    }

    // 绑定本次会话：会话标识写入数据库 + HttpOnly Cookie
    const sid = crypto.randomUUID();
    await db
      .from('profiles')
      .update({ session_id: sid, session_last_seen: new Date().toISOString() })
      .eq('id', data.user.id);
    cookies().set(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

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
