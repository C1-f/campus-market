'use client';

// 退出登录按钮（客户端组件）
export default function LogoutButton() {
  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/';
  }

  return (
    <button className="link" onClick={handleLogout}>
      退出
    </button>
  );
}
