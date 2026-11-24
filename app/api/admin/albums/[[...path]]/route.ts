import { albumGet,albumPost } from '@/lib/albums';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{path?:string[]}>}){return albumGet(request,(await params).path||[],true)}
export async function POST(request:Request,{params}:{params:Promise<{path?:string[]}>}){return albumPost(request,(await params).path||[])}
