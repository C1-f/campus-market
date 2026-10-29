'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import LogoutButton from './LogoutButton';

interface Props {
  isLoggedIn: boolean;
  nickname: string;
  isAdmin: boolean;
}

// 导航链接：根据当前路由高亮当前页面入口
export default function NavLinks({ isLoggedIn, nickname, isAdmin }: Props) {
  const pathname = usePathname();

  // 当前路径是否命中该入口
  const isActive = (path: string) =>
    path === '/' ? pathname === '/' : pathname.startsWith(path);

  return (
    <div className="navbar-links">
      <Link href="/" className={isActive('/') ? 'active' : ''}>
        逛集市
      </Link>
      {isLoggedIn ? (
        <>
          <Link href="/publish" className={isActive('/publish') ? 'active' : ''}>
            + 发布闲置
          </Link>
          <Link
            href="/profile"
            className={`navbar-user ${isActive('/profile') ? 'active' : ''}`}
            title={nickname}
          >
            {nickname || '个人中心'}
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className={`navbar-user ${isActive('/admin') ? 'active' : ''}`}
            >
              管理后台
            </Link>
          )}
          <LogoutButton />
        </>
      ) : (
        <Link href="/login" className={isActive('/login') ? 'active' : ''}>
          登录
        </Link>
      )}
    </div>
  );
}
