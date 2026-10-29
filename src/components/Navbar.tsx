import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import NavLinks from './NavLinks';

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
        <NavLinks isLoggedIn={!!user} nickname={nickname} isAdmin={isAdmin} />
      </div>
    </nav>
  );
}
