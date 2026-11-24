import { AdministratorWorkspace } from '@/components/administrator-workspace';
import { administratorConfigured } from '@/lib/administrator';
export const dynamic='force-dynamic';
export const metadata={title:'班级相册管理',robots:{index:false,follow:false}};
export default async function AlbumsAdminPage(){return <AdministratorWorkspace configured={await administratorConfigured()} initialPage="albums"/>}
