import { EmbedJoin } from '@/components/EmbedJoin';

export default function EmbedPage({ params }: { params: { serverId: string } }) {
  return <EmbedJoin serverId={params.serverId} />;
}
