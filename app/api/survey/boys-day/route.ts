import { rateLimit } from '@/lib/administrator';
import { boysDayResponseInput, recordBoysDayResponse } from '@/lib/boys-day-survey';
import { fail, json, readJson } from '@/lib/http';
import { validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const response = validate(boysDayResponseInput, await readJson(request));
    await rateLimit(request, 'boys-day-submit', 100);
    await recordBoysDayResponse(response);
    return json({ ok: true });
  } catch (error) {
    return fail(error);
  }
}
