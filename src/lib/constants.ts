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

// 用户角色
export const ROLE_LABELS: Record<string, string> = {
  user: '普通用户',
  admin: '管理员',
  super_admin: '超级管理员',
};

// 管理操作类型（写入日志表）
export const ADMIN_ACTIONS: Record<string, string> = {
  takedown_item: '下架商品',
  restore_item: '恢复上架',
  delete_item: '删除商品',
  ban_user: '封禁用户',
  unban_user: '解封用户',
  promote_admin: '授予管理员',
  demote_admin: '撤销管理员',
  approve_application: '通过管理员申请',
  reject_application: '拒绝管理员申请',
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
