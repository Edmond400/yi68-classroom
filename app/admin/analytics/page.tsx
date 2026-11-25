import {administratorConfigured} from '@/lib/administrator';
import {AdministratorWorkspace} from '@/components/administrator-workspace';
export const dynamic='force-dynamic';
export default async function Page(){return <AdministratorWorkspace configured={await administratorConfigured()} initialPage='analytics'/>}
