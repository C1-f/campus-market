// 浏览器端 Supabase 客户端（带用户会话 cookie）
// Cookie 一律写成会话级（无 Max-Age）：关闭浏览器即失效，实现"退出网页自动退出"
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return document.cookie
            .split('; ')
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf('=');
              return {
                name: c.slice(0, idx),
                value: decodeURIComponent(c.slice(idx + 1)),
              };
            });
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            const path = (options?.path as string | undefined) ?? '/';
            if (!value || options?.maxAge === 0) {
              // 删除 cookie
              document.cookie = `${name}=; Max-Age=0; path=${path}`;
              return;
            }
            const attrs = [
              `${name}=${encodeURIComponent(value)}`,
              `path=${path}`,
              'SameSite=Lax',
            ];
            if (location.protocol === 'https:') attrs.push('Secure');
            // 不写 Max-Age / Expires -> 会话级，浏览器关闭即清除
            document.cookie = attrs.join('; ');
          });
        },
      },
    }
  );
}
