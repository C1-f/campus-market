import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isSchoolEmail } from '@/lib/constants';

// 注册：服务端强制校验学校邮箱后缀（校园准入控制的核心）
export async function POST(req: NextRequest) {
  try {
    const { email, password, nickname } = await req.json();

    if (!email || !password || !nickname) {
      return NextResponse.json({ error: '请填写完整信息' }, { status: 400 });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    // 校园准入：仅允许白名单邮箱后缀
    if (!isSchoolEmail(email)) {
      return NextResponse.json(
        { error: '仅本校学生可注册：请使用学校邮箱（在平台配置的后缀白名单内）' },
        { status: 403 }
      );
    }
    if (password.length < 6) {
      return NextResponse.json({ error: '密码至少 6 位' }, { status: 400 });
    }
    const nick = String(nickname).trim();
    if (nick.length < 2 || nick.length > 20) {
      return NextResponse.json({ error: '昵称需为 2-20 个字符' }, { status: 400 });
    }

    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: email.toLowerCase().trim(),
      password,
      email_confirm: true, // 课程设计简化：跳过邮箱验证，注册即可登录
      user_metadata: { nickname: nick },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already')) {
        return NextResponse.json({ error: '该邮箱已注册，请直接登录' }, { status: 409 });
      }
      return NextResponse.json({ error: '注册失败：' + error.message }, { status: 500 });
    }

    // profile 由数据库 trigger 自动创建，这里 upsert 兜底
    await admin
      .from('profiles')
      .upsert({ id: data.user!.id, email: email.toLowerCase().trim(), nickname: nick });

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('register error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
