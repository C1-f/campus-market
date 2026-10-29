import { NextResponse } from 'next/server';
import { requireAdmin, AuthError } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

// 平台数据概览：用户数 / 商品数 / 各状态分布 / 待审申请
export async function GET() {
  try {
    await requireAdmin();
    const db = createAdminClient();

    const [
      { count: users },
      { count: admins },
      { count: items },
      { count: available },
      { count: reserved },
      { count: sold },
      { count: expired },
      { count: pendingApplications },
    ] = await Promise.all([
      db.from('profiles').select('*', { count: 'exact', head: true }),
      db.from('profiles').select('*', { count: 'exact', head: true }).in('role', ['admin', 'super_admin']),
      db.from('items').select('*', { count: 'exact', head: true }),
      db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'available'),
      db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'reserved'),
      db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'sold'),
      db.from('items').select('*', { count: 'exact', head: true }).eq('status', 'expired'),
      db.from('admin_applications').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    ]);

    return NextResponse.json({
      users: users ?? 0,
      admins: admins ?? 0,
      items: items ?? 0,
      available: available ?? 0,
      reserved: reserved ?? 0,
      sold: sold ?? 0,
      expired: expired ?? 0,
      pendingApplications: pendingApplications ?? 0,
    });
  } catch (e) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error('admin stats error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
