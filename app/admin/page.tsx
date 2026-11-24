import { administratorConfigured } from '@/lib/administrator';
import { AdministratorWorkspace } from '@/components/administrator-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'班务管理',robots:{index:false,follow:false}};
export default async function AdministrationPage(){return <AdministratorWorkspace configured={await administratorConfigured()} initialPage='class'/>}
