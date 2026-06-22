import { LoginCard } from '@/components/LoginCard';

export default function InvitePage({ params }: { params: { code: string } }) {
  return (
    <main className="login-page">
      <div>
        <p style={{ color: 'var(--muted)', textAlign: 'center' }}>Davet kodu: <strong>{params.code}</strong></p>
        <LoginCard defaultInviteCode={params.code} />
      </div>
    </main>
  );
}
