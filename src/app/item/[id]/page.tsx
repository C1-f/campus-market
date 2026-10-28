'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Item, Reservation } from '@/lib/types';
import { CATEGORY_LABELS, ITEM_STATUS_LABELS, EXPIRE_OPTIONS } from '@/lib/constants';

interface DetailResponse {
  item: Item;
  isExpired: boolean;
  favoriteCount: number;
  pendingReservationCount: number;
  myFavorite?: boolean;
  myReservation?: { id: string; status: string } | null;
  isOwner?: boolean;
  reservations?: Reservation[];
}

// 商品详情页：买家可收藏/预约自提；卖家可管理预约、编辑、标记售出、重新上架、删除
export default function ItemDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [imgIndex, setImgIndex] = useState(0);

  const [favBusy, setFavBusy] = useState(false);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveNote, setReserveNote] = useState('');
  const [reserveBusy, setReserveBusy] = useState(false);
  const [actionError, setActionError] = useState('');

  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPrice, setEditPrice] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editNegotiable, setEditNegotiable] = useState(true);
  const [editBusy, setEditBusy] = useState(false);

  const fetchDetail = useCallback(async () => {
    try {
      const res = await fetch(`/api/items/${id}`);
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || '加载失败');
        return;
      }
      setData(json);
      const it = json.item as Item;
      setEditTitle(it.title);
      setEditPrice(String(it.price));
      setEditDesc(it.description);
      setEditLocation(it.pickup_location);
      setEditNegotiable(it.negotiable);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // ---------- 买家操作 ----------

  async function toggleFavorite() {
    if (!data) return;
    setFavBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/items/${id}/favorite`, {
        method: data.myFavorite ? 'DELETE' : 'POST',
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 401) {
          router.push('/login?next=' + encodeURIComponent(`/item/${id}`));
          return;
        }
        setActionError(json.error || '操作失败');
        return;
      }
      setData({
        ...data,
        myFavorite: !data.myFavorite,
        favoriteCount: data.favoriteCount + (data.myFavorite ? -1 : 1),
      });
    } finally {
      setFavBusy(false);
    }
  }

  async function submitReservation() {
    setReserveBusy(true);
    setActionError('');
    try {
      const res = await fetch(`/api/items/${id}/reservations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note: reserveNote }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || '预约失败');
        return;
      }
      setShowReserveModal(false);
      await fetchDetail();
    } finally {
      setReserveBusy(false);
    }
  }

  async function cancelMyReservation() {
    if (!data?.myReservation) return;
    setActionError('');
    const res = await fetch(`/api/reservations/${data.myReservation.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancel' }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || '取消失败');
      return;
    }
    await fetchDetail();
  }

  // ---------- 卖家操作 ----------

  async function ownerAction(action: string, extra: Record<string, unknown> = {}) {
    setActionError('');
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...extra }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || '操作失败');
      return false;
    }
    await fetchDetail();
    return true;
  }

  async function handleReservation(resvId: string, action: 'confirm' | 'cancel') {
    setActionError('');
    const res = await fetch(`/api/reservations/${resvId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || '操作失败');
      return;
    }
    await fetchDetail();
  }

  async function handleDelete() {
    if (!window.confirm('确定删除该商品吗？删除后不可恢复。')) return;
    const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      setActionError(json.error || '删除失败');
      return;
    }
    window.location.href = '/profile';
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    setEditBusy(true);
    setActionError('');
    const ok = await ownerAction('update', {
      title: editTitle,
      price: Number(editPrice),
      description: editDesc,
      pickup_location: editLocation,
      negotiable: editNegotiable,
    });
    setEditBusy(false);
    if (ok) setEditing(false);
  }

  if (loading) return <div className="loading">加载中…</div>;
  if (error || !data) {
    return (
      <div className="empty-state">
        <p>{error || '商品不存在'}</p>
        <Link href="/" style={{ color: 'var(--primary)' }}>
          返回首页
        </Link>
      </div>
    );
  }

  const { item, isExpired } = data;
  const status = item.status;
  const isOwner = !!data.isOwner;
  const canReserve =
    !isOwner && status === 'available' && !isExpired && !data.myReservation;
  const images = item.image_urls ?? [];

  return (
    <div style={{ marginTop: 20 }}>
      <div className="detail-layout">
        <div>
          <div className="detail-gallery">
            {images.length > 0 ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={images[imgIndex]} alt={item.title} />
            ) : (
              <div className="placeholder">📦</div>
            )}
            {images.length > 1 && (
              <div className="gallery-dots">
                {images.map((_, i) => (
                  <button
                    key={i}
                    className={i === imgIndex ? 'active' : ''}
                    onClick={() => setImgIndex(i)}
                    aria-label={`第 ${i + 1} 张`}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="detail-info">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            <span className="tag tag-category">
              {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ??
                item.category}
            </span>
            <span
              className={`tag ${
                status === 'sold'
                  ? 'tag-sold'
                  : status === 'reserved'
                    ? 'tag-reserved'
                    : status === 'expired'
                      ? 'tag-expired'
                      : item.negotiable
                        ? 'tag-negotiable'
                        : 'tag-fixed'
              }`}
            >
              {ITEM_STATUS_LABELS[status]}
            </span>
          </div>

          {editing ? (
            <form onSubmit={saveEdit}>
              <div className="field">
                <label>标题</label>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  minLength={2}
                  maxLength={60}
                  required
                />
              </div>
              <div className="field">
                <label>价格（元）</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>自提地点</label>
                <input
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  maxLength={50}
                  required
                />
              </div>
              <div className="field">
                <label>物品描述</label>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="field">
                <div className="switch-row">
                  <span className="label-text">可议价</span>
                  <button
                    type="button"
                    className={`toggle ${editNegotiable ? 'on' : ''}`}
                    onClick={() => setEditNegotiable(!editNegotiable)}
                    aria-label="切换可议价"
                  />
                </div>
              </div>
              <div className="detail-actions">
                <button className="btn btn-outline" type="button" onClick={() => setEditing(false)}>
                  取消
                </button>
                <button className="btn btn-primary" disabled={editBusy}>
                  {editBusy ? '保存中…' : '保存'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <h1>{item.title}</h1>
              <div className="detail-price">{item.price}</div>
              <div style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                <span className={`tag ${item.negotiable ? 'tag-negotiable' : 'tag-fixed'}`}>
                  {item.negotiable ? '可议价' : '不议价'}
                </span>
                <span style={{ color: 'var(--text-secondary)', alignSelf: 'center' }}>
                  {data.favoriteCount} 人收藏 · {data.pendingReservationCount} 人预约
                </span>
              </div>
              <p className="detail-desc">{item.description || '卖家很懒，什么都没写。'}</p>

              <div className="detail-rows">
                <div className="row">
                  <span className="k">自提地点</span>
                  <span>{item.pickup_location || '待协商'}</span>
                </div>
                <div className="row">
                  <span className="k">发布时间</span>
                  <span>{new Date(item.created_at).toLocaleString('zh-CN')}</span>
                </div>
                <div className="row">
                  <span className="k">{isExpired ? '已到期' : '有效期至'}</span>
                  <span>{new Date(item.expires_at).toLocaleString('zh-CN')}</span>
                </div>
              </div>

              {actionError && <p className="error-text">{actionError}</p>}

              <div className="detail-actions">
                <button className="btn btn-outline" onClick={toggleFavorite} disabled={favBusy}>
                  {data.myFavorite ? '★ 已收藏' : '☆ 收藏'}（{data.favoriteCount}）
                </button>

                {isOwner ? (
                  <>
                    {status === 'available' && (
                      <>
                        <button className="btn btn-primary" onClick={() => setEditing(true)}>
                          编辑
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => ownerAction('mark_sold')}
                        >
                          标记交易完成
                        </button>
                      </>
                    )}
                    {(status === 'sold' || status === 'expired') && (
                      <button
                        className="btn btn-primary"
                        onClick={() => {
                          const days = Number(
                            window.prompt(
                              `重新上架天数（${EXPIRE_OPTIONS.map((o) => o.days).join('/')}）`,
                              '15'
                            )
                          );
                          if ([7, 15, 30].includes(days)) ownerAction('relist', { days });
                        }}
                      >
                        重新上架
                      </button>
                    )}
                    <button className="btn btn-danger" onClick={handleDelete}>
                      删除
                    </button>
                  </>
                ) : (
                  <>
                    {canReserve && (
                      <button className="btn btn-primary" onClick={() => setShowReserveModal(true)}>
                        预约自提
                      </button>
                    )}
                    {data.myReservation && (
                      <button className="btn btn-outline" onClick={cancelMyReservation}>
                        {data.myReservation.status === 'pending'
                          ? '已预约（待确认）· 点击取消'
                          : data.myReservation.status === 'confirmed'
                            ? '预约已确认 · 点击取消'
                            : '取消预约'}
                      </button>
                    )}
                  </>
                )}
              </div>

              {!isOwner && status === 'available' && !isExpired && (
                <p className="hint" style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)' }}>
                  预约后卖家会收到你的申请并确认，线下当面交易，平台不经手资金
                </p>
              )}
            </>
          )}

          <div className="seller-card">
            <div className="avatar">{item.seller?.nickname?.[0] ?? '同'}</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 500 }}>
                {item.seller?.nickname ?? '同学'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                本校认证用户 · {item.seller?.email ?? ''}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isOwner && (data.reservations?.length ?? 0) > 0 && (
        <div className="card owner-panel" style={{ marginTop: 20 }}>
          <h2>预约申请（{data.reservations!.length}）</h2>
          {data.reservations!.map((r) => (
            <div key={r.id} className="reservation-item">
              <div>
                <div style={{ fontWeight: 500 }}>{r.buyer?.nickname ?? '同学'}</div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {r.note ? `留言：${r.note}` : '没有留言'} ·{' '}
                  {new Date(r.created_at).toLocaleString('zh-CN')}
                </div>
              </div>
              <div className="actions">
                {r.status === 'pending' && status === 'available' && (
                  <>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleReservation(r.id, 'confirm')}
                    >
                      确认预约
                    </button>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => handleReservation(r.id, 'cancel')}
                    >
                      拒绝
                    </button>
                  </>
                )}
                {r.status === 'confirmed' && (
                  <span className="tag tag-reserved">已确认</span>
                )}
                {r.status === 'cancelled' && (
                  <span className="tag tag-expired">已取消</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showReserveModal && (
        <div className="modal-mask" onClick={() => setShowReserveModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>预约自提</h3>
            <p style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 12 }}>
              向卖家「{item.seller?.nickname}」发起预约，建议留下你方便的时间和联系方式
            </p>
            <div className="field">
              <label>给卖家的留言</label>
              <textarea
                rows={3}
                maxLength={100}
                placeholder="例如：今晚 7 点后有空，可在宿舍楼下交易"
                value={reserveNote}
                onChange={(e) => setReserveNote(e.target.value)}
              />
            </div>
            {actionError && <p className="error-text">{actionError}</p>}
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setShowReserveModal(false)}>
                再想想
              </button>
              <button className="btn btn-primary" onClick={submitReservation} disabled={reserveBusy}>
                {reserveBusy ? '提交中…' : '提交预约'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
