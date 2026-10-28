'use client';

import { useEffect, useState, useCallback } from 'react';
import ItemCard from '@/components/ItemCard';
import { CATEGORIES } from '@/lib/constants';
import type { Item } from '@/lib/types';

interface ListResponse {
  items: Item[];
  total: number;
  page: number;
  pageSize: number;
}

// 首页：商品列表 + 分类筛选 + 关键词搜索 + 分页
export default function HomePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState('all');
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const pageSize = 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const fetchItems = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ category, q: keyword, page: String(page) });
      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '加载失败');
        setItems([]);
        return;
      }
      const list = data as ListResponse;
      setItems(list.items);
      setTotal(list.total);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [category, keyword, page]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  function handleSearch() {
    setPage(1);
    setKeyword(searchInput.trim());
  }

  return (
    <>
      <section className="hero">
        <h1>校园闲置物品精准流转平台</h1>
        <p>只面向本校学生 · 预约自提 · 到期自动下架 · 交易透明可追溯</p>
      </section>

      <div className="filter-bar">
        <input
          className="search-input"
          placeholder="搜索：考研资料、球拍、电动车…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
        />
        <button className="btn btn-primary" onClick={handleSearch}>
          搜索
        </button>
      </div>

      <div className="filter-bar">
        <button
          className={`chip ${category === 'all' ? 'active' : ''}`}
          onClick={() => {
            setCategory('all');
            setPage(1);
          }}
        >
          全部
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.key}
            className={`chip ${category === c.key ? 'active' : ''}`}
            onClick={() => {
              setCategory(c.key);
              setPage(1);
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">正在加载…</div>
      ) : error ? (
        <div className="empty-state">
          <p>{error}</p>
          <p style={{ fontSize: 13, marginTop: 8 }}>
            提示：需要先配置 Supabase 环境变量并执行 schema.sql，详见项目 README
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 40, marginBottom: 8 }}>🗃️</p>
          <p>这个分类还没有闲置物品</p>
          <a href="/publish" style={{ color: 'var(--primary)' }}>
            来发布第一件 →
          </a>
        </div>
      ) : (
        <>
          <div className="item-grid">
            {items.map((item) => (
              <ItemCard key={item.id} item={item} />
            ))}
          </div>
          {totalPages > 1 && (
            <div className="pagination">
              <button
                className="btn btn-outline btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                上一页
              </button>
              <span>
                第 {page} / {totalPages} 页 · 共 {total} 件
              </span>
              <button
                className="btn btn-outline btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(page + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}
