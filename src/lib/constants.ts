// 全局常量：分类、邮箱准入、有效期选项

export const CATEGORIES = [
  { key: 'books', label: '书籍教材' },
  { key: 'exam', label: '考研资料' },
  { key: 'sports', label: '运动器材' },
  { key: 'dorm', label: '宿舍用品' },
  { key: 'electronics', label: '电子产品' },
  { key: 'other', label: '其他' },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]['key'];

export const CATEGORY_LABELS: Record<CategoryKey, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.key, c.label])
) as Record<CategoryKey, string>;

// 发布时可选的有效期（天）
export const EXPIRE_OPTIONS = [
  { days: 7, label: '7 天' },
  { days: 15, label: '15 天' },
  { days: 30, label: '30 天' },
] as const;

// 商品状态
export const ITEM_STATUS_LABELS: Record<string, string> = {
  available: '在售',
  reserved: '已被预约',
  sold: '已售出',
  expired: '已下架',
};

// 允许注册的学校邮箱后缀（服务端 API 会强制校验，前端只是体验优化）
export function getAllowedDomains(): string[] {
  return (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || '')
    .split(',')
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
}

export function isSchoolEmail(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() || '';
  return getAllowedDomains().includes(domain);
}
