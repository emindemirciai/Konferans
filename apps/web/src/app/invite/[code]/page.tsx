import { LoginCard } from '@/components/LoginCard';

type InvitePageParams = { code: string };

export default async function InvitePage({ params }: { params: InvitePageParams | Promise<InvitePageParams> }) {
  const resolvedParams = await params;
  const inviteCode = decodeURIComponent(resolvedParams.code ?? '').trim();

  return (
    <main className="login-page">
      <div>
        <p className="invite-code-note">Davet kodu algılandı: <strong>{inviteCode}</strong></p>
        <LoginCard defaultInviteCode={inviteCode} />
      </div>
    </main>
  );
}
