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
  const normalizedInviteCode = defaultInviteCode.trim();
  const [mode, setMode] = useState<Mode>(normalizedInviteCode ? 'register' : 'login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [inviteCode, setInviteCode] = useState(normalizedInviteCode);
  const [verifyCode, setVerifyCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [googleClientId, setGoogleClientId] = useState('');
  const [googleButtonReady, setGoogleButtonReady] = useState(false);

  useEffect(() => {
    if (!normalizedInviteCode) return;
    setInviteCode(normalizedInviteCode);
    setMode('register');
  }, [normalizedInviteCode]);

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
      if (cancelled || !window.google?.accounts?.id) return;
      const buttonTarget = document.getElementById('google-button');
      if (!buttonTarget) return;

      buttonTarget.innerHTML = '';
      window.google.accounts.id.initialize({
        client_id: googleClientId,
        callback: async (response: any) => {
          try {
            setError('');
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
      window.google.accounts.id.renderButton(buttonTarget, {
        theme: 'filled_black',
        size: 'large',
        text: 'continue_with',
        shape: 'pill',
        width: Math.min(360, buttonTarget.clientWidth || 360),
      });
      setGoogleButtonReady(true);
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
      existingScript.addEventListener('error', () => setGoogleButtonReady(false), { once: true });
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
    script.onerror = () => {
      if (!cancelled) setGoogleButtonReady(false);
    };
    document.body.appendChild(script);

    return () => {
      cancelled = true;
      script.onload = null;
      script.onerror = null;
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

  function handleGoogleFallback() {
    setError('');
    if (!googleClientId) {
      setError('Google girişi için istemci kimliği bulunamadı. Sunucu ayarlarını kontrol et.');
      return;
    }
    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      setMessage('Google hesabını seçebilirsin.');
      return;
    }
    setMessage('Google girişi yükleniyor. Birkaç saniye sonra tekrar dene.');
  }

  function toggleMode() {
    setError('');
    setMessage('');
    setMode(mode === 'login' ? 'register' : 'login');
  }

  return (
    <div className="login-card">
      <h1>Konferans</h1>
      <p>Oyuncular için hafif, hızlı, ses/video ve ekran paylaşımı odaları.</p>

      {mode !== 'login' && (
        <div className="field">
          <label>Davet kodu</label>
          <input value={inviteCode} onChange={(event) => setInviteCode(event.target.value)} placeholder="KF-..." />
        </div>
      )}
      {mode === 'register' && (
        <div className="field">
          <label>Ad</label>
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Adın" />
        </div>
      )}
      <div className="field">
        <label>E-posta</label>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="mail@example.com" />
      </div>
      {mode !== 'verify' && (
        <div className="field">
          <label>Şifre</label>
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" placeholder="En az 8 karakter" />
        </div>
      )}
      {mode === 'verify' && (
        <div className="field">
          <label>Doğrulama kodu</label>
          <input value={verifyCode} onChange={(event) => setVerifyCode(event.target.value)} placeholder="6 haneli kod" />
        </div>
      )}

      {error && <p className="error">{error}</p>}
      {message && <p className="success">{message}</p>}
      <button className="primary" style={{ width: '100%', marginTop: 10 }} onClick={submit}>
        {mode === 'login' ? 'Giriş yap' : mode === 'register' ? 'Kayıt ol' : 'Doğrula'}
      </button>

      <div className="google-login-block">
        <div id="google-button" className={`google-button-slot ${googleButtonReady ? '' : 'is-hidden'}`} />
        {!googleButtonReady && (
          <button className="secondary google-fallback-button" type="button" onClick={handleGoogleFallback}>
            Google ile bağlan
          </button>
        )}
      </div>

      <button className="secondary" style={{ width: '100%', marginTop: 14 }} onClick={toggleMode}>
        {mode === 'login' ? 'Davet kodum var, kayıt olmak istiyorum' : 'Giriş ekranına dön'}
      </button>
    </div>
  );
}
