import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';
export const dynamic = 'force-dynamic';
export const metadata = { title: '素描作业登记', robots: { index: false, follow: false } };
export default async function HomeworkAdminPage() { return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="sketchHomework"/>; }
