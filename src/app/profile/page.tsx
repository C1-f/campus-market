'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { Item, Reservation } from '@/lib/types';
import { createClient } from '@/lib/supabase/client';
import { ITEM_STATUS_LABELS } from '@/lib/constants';

type Tab = 'items' | 'favorites' | 'reservations';

// 个人中心：管理自己的帖子、收藏、预约
export default function ProfilePage() {
  const [tab, setTab] = useState<Tab>('items');
  const [userId, setUserId] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<string>('user');

  // 管理员申请状态
  const [application, setApplication] = useState<{
    status: 'pending' | 'approved' | 'rejected';
    reason: string;
  } | null>(null);
  const [applyReason, setApplyReason] = useState('');
  const [applyMsg, setApplyMsg] = useState('');
  const [applying, setApplying] = useState(false);

  const [myItems, setMyItems] = useState<Item[]>([]);
  const [favorites, setFavorites] = useState<Item[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return; // middleware 会重定向到登录页
      setUserId(user.id);
      const { data: profile } = await supabase
        .from('profiles')
        .select('nickname, email, role')
        .eq('id', user.id)
        .single();
      setNickname(profile?.nickname ?? '');
      setEmail(profile?.email ?? user.email ?? '');
      setRole(profile?.role ?? 'user');

      // 普通用户加载自己的管理员申请状态
      if ((profile?.role ?? 'user') === 'user') {
        const res = await fetch('/api/admin/applications');
        if (res.ok) {
          const json = await res.json();
          const apps = json.applications ?? [];
          if (apps.length > 0) {
            setApplication({ status: apps[0].status, reason: apps[0].reason });
          }
        }
      }
    });
  }, []);

  const loadMyItems = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('items')
      .select('*')
      .eq('seller_id', userId)
      .order('created_at', { ascending: false });
    setMyItems(data ?? []);
  }, [userId]);

  const loadFavorites = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('favorites')
      .select('item:items(*)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    const rows = (data ?? []) as unknown as { item: unknown }[];
    setFavorites(
      rows
        .map((row) => (Array.isArray(row.item) ? row.item[0] : row.item) as Item)
        .filter(Boolean)
    );
  }, [userId]);

  const loadReservations = useCallback(async () => {
    if (!userId) return;
    const supabase = createClient();
    const { data } = await supabase
      .from('reservations')
      .select('*, item:items(*)')
      .eq('buyer_id', userId)
      .order('created_at', { ascending: false });
    setReservations((data as Reservation[]) ?? []);
  }, [userId]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      await Promise.all([loadMyItems(), loadFavorites(), loadReservations()]);
    } catch {
      setError('加载失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  }, [loadMyItems, loadFavorites, loadReservations]);

  useEffect(() => {
    if (userId) loadAll();
  }, [userId, loadAll]);

  async function itemAction(id: string, action: string, extra: Record<string, unknown> = {}) {
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error || '操作失败');
      return;
    }
    await loadMyItems();
  }

  async function removeItem(id: string) {
    if (!window.confirm('确定删除该商品吗？')) return;
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error || '删除失败');
      return;
    }
    await loadMyItems();
  }

  async function cancelReservation(id: string) {
    const res = await fetch(`/api/reservations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    if (!res.ok) {
      const json = await res.json();
      setError(json.error || '取消失败');
      return;
    }
    await loadReservations();
  }

  async function submitApplication() {
    setApplyMsg('');
    setApplying(true);
    try {
      const res = await fetch('/api/admin/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: applyReason }),
      });
      const json = await res.json();
      if (!res.ok) {
        setApplyMsg(json.error || '提交失败');
        return;
      }
      setApplication({ status: 'pending', reason: applyReason.trim() });
      setApplyReason('');
    } catch {
      setApplyMsg('网络异常，请重试');
    } finally {
      setApplying(false);
    }
  }

  function statusOf(item: Item): string {
    if (item.status === 'available' && new Date(item.expires_at) <= new Date()) {
      return 'expired';
    }
    return item.status;
  }

  return (
    <>
      <div className="profile-header">
        <div className="avatar" style={{ width: 56, height: 56, fontSize: 22 }}>
          {nickname[0] || '同'}
        </div>
        <div className="info">
          <h1>{nickname || '加载中…'}</h1>
          <p>
            {email} ·{' '}
            {role === 'super_admin' ? (
              <span className="badge badge-super">超级管理员</span>
            ) : role === 'admin' ? (
              <span className="badge badge-admin">管理员</span>
            ) : (
              '本校认证用户'
            )}
          </p>
        </div>
        <Link href="/publish" className="btn btn-primary" style={{ marginLeft: 'auto' }}>
          + 发布闲置
        </Link>
      </div>

      {/* 管理员申请入口：仅普通用户可见 */}
      {role === 'user' && (
        <div className="card" style={{ padding: 20, marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>申请成为管理员</h3>
          {application?.status === 'pending' ? (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              你的申请正在等待超级管理员审批，请耐心等待。
              {application.reason && (
                <span style={{ display: 'block', marginTop: 6 }}>
                  申请理由：{application.reason}
                </span>
              )}
            </p>
          ) : (
            <>
              {application?.status === 'rejected' && (
                <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>
                  上次的申请未通过，你可以修改理由后重新提交。
                </p>
              )}
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 10 }}>
                管理员可以协助维护集市秩序（下架违规商品、处理违规用户），由超级管理员审批。
              </p>
              <div className="field" style={{ marginBottom: 10 }}>
                <textarea
                  rows={3}
                  placeholder="请填写申请理由（至少 5 个字），例如：我是学生会生活部成员，希望协助维护二手集市秩序"
                  value={applyReason}
                  onChange={(e) => setApplyReason(e.target.value)}
                />
              </div>
              {applyMsg && (
                <p style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>{applyMsg}</p>
              )}
              <button
                className="btn btn-primary btn-sm"
                disabled={applying}
                onClick={submitApplication}
              >
                {applying ? '提交中…' : '提交申请'}
              </button>
            </>
          )}
        </div>
      )}

      <div className="tabs">
        <button className={tab === 'items' ? 'active' : ''} onClick={() => setTab('items')}>
          我的发布（{myItems.length}）
        </button>
        <button
          className={tab === 'favorites' ? 'active' : ''}
          onClick={() => setTab('favorites')}
        >
          我的收藏（{favorites.length}）
        </button>
        <button
          className={tab === 'reservations' ? 'active' : ''}
          onClick={() => setTab('reservations')}
        >
          我的预约（{reservations.length}）
        </button>
      </div>

      {error && <p className="error-text">{error}</p>}
      {loading ? (
        <div className="loading">加载中…</div>
      ) : tab === 'items' ? (
        myItems.length === 0 ? (
          <div className="empty-state">
            <p>你还没有发布过闲置物品</p>
            <Link href="/publish" style={{ color: 'var(--primary)' }}>
              去发布 →
            </Link>
          </div>
        ) : (
          myItems.map((item) => {
            const st = statusOf(item);
            return (
              <div key={item.id} className="my-item">
                {item.image_urls?.[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.image_urls[0]} alt={item.title} />
                ) : (
                  <div
                    style={{
                      width: 72,
                      height: 72,
                      borderRadius: 8,
                      background: '#eef0f3',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 24,
                      flexShrink: 0,
                    }}
                  >
                    📦
                  </div>
                )}
                <div className="body">
                  <Link href={`/item/${item.id}`} className="title">
                    {item.title}
                  </Link>
                  <div className="sub">
                    <span style={{ color: 'var(--red)', fontWeight: 600 }}>¥{item.price}</span>
                    <span
                      className={`tag ${
                        st === 'sold'
                          ? 'tag-sold'
                          : st === 'reserved'
                            ? 'tag-reserved'
                            : st === 'expired'
                              ? 'tag-expired'
                              : 'tag-negotiable'
                      }`}
                    >
                      {ITEM_STATUS_LABELS[st]}
                    </span>
                    <span>到期：{new Date(item.expires_at).toLocaleDateString('zh-CN')}</span>
                  </div>
                </div>
                <div className="ops">
                  {st === 'available' && (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => itemAction(item.id, 'mark_sold')}
                      >
                        标记售出
                      </button>
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => {
                          const days = Number(
                            window.prompt('重新上架天数（7/15/30）', '15')
                          );
                          if ([7, 15, 30].includes(days))
                            itemAction(item.id, 'relist', { days });
                        }}
                      >
                        延期
                      </button>
                    </>
                  )}
                  {(st === 'sold' || st === 'expired') && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => {
                        const days = Number(window.prompt('重新上架天数（7/15/30）', '15'));
                        if ([7, 15, 30].includes(days))
                          itemAction(item.id, 'relist', { days });
                      }}
                    >
                      重新上架
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => removeItem(item.id)}
                  >
                    删除
                  </button>
                </div>
              </div>
            );
          })
        )
      ) : tab === 'favorites' ? (
        favorites.length === 0 ? (
          <div className="empty-state">
            <p>还没有收藏任何商品</p>
            <Link href="/" style={{ color: 'var(--primary)' }}>
              去逛逛 →
            </Link>
          </div>
        ) : (
          favorites.map((item) => (
            <div key={item.id} className="my-item">
              {item.image_urls?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image_urls[0]} alt={item.title} />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    background: '#eef0f3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  📦
                </div>
              )}
              <div className="body">
                <Link href={`/item/${item.id}`} className="title">
                  {item.title}
                </Link>
                <div className="sub">
                  <span style={{ color: 'var(--red)', fontWeight: 600 }}>¥{item.price}</span>
                  <span className="tag tag-category">
                    {ITEM_STATUS_LABELS[statusOf(item)]}
                  </span>
                </div>
              </div>
              <div className="ops">
                <button
                  className="btn btn-outline btn-sm"
                  onClick={async () => {
                    await fetch(`/api/items/${item.id}/favorite`, { method: 'DELETE' });
                    await loadFavorites();
                  }}
                >
                  取消收藏
                </button>
              </div>
            </div>
          ))
        )
      ) : reservations.length === 0 ? (
        <div className="empty-state">
          <p>你还没有预约过商品</p>
          <Link href="/" style={{ color: 'var(--primary)' }}>
            去逛逛 →
          </Link>
        </div>
      ) : (
        reservations.map((r) => {
          const it = r.item;
          const itStatus = it ? statusOf(it) : 'expired';
          return (
            <div key={r.id} className="my-item">
              {it?.image_urls?.[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.image_urls[0]} alt={it.title} />
              ) : (
                <div
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 8,
                    background: '#eef0f3',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 24,
                    flexShrink: 0,
                  }}
                >
                  📦
                </div>
              )}
              <div className="body">
                {it ? (
                  <Link href={`/item/${it.id}`} className="title">
                    {it.title}
                  </Link>
                ) : (
                  <span className="title">商品已删除</span>
                )}
                <div className="sub">
                  {r.status === 'pending' && <span className="tag tag-negotiable">待卖家确认</span>}
                  {r.status === 'confirmed' && <span className="tag tag-reserved">预约已确认</span>}
                  {r.status === 'cancelled' && <span className="tag tag-expired">已取消</span>}
                  {r.note && <span>留言：{r.note}</span>}
                  {it && <span>{ITEM_STATUS_LABELS[itStatus]}</span>}
                </div>
              </div>
              <div className="ops">
                {r.status !== 'cancelled' && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => cancelReservation(r.id)}
                  >
                    取消预约
                  </button>
                )}
              </div>
            </div>
          );
        })
      )}
    </>
  );
}
