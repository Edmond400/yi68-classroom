import { database } from '@/lib/data';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() { try { await database().prepare('SELECT 1').first(); const last=await database().prepare("SELECT value FROM settings WHERE key='incentive_cron_last_success'").first<{value:string}>(); return json({ ok: true, version:'participation-v1',scheduled_last_success:last?.value??null }); } catch { return json({ ok: false }, 503); } }
