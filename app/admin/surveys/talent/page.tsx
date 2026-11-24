import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';
export const dynamic = 'force-dynamic';
export const metadata = {title:'才艺表演报名管理',robots:{index:false,follow:false}};
export default async function TalentAdminPage() {
  return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="talent"/>;
}
