import { requireAdministrator } from '@/lib/administrator';
import { boysDaySettingsInput, readBoysDayResponses, readBoysDaySurvey, saveBoysDaySurvey } from '@/lib/boys-day-survey';
import { fail, json, readJson } from '@/lib/http';
import { validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    const [survey, responses] = await Promise.all([readBoysDaySurvey(), readBoysDayResponses()]);
    return json({ survey, responses });
  } catch (error) {
    return fail(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdministrator(request);
    const survey = validate(boysDaySettingsInput, await readJson(request));
    await saveBoysDaySurvey(survey);
    return json({ survey });
  } catch (error) {
    return fail(error);
  }
}
