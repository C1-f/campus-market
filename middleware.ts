import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import {
  SESSION_COOKIE,
  HEARTBEAT_COOKIE,
  HEARTBEAT_INTERVAL_MS,
} from '@/lib/session';

// 刷新会话 cookie + 保护需要登录的页面
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ---- 单设备登录校验（30 秒节流，避免每次请求都查库）----
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (user && serviceKey && base) {
    const now = Date.now();
    const lastCheck = Number(request.cookies.get(HEARTBEAT_COOKIE)?.value || 0);
    const mySid = request.cookies.get(SESSION_COOKIE)?.value;

    if (now - lastCheck > HEARTBEAT_INTERVAL_MS) {
      const h = {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        'Content-Type': 'application/json',
      };
      const r = await fetch(
        `${base}/rest/v1/profiles?id=eq.${user.id}&select=session_id,session_last_seen`,
        { headers: h, cache: 'no-store' }
      );
      const rows = (await r.json()) as
        | { session_id: string | null; session_last_seen: string | null }[]
        | null;
      const state = Array.isArray(rows) ? rows[0] : null;

      // 会话已被其他设备接管（或管理员强制下线）-> 清理本机会话并踢回登录页
      const bound = state?.session_id ?? null;
      const kicked = mySid ? bound !== mySid : Boolean(bound);

      if (kicked) {
        const url = request.nextUrl.clone();
        url.pathname = '/login';
        url.search = '';
        url.searchParams.set('kicked', '1');
        const kickRes = NextResponse.redirect(url);
        request.cookies.getAll().forEach((c) => {
          if (c.name.startsWith('sb-') || c.name === SESSION_COOKIE || c.name === HEARTBEAT_COOKIE) {
            kickRes.cookies.delete(c.name);
          }
        });
        return kickRes;
      }

      // 本机即当前在线设备（或尚未绑定的老会话）-> 刷新心跳 / 补绑定
      const sid = mySid ?? crypto.randomUUID();
      await fetch(`${base}/rest/v1/profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        headers: { ...h, Prefer: 'return=minimal' },
        body: JSON.stringify({
          session_id: sid,
          session_last_seen: new Date().toISOString(),
        }),
        cache: 'no-store',
      });

      if (!mySid) {
        response.cookies.set(SESSION_COOKIE, sid, {
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
          maxAge: 60 * 60 * 24 * 30,
        });
      }

      response.cookies.set(HEARTBEAT_COOKIE, String(now), {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
      });
    }
  }

  // 未登录访问受保护页面 -> 去登录页
  // /admin 的更细粒度角色校验在页面内部（需要查 role 字段），此处只拦未登录
  const protectedPaths = ['/publish', '/profile', '/admin'];
  const isProtected = protectedPaths.some((p) =>
    request.nextUrl.pathname.startsWith(p)
  );
  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  // 已登录访问登录/注册页 -> 回首页
  const authPaths = ['/login', '/register'];
  if (authPaths.includes(request.nextUrl.pathname) && user) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
