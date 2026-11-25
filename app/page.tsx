import {getPublicData} from '@/lib/data';
import {publicHomeConfig} from '@/lib/home-config';
import {HomeBoard} from '@/components/home-board';
import {Unavailable} from '@/components/public-ui';
export const dynamic='force-dynamic';
export default async function Home(){try{const [data,config]=await Promise.all([getPublicData(),publicHomeConfig()]);return <HomeBoard data={data} config={config} now={Date.now()}/>;}catch{console.error('public-data-unavailable');return <Unavailable/>}}
