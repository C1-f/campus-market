// 数据模型类型定义（与 supabase/schema.sql 对应）

export type ItemStatus = 'available' | 'reserved' | 'sold' | 'expired';
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';

// 用户角色：普通用户 / 管理员（由超级管理员审批晋升）/ 超级管理员（系统内置，唯一最高权限）
export type UserRole = 'user' | 'admin' | 'super_admin';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface Profile {
  id: string;
  email: string;
  nickname: string;
  role?: UserRole;
  is_banned?: boolean;
  created_at: string;
}

export interface Item {
  id: string;
  seller_id: string;
  title: string;
  description: string;
  category: string;
  price: number;
  negotiable: boolean;
  status: ItemStatus;
  image_urls: string[];
  pickup_location: string;
  created_at: string;
  expires_at: string;
  // 联表查询时附带
  seller?: Profile;
}

export interface Favorite {
  user_id: string;
  item_id: string;
  created_at: string;
}

export interface Reservation {
  id: string;
  item_id: string;
  buyer_id: string;
  note: string;
  status: ReservationStatus;
  created_at: string;
  buyer?: Profile;
  item?: Item;
}

// 管理员申请：普通用户提交 -> 超级管理员审批
export interface AdminApplication {
  id: string;
  user_id: string;
  reason: string;
  status: ApplicationStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
  applicant?: Profile;
  reviewer?: Profile;
}

// 管理操作日志（审计用）
export interface AdminLog {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string;
  note: string;
  created_at: string;
  admin?: Profile;
}

// API 统一响应格式
export interface ApiError {
  error: string;
}
