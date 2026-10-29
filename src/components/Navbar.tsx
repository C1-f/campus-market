import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import LogoutButton from './LogoutButton';

// 顶部导航：根据登录态显示不同入口
export default async function Navbar() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let nickname = '';
  let isAdmin = false;
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('nickname, role')
      .eq('id', user.id)
      .single();
    nickname = profile?.nickname ?? '';
    const role = profile?.role ?? 'user';
    isAdmin = role === 'admin' || role === 'super_admin';
  }

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="navbar-logo">
          校园二手集市
        </Link>
        <div className="navbar-links">
          <Link href="/">逛集市</Link>
          {user ? (
            <>
              <Link href="/publish" className="highlight">
                + 发布闲置
              </Link>
              <Link href="/profile" className="navbar-user" title={nickname}>
                {nickname || '个人中心'}
              </Link>
              {isAdmin && (
                <Link href="/admin" className="navbar-user">
                  管理后台
                </Link>
              )}
              <LogoutButton />
            </>
          ) : (
            <Link href="/login" className="highlight">
              登录
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
