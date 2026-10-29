// 服务端 Supabase 客户端（Route Handler / Server Component 使用，自动读写会话 cookie）
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { toSessionCookieOptions } from '@/lib/session';

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            // 会话级 cookie：关闭浏览器即失效（"退出网页自动退出"）
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, toSessionCookieOptions(options))
            );
          } catch {
            // 在 Server Component 中调用时无法写 cookie，可忽略：
            // 会话刷新由 middleware 负责
          }
        },
      },
    }
  );
}
