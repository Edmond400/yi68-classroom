import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';
export const dynamic = 'force-dynamic';
export const metadata = { title: '现场点歌管理', robots: { index: false, follow: false } };
export default async function SongRequestsAdminPage() {
  return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="songs"/>;
}
