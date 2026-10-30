import { database } from '@/lib/data';
import { json } from '@/lib/http';
export const dynamic = 'force-dynamic';
export async function GET() { try { await database().prepare('SELECT 1').first(); return json({ ok: true }); } catch { return json({ ok: false }, 503); } }
