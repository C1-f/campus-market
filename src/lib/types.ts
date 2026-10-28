// 数据模型类型定义（与 supabase/schema.sql 对应）

export type ItemStatus = 'available' | 'reserved' | 'sold' | 'expired';
export type ReservationStatus = 'pending' | 'confirmed' | 'cancelled';

export interface Profile {
  id: string;
  email: string;
  nickname: string;
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

// API 统一响应格式
export interface ApiError {
  error: string;
}
