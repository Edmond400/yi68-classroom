import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';
export const dynamic = 'force-dynamic';
export const metadata = { title: '男生节饮品订单', robots: { index: false, follow: false } };
export default async function DrinkAdminPage() { return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="drinks" />; }
