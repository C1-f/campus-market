'use client';

import { useState } from 'react';
import Link from 'next/link';

const DOMAINS = (process.env.NEXT_PUBLIC_ALLOWED_EMAIL_DOMAINS || 'stu.example.edu.cn')
  .split(',')
  .map((d) => d.trim())
  .filter(Boolean);

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    // 前端先做校园邮箱后缀校验（服务端 API 会再次强制校验）
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (!DOMAINS.includes(domain)) {
      setError(`仅支持本校邮箱注册（@${DOMAINS.join('、@')}）`);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, nickname }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }
      // 注册成功 -> 去登录
      window.location.href = '/login';
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form-page">
      <div className="card">
        <h1>注册账号</h1>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="email">学校邮箱</label>
            <input
              id="email"
              type="email"
              required
              placeholder={`you@${DOMAINS[0] || 'stu.example.edu.cn'}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <p className="hint">
              平台仅面向本校学生，注册邮箱后缀必须为：{DOMAINS.map((d) => `@${d}`).join('、')}
            </p>
          </div>
          <div className="field">
            <label htmlFor="nickname">昵称</label>
            <input
              id="nickname"
              required
              minLength={2}
              maxLength={20}
              placeholder="怎么称呼你？（2-20 字）"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              placeholder="至少 6 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <p className="error-text">{error}</p>}
          <button className="btn btn-primary btn-block" disabled={loading}>
            {loading ? '注册中…' : '注册'}
          </button>
        </form>
        <p className="auth-switch">
          已有账号？<Link href="/login">直接登录 →</Link>
        </p>
      </div>
    </div>
  );
}
