'use client';

import { useEffect, useState } from 'react';
import { api, setToken } from '@/lib/api';

declare global {
  interface Window {
    google?: any;
  }
}

type Mode = 'login' | 'register' | 'verify';

export function LoginCard({ defaultInviteCode = '' }: { defaultInviteCode?: string }) {
  const [mode, setMode] = useState<Mode>(defaultInviteCode ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState(defaultInviteCode);
  const [verifyCode, setVerifyCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');

  useEffect(() => {
    let cancelled = false;
    const publicClientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (publicClientId) {
      setGoogleClientId(publicClientId);
      return;
    }
    api<{ googleClientId?: string }>('/config')
      .then((config) => {
        if (!cancelled && config.googleClientId) setGoogleClientId(config.googleClientId);
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!googleClientId) return;
    let cancelled = false;
    const renderGoogleButton = () => {
      if (cancelled) return;
      const buttonTarget = document.getElementById('google-button');
      if (!buttonTarget) return;
      buttonTarget.innerHTML = '';
      window.google?.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          try {
            const data = await api<{ token: string }>('/auth/google', {
              method: 'POST',
              body: JSON.stringify({ credential: response.credential, inviteCode: inviteCode || undefined }),
            });
            setToken(data.token);
            window.location.href = '/app';
          } catch (err: any) {
            setError(err.message);
          }
        },
      });
      window.google?.accounts.id.renderButton(buttonTarget, { theme: 'filled_black', size: 'large', width: Math.min(360, buttonTarget.clientWidth || 360) });
    };

    if (window.google?.accounts?.id) {
      renderGoogleButton();
      return () => {
        cancelled = true;
      };
    }

    const existingScript = document.getElementById('google-identity-script') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', renderGoogleButton, { once: true });
      return () => {
        cancelled = true;
        existingScript.removeEventListener('load', renderGoogleButton);
      };
    }

    const script = document.createElement('script');
    script.id = 'google-identity-script';
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = renderGoogleButton;
    document.body.appendChild(script);
    return () => {
      cancelled = true;
      script.onload = null;
    };
  }, [googleClientId, inviteCode]);

  async function submit() {
    setError('');
    setMessage('');
    try {
      if (mode === 'login') {
        const data = await api<{ token: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
        setToken(data.token);
        window.location.href = '/app';
      } else if (mode === 'register') {
        await api('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, name, inviteCode: inviteCode || undefined }) });
        setMode('verify');
        setMessage('Kayıt açıldı. E-posta doğrulama kodunu gir. SMTP kapalıysa kod API logunda görünür.');
      } else {
        await api('/auth/verify-email', { method: 'POST', body: JSON.stringify({ email, code: verifyCode }) });
        setMode('login');
        setMessage('E-posta doğrulandı. Şimdi giriş yapabilirsin.');
      }
    } catch (err: any) {
      setError(err.message);
    }
  }

  return (
    <div className="login-card">
      <h1>Konferans</h1>
      <p>Oyuncular için hafif, hızlı, ses/video ve ekran paylaşımı odaları.</p>

      {mode !== 'login' && (
        <div className="field">
          <label>Davet kodu</label>
          <input value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} placeholder="KF-..." />
        </div>
      )}
      {mode === 'register' && (
        <div className="field">
          <label>Ad</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Adın" />
        </div>
      )}
      <div className="field">
        <label>E-posta</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="mail@example.com" />
      </div>
      {mode !== 'verify' && (
        <div className="field">
          <label>Şifre</label>
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="En az 8 karakter" />
        </div>
      )}
      {mode === 'verify' && (
        <div className="field">
          <label>Doğrulama kodu</label>
          <input value={verifyCode} onChange={(e) => setVerifyCode(e.target.value)} placeholder="6 haneli kod" />
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <button className="primary" style={{ width: '100%', marginTop: 10 }} onClick={submit}>
        {mode === 'login' ? 'Giriş yap' : mode === 'register' ? 'Kayıt ol' : 'Doğrula'}
      </button>

      <div style={{ display: 'grid', placeItems: 'center', marginTop: 14 }} id="google-button" />

      <button className="secondary" style={{ width: '100%', marginTop: 14 }} onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
        {mode === 'login' ? 'Davet kodum var, kayıt olmak istiyorum' : 'Giriş ekranına dön'}
      </button>
    </div>
  );
}
