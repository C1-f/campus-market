'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ADMIN_ACTIONS,
  CATEGORY_LABELS,
  ITEM_STATUS_LABELS,
  ROLE_LABELS,
} from '@/lib/constants';
import type { AdminApplication, AdminLog, Item, Profile, UserRole } from '@/lib/types';

const TABS = [
  { key: 'stats', label: '数据概览' },
  { key: 'items', label: '商品管理' },
  { key: 'users', label: '用户管理' },
  { key: 'applications', label: '管理员申请' },
  { key: 'logs', label: '操作日志' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

interface Stats {
  users: number;
  admins: number;
  items: number;
  available: number;
  reserved: number;
  sold: number;
  expired: number;
  pendingApplications: number;
}

function RoleBadge({ role }: { role?: UserRole }) {
  const cls =
    role === 'super_admin'
      ? 'badge badge-super'
      : role === 'admin'
      ? 'badge badge-admin'
      : 'badge badge-user';
  return <span className={cls}>{ROLE_LABELS[role ?? 'user'] ?? '普通用户'}</span>;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function AdminPanel({
  role,
  nickname,
}: {
  role: UserRole;
  nickname: string;
}) {
  const [tab, setTab] = useState<TabKey>('stats');
  const [stats, setStats] = useState<Stats | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [users, setUsers] = useState<Profile[]>([]);
  const [apps, setApps] = useState<AdminApplication[]>([]);
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [itemQuery, setItemQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const isSuper = role === 'super_admin';

  const load = useCallback(
    async (target: TabKey) => {
      setLoading(true);
      try {
        if (target === 'stats') {
          const r = await fetch('/api/admin/stats');
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setStats(j);
        } else if (target === 'items') {
          const r = await fetch(
            `/api/admin/items?status=${statusFilter}&q=${encodeURIComponent(appliedQuery)}`
          );
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setItems(j.items ?? []);
        } else if (target === 'users') {
          const r = await fetch('/api/admin/users');
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setUsers(j.users ?? []);
        } else if (target === 'applications') {
          const r = await fetch('/api/admin/applications');
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setApps(j.applications ?? []);
        } else if (target === 'logs') {
          const r = await fetch('/api/admin/logs');
          const j = await r.json();
          if (!r.ok) throw new Error(j.error);
          setLogs(j.logs ?? []);
        }
        setMsg(null);
      } catch (e) {
        setMsg({ type: 'err', text: (e as Error).message });
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, appliedQuery]
  );

  useEffect(() => {
    load(tab);
  }, [tab, load]);

  async function act(url: string, body: Record<string, unknown>) {
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch(url, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || '操作失败');
      setMsg({ type: 'ok', text: '操作成功' });
      await load(tab);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
      setLoading(false);
    }
  }

  async function itemAction(id: string, action: 'takedown' | 'restore' | 'delete') {
    const note =
      action === 'restore'
        ? ''
        : window.prompt('操作原因（将记入操作日志，可留空）', '') ?? '';
    await act(`/api/admin/items/${id}`, { action, reason: note });
  }

  async function userAction(
    id: string,
    action: 'ban' | 'unban' | 'promote' | 'demote' | 'force_offline'
  ) {
    const note = window.prompt('操作原因（将记入操作日志，可留空）', '') ?? '';
    await act(`/api/admin/users/${id}`, { action, reason: note });
  }

  async function reviewApp(id: string, action: 'approve' | 'reject') {
    const note = window.prompt('审批意见（将记入操作日志，可留空）', '') ?? '';
    await act(`/api/admin/applications/${id}`, { action, note });
  }

  async function submitApplication() {
    if (reason.trim().length < 5) {
      setMsg({ type: 'err', text: '请至少填写 5 个字的申请理由' });
      return;
    }
    setLoading(true);
    setMsg(null);
    try {
      const r = await fetch('/api/admin/applications', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || '提交失败');
      setMsg({ type: 'ok', text: '申请已提交，等待超级管理员审批' });
      setReason('');
      await load(tab);
    } catch (e) {
      setMsg({ type: 'err', text: (e as Error).message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <h1 className="page-title">平台管理后台</h1>
      <p className="page-subtitle">
        {nickname} · <RoleBadge role={role} />
        {isSuper ? '（可审批管理员申请、撤销管理员权限）' : ''}
      </p>

      <div className="admin-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            className={`admin-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {msg && (
        <div className={`card ${msg.type === 'err' ? 'error-text' : ''}`} style={{ padding: '12px 16px', marginBottom: 16 }}>
          {msg.text}
        </div>
      )}

      {tab === 'stats' && stats && (
        <div className="stat-grid">
          <StatCard value={stats.users} label="注册用户" />
          <StatCard value={stats.admins} label="管理员" />
          <StatCard value={stats.items} label="商品总数" />
          <StatCard value={stats.available} label="在售中" />
          <StatCard value={stats.reserved} label="已被预约" />
          <StatCard value={stats.sold} label="已成交" />
          <StatCard value={stats.expired} label="已下架" />
          <StatCard value={stats.pendingApplications} label="待审申请" />
        </div>
      )}

      {tab === 'items' && (
        <>
          <div className="admin-search">
            <input
              type="text"
              placeholder="搜索：商品名称 / 分类 / 价格 / 卖家昵称或邮箱"
              value={itemQuery}
              onChange={(e) => setItemQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') setAppliedQuery(itemQuery.trim());
              }}
            />
            <button
              className="btn btn-primary btn-sm"
              onClick={() => setAppliedQuery(itemQuery.trim())}
            >
              搜索
            </button>
            {appliedQuery && (
              <button
                className="btn btn-outline btn-sm"
                onClick={() => {
                  setItemQuery('');
                  setAppliedQuery('');
                }}
              >
                重置
              </button>
            )}
          </div>
          <div className="filter-bar">
            {['all', 'available', 'reserved', 'sold', 'expired'].map((s) => (
              <button
                key={s}
                className={`chip ${statusFilter === s ? 'active' : ''}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === 'all' ? '全部' : ITEM_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
          <div className="card table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>商品</th>
                  <th>分类</th>
                  <th>价格</th>
                  <th>卖家</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                      {appliedQuery ? `没有找到匹配「${appliedQuery}」的商品` : '暂无商品'}
                    </td>
                  </tr>
                )}
                {items.map((it) => (
                  <tr key={it.id}>
                    <td>
                      <Link href={`/item/${it.id}`} style={{ color: 'var(--primary)' }}>
                        {it.title}
                      </Link>
                    </td>
                    <td>{CATEGORY_LABELS[it.category as keyof typeof CATEGORY_LABELS] ?? it.category}</td>
                    <td>¥{Number(it.price).toFixed(2)}</td>
                    <td>
                      {it.seller?.nickname ?? '未知'}
                      {it.seller?.role && it.seller.role !== 'user' ? (
                        <> <RoleBadge role={it.seller.role} /></>
                      ) : null}
                    </td>
                    <td>{ITEM_STATUS_LABELS[it.status] ?? it.status}</td>
                    <td>
                      <div className="row-actions">
                        {it.status === 'expired' ? (
                          <button className="btn btn-outline btn-sm" onClick={() => itemAction(it.id, 'restore')}>
                            恢复上架
                          </button>
                        ) : (
                          <button className="btn btn-outline btn-sm" onClick={() => itemAction(it.id, 'takedown')}>
                            强制下架
                          </button>
                        )}
                        <button className="btn btn-danger btn-sm" onClick={() => itemAction(it.id, 'delete')}>
                          删除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'users' && (
        <div className="card table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>昵称</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>注册时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.nickname}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{u.email}</td>
                  <td>
                    {u.is_banned ? (
                      <span className="badge badge-banned">已封禁</span>
                    ) : (
                      <RoleBadge role={u.role} />
                    )}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatTime(u.created_at)}</td>
                  <td>
                    <div className="row-actions">
                      {u.is_banned ? (
                        <button className="btn btn-outline btn-sm" onClick={() => userAction(u.id, 'unban')}>
                          解封
                        </button>
                      ) : (
                        <button className="btn btn-outline btn-sm" onClick={() => userAction(u.id, 'ban')}>
                          封禁
                        </button>
                      )}
                      {isSuper && u.role === 'user' && (
                        <button className="btn btn-outline btn-sm" onClick={() => userAction(u.id, 'promote')}>
                          设为管理员
                        </button>
                      )}
                      {isSuper && u.role === 'admin' && (
                        <button className="btn btn-danger btn-sm" onClick={() => userAction(u.id, 'demote')}>
                          撤销管理员
                        </button>
                      )}
                      {u.session_id && (
                        <button
                          className="btn btn-outline btn-sm"
                          onClick={() => userAction(u.id, 'force_offline')}
                        >
                          强制下线
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'applications' && (
        <>
          {role === 'user' && (
            <div className="card" style={{ padding: '20px', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 12 }}>申请成为管理员</h3>
              <div className="field">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="说明你的申请理由，例如：我是学生会生活部成员，负责闲置物品对接，希望能协助管理平台（至少 5 个字）"
                  rows={3}
                />
              </div>
              <button className="btn btn-primary" onClick={submitApplication}>
                提交申请
              </button>
            </div>
          )}

          <div className="card table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>申请人</th>
                  <th>理由</th>
                  <th>状态</th>
                  <th>提交时间</th>
                  {isSuper && <th>操作</th>}
                </tr>
              </thead>
              <tbody>
                {apps.length === 0 && (
                  <tr>
                    <td colSpan={isSuper ? 5 : 4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                      暂无申请记录
                    </td>
                  </tr>
                )}
                {apps.map((a) => (
                  <tr key={a.id}>
                    <td>{a.applicant?.nickname ?? '未知'}</td>
                    <td style={{ maxWidth: 260, color: 'var(--text-secondary)' }}>{a.reason}</td>
                    <td>
                      {a.status === 'pending' ? (
                        <span className="badge badge-admin">待审批</span>
                      ) : a.status === 'approved' ? (
                        <span className="badge badge-super">已通过</span>
                    ) : (
                        <span className="badge badge-banned">已拒绝</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatTime(a.created_at)}</td>
                    {isSuper && (
                      <td>
                        <div className="row-actions">
                          {a.status === 'pending' ? (
                            <>
                              <button className="btn btn-primary btn-sm" onClick={() => reviewApp(a.id, 'approve')}>
                                同意
                              </button>
                              <button className="btn btn-danger btn-sm" onClick={() => reviewApp(a.id, 'reject')}>
                                拒绝
                              </button>
                            </>
                          ) : (
                            <span style={{ color: 'var(--text-secondary)' }}>已处理</span>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'logs' && (
        <div className="card table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>操作人</th>
                <th>操作</th>
                <th>对象</th>
                <th>备注</th>
                <th>时间</th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: 24 }}>
                  暂无操作记录
                </td>
                </tr>
              )}
              {logs.map((l) => (
                <tr key={l.id}>
                  <td>{l.admin?.nickname ?? '系统'}</td>
                  <td>{ADMIN_ACTIONS[l.action] ?? l.action}</td>
                  <td>{l.target_id.slice(0, 8)}…</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{l.note || '—'}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatTime(l.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-secondary)', marginTop: 12 }}>加载中…</p>}
    </>
  );
}

function StatCard({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat-card">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}
