import {handleRehearsal} from '@/lib/rehearsal/service';
export const dynamic='force-dynamic';
type Context={params:Promise<{path?:string[]}>};
export async function GET(request:Request,context:Context){return handleRehearsal(request,(await context.params).path||[])}
export const HEAD=GET;
export const POST=GET;
