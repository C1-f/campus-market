import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ensureSuperAdmin } from '@/lib/auth';
import { isSessionBusy, SESSION_COOKIE, sessionActiveMs } from '@/lib/session';

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

    // 单设备登录：原设备"正在使用中"（短窗口内仍有心跳）才拒绝本次登录
    // 原设备已关闭网页 / 停止心跳超过该窗口 -> 本次登录直接接管，原设备下次访问被自动踢出
    const db = createAdminClient();
    const { data: state } = await db
      .from('profiles')
      .select('session_id, session_last_seen')
      .eq('id', data.user.id)
      .single();

    if (isSessionBusy(state)) {
      // 撤销刚刚建立的会话，避免被拒的设备仍持有登录态
      await supabase.auth.signOut();
      const seconds = Math.round(sessionActiveMs() / 1000);
      return NextResponse.json(
        {
          error: `该账号正在其他设备使用中，请让对方退出登录，或约 ${seconds} 秒后再试`,
        },
        { status: 409 }
      );
    }

    // 绑定本次会话：会话标识写入数据库 + HttpOnly 会话级 Cookie（随浏览器关闭失效）
    const sid = crypto.randomUUID();
    await db
      .from('profiles')
      .update({ session_id: sid, session_last_seen: new Date().toISOString() })
      .eq('id', data.user.id);
    cookies().set(SESSION_COOKIE, sid, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
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
