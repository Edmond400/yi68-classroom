import { administratorConfigured } from '@/lib/administrator';
import { AdministratorWorkspace } from '@/components/administrator-workspace';
export const dynamic='force-dynamic';
export const metadata={title:'生日问卷结果',robots:{index:false,follow:false}};
export default async function AdministrationPage(){return <AdministratorWorkspace configured={await administratorConfigured()} initialPage='birthdays'/>}
