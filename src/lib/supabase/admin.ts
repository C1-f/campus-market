// 服务端管理员客户端（service role key，绕过 RLS）
// 仅允许在 API 路由中使用，用于：注册时强制校验学校邮箱、上传图片
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('缺少 SUPABASE_SERVICE_ROLE_KEY 环境变量');
  }
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
