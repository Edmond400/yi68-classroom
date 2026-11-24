import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';

export const dynamic = 'force-dynamic';
export const metadata = { title: '角色图片征集管理', robots: { index: false, follow: false } };

export default async function FavoriteCharacterAdminPage() {
  return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="favoriteCharacter" />;
}
