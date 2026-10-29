import { createClient } from './supabase/server';
import { createAdminClient } from './supabase/admin';
import type { Profile } from './types';

// 权限错误：API 里统一按 status 返回，避免每个路由重复写判断
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// 当前登录用户的 profile（含 role / is_banned），未登录返回 null
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('id, email, nickname, role, is_banned, created_at')
    .eq('id', user.id)
    .single();

  return (data as Profile) ?? null;
}

// 需要登录
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) throw new AuthError('请先登录', 401);
  if (profile.is_banned) throw new AuthError('账号已被封禁，请联系管理员', 403);
  return profile;
}

// 需要管理员权限（管理员 + 超级管理员都算）
export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== 'admin' && profile.role !== 'super_admin') {
    throw new AuthError('需要管理员权限', 403);
  }
  return profile;
}

// 仅超级管理员（审批管理员申请、升降权等最高权限操作）
export async function requireSuperAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== 'super_admin') {
    throw new AuthError('仅超级管理员可执行此操作', 403);
  }
  return profile;
}

// 引导超级管理员：注册/登录时若邮箱与环境变量 SUPER_ADMIN_EMAIL 一致，自动赋予超管身份
export async function ensureSuperAdmin(userId: string, email: string) {
  const configured = (process.env.SUPER_ADMIN_EMAIL || '').trim().toLowerCase();
  if (!configured) return;
  if (configured !== email.trim().toLowerCase()) return;

  const admin = createAdminClient();
  await admin.from('profiles').update({ role: 'super_admin' }).eq('id', userId);
}

// 写管理操作日志（审计）
export async function logAdminAction(
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  note = ''
) {
  try {
    const admin = createAdminClient();
    await admin
      .from('admin_logs')
      .insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId, note });
  } catch (e) {
    console.error('log admin action error', e);
  }
}

// 把 AuthError 转成 HTTP 响应，避免在每条路由里重复 try/catch
export function handleAuthError(e: unknown): Response | null {
  if (e instanceof AuthError) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: e.status,
      headers: { 'content-type': 'application/json' },
    });
  }
  return null;
}
