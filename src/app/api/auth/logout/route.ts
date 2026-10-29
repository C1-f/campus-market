import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SESSION_COOKIE, HEARTBEAT_COOKIE } from '@/lib/session';

export async function POST() {
  const supabase = createClient();

  // 释放单设备登录占位，让其他设备可以立即登录
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const db = createAdminClient();
      await db
        .from('profiles')
        .update({ session_id: null, session_last_seen: null })
        .eq('id', user.id);
    }
  } catch {
    // 释放失败不影响登出本身
  }

  await supabase.auth.signOut();

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(HEARTBEAT_COOKIE);
  cookies().delete(SESSION_COOKIE);
  cookies().delete(HEARTBEAT_COOKIE);
  return res;
}
