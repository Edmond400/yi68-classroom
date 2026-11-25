import {requireAdministrator} from '@/lib/administrator';
import {isAcceptanceRequest} from '@/lib/site-telemetry';
import {fail,HttpError,sameOrigin} from '@/lib/http';
export const dynamic='force-dynamic';
// Disabled outside the short-lived CI acceptance window. No business state is changed.
export async function POST(request:Request){try{await requireAdministrator(request);sameOrigin(request);if(!await isAcceptanceRequest(request))throw new HttpError(403,'验收检查未启用。');throw new Error('controlled_acceptance_error')}catch(error){return fail(error)}}
