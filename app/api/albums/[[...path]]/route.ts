import { albumGet,albumStudentPost } from '@/lib/albums';
export const dynamic='force-dynamic';
export async function GET(request:Request,{params}:{params:Promise<{path?:string[]}>}){return albumGet(request,(await params).path||[])}
export async function POST(request:Request,{params}:{params:Promise<{path?:string[]}>}){return albumStudentPost(request,(await params).path||[])}
