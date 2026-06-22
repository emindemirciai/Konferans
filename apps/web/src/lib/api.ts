export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export type ApiOptions = RequestInit & { token?: string };

export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);
  const res = await fetch(`${API_URL}/api${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'API error');
  return data as T;
}

export function getToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('letsmeet_token');
}

export function setToken(token: string) {
  localStorage.setItem('letsmeet_token', token);
}

export function clearToken() {
  localStorage.removeItem('letsmeet_token');
}
