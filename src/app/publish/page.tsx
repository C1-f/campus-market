'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CATEGORIES, EXPIRE_OPTIONS } from '@/lib/constants';

// 客户端图片压缩：最长边 800px、JPEG 0.8，通常压到 200KB 以内
async function compressImage(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const maxSide = 800;
  let { width, height } = bitmap;
  if (width > maxSide || height > maxSide) {
    const scale = maxSide / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.8)
  );
  if (!blob) throw new Error('图片压缩失败');
  return new File([blob], 'photo.jpg', { type: 'image/jpeg' });
}

export default function PublishPage() {
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string>(CATEGORIES[0].key);
  const [price, setPrice] = useState('');
  const [negotiable, setNegotiable] = useState(true);
  const [pickupLocation, setPickupLocation] = useState('');
  const [expireDays, setExpireDays] = useState(15);
  const [images, setImages] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (images.length >= 3) {
      setError('最多上传 3 张图片');
      return;
    }
    setError('');
    setUploading(true);
    try {
      const compressed = await compressImage(file);
      const formData = new FormData();
      formData.append('file', compressed);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '图片上传失败');
        return;
      }
      setImages((prev) => [...prev, data.url]);
    } catch {
      setError('图片处理失败，请换一张试试');
    } finally {
      setUploading(false);
    }
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    const priceNum = Number(price);
    if (isNaN(priceNum) || priceNum < 0) {
      setError('请填写合理的价格');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          category,
          price: priceNum,
          negotiable,
          pickup_location: pickupLocation,
          expire_days: expireDays,
          image_urls: images,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '发布失败');
        return;
      }
      router.push(`/item/${data.item.id}`);
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="form-page" style={{ maxWidth: 640 }}>
      <div className="card">
        <h1>发布闲置物品</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="title">标题 *</label>
            <input
              id="title"
              required
              minLength={2}
              maxLength={60}
              placeholder="例如：出考研数学一全套资料（九成新）"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="category">分类 *</label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="price">价格（元）*</label>
              <input
                id="price"
                type="number"
                required
                min="0"
                step="0.01"
                placeholder="0.00"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label htmlFor="expire">有效期 *</label>
              <select
                id="expire"
                value={expireDays}
                onChange={(e) => setExpireDays(Number(e.target.value))}
              >
                {EXPIRE_OPTIONS.map((o) => (
                  <option key={o.days} value={o.days}>
                    {o.label}后自动下架
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <div className="switch-row">
              <div>
                <span className="label-text">可议价</span>
                <span className="hint">
                  关闭则表示一口价，买家可直接按标价交易
                </span>
              </div>
              <button
                type="button"
                className={`toggle ${negotiable ? 'on' : ''}`}
                onClick={() => setNegotiable(!negotiable)}
                aria-label="切换可议价"
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="location">自提地点 *</label>
            <input
              id="location"
              required
              maxLength={50}
              placeholder="例如：东区 3 号宿舍楼下 / 图书馆门口"
              value={pickupLocation}
              onChange={(e) => setPickupLocation(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="description">物品描述</label>
            <textarea
              id="description"
              rows={4}
              maxLength={500}
              placeholder="成色、购买时间、出手原因…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="field">
            <label>图片（最多 3 张，会自动压缩）</label>
            <div className="upload-grid">
              {images.map((url, i) => (
                <div key={url} className="upload-slot filled">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`商品图 ${i + 1}`} />
                  <button
                    type="button"
                    className="remove"
                    onClick={() => removeImage(i)}
                    aria-label="移除图片"
                  >
                    ×
                  </button>
                </div>
              ))}
              {images.length < 3 && (
                <label className="upload-slot">
                  <span className="plus">+</span>
                  <span>{uploading ? '上传中…' : '上传图片'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    hidden
                    disabled={uploading}
                    onChange={handleImageChange}
                  />
                </label>
              )}
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}

          <button className="btn btn-primary btn-block" disabled={submitting || uploading}>
            {submitting ? '发布中…' : '发布'}
          </button>
          <p className="hint" style={{ textAlign: 'center', marginTop: 8 }}>
            发布后 {expireDays} 天未售出将自动下架，可随时重新上架
          </p>
        </form>
      </div>
    </div>
  );
}
