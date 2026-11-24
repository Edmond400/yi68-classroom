import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';

export const dynamic = 'force-dynamic';
export const metadata = { title: '男生节征题管理', robots: { index: false, follow: false } };

export default async function BoysDayAdminPage() {
  return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="boysDay" />;
}
