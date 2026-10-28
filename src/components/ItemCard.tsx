import Link from 'next/link';
import type { Item } from '@/lib/types';
import { CATEGORY_LABELS, ITEM_STATUS_LABELS } from '@/lib/constants';

// 商品卡片：首页 / 收藏列表共用
export default function ItemCard({ item }: { item: Item }) {
  const expired =
    item.status === 'available' && new Date(item.expires_at) <= new Date();
  const status = expired ? 'expired' : item.status;
  const daysLeft = Math.max(
    0,
    Math.ceil((new Date(item.expires_at).getTime() - Date.now()) / 86400000)
  );

  return (
    <Link href={`/item/${item.id}`} className="item-card">
      <div className="item-thumb">
        {item.image_urls && item.image_urls.length > 0 ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.image_urls[0]} alt={item.title} loading="lazy" />
        ) : (
          <div className="placeholder">📦</div>
        )}
      </div>
      <div className="item-body">
        <div className="item-title">{item.title}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <span className="tag tag-category">
            {CATEGORY_LABELS[item.category as keyof typeof CATEGORY_LABELS] ??
              item.category}
          </span>
          {status === 'available' ? (
            <span className={`tag ${item.negotiable ? 'tag-negotiable' : 'tag-fixed'}`}>
              {item.negotiable ? '可议价' : '不议价'}
            </span>
          ) : (
            <span
              className={`tag ${
                status === 'sold'
                  ? 'tag-sold'
                  : status === 'reserved'
                    ? 'tag-reserved'
                    : 'tag-expired'
              }`}
            >
              {ITEM_STATUS_LABELS[status]}
            </span>
          )}
        </div>
        <div className="item-meta">
          <span className="item-price">{item.price}</span>
          {status === 'available' && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {daysLeft} 天后到期
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
