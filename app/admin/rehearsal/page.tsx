import {administratorConfigured} from '@/lib/administrator';
import {RehearsalManagement} from '@/components/rehearsal/management';
export const dynamic='force-dynamic';
export const metadata={title:'模拟汇报编排工作台',robots:{index:false,follow:false}};
export default async function Page(){return <RehearsalManagement configured={await administratorConfigured()}/>}
