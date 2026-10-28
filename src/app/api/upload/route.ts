import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_SIZE = 1024 * 1024; // 1MB（客户端已压缩，这里兜底）

// 上传商品图片到 Supabase Storage（需登录）
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }

    const ext = ALLOWED_TYPES[file.type];
    if (!ext) {
      return NextResponse.json({ error: '仅支持 JPG/PNG/WebP 图片' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ error: '图片不能超过 1MB，请压缩后上传' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const path = `items/${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;

    const admin = createAdminClient();
    const { error } = await admin.storage.from('item-images').upload(path, buffer, {
      contentType: file.type,
      upsert: false,
    });
    if (error) {
      console.error('upload error', error);
      return NextResponse.json({ error: '上传失败：' + error.message }, { status: 500 });
    }

    const {
      data: { publicUrl },
    } = admin.storage.from('item-images').getPublicUrl(path);

    return NextResponse.json({ url: publicUrl });
  } catch (e) {
    console.error('upload error', e);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
