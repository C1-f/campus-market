import Link from 'next/link';
import { getCurrentProfile } from '@/lib/auth';
import AdminPanel from '@/components/AdminPanel';
import type { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

// 管理后台：服务端先鉴权，非管理员直接拒绝渲染
export default async function AdminPage() {
  const me = await getCurrentProfile();

  if (!me) {
    return (
      <div className="container" style={{ padding: '40px 20px' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <h1 className="page-title">请先登录</h1>
          <p className="page-subtitle">管理后台需要登录后访问</p>
          <Link href="/login?next=/admin" className="btn btn-primary">
            去登录
          </Link>
        </div>
      </div>
    );
  }

  const role = (me.role ?? 'user') as UserRole;
  const isAdmin = role === 'admin' || role === 'super_admin';

  if (!isAdmin) {
    return (
      <div className="container" style={{ padding: '40px 20px' }}>
        <div className="card" style={{ padding: '32px', textAlign: 'center' }}>
          <h1 className="page-title">无访问权限</h1>
          <p className="page-subtitle">
            你当前是普通用户。如需成为管理员，可在个人中心提交申请，由超级管理员审批。
          </p>
          <Link href="/profile" className="btn btn-primary">
            去个人中心申请
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="container" style={{ padding: '24px 20px 60px' }}>
      <AdminPanel role={role} nickname={me.nickname} />
    </div>
  );
}
