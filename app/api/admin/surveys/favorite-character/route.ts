import { requireAdministrator } from '@/lib/administrator';
import { favoriteCharacterSettingsInput, readFavoriteCharacterResponses, readFavoriteCharacterSurvey, saveFavoriteCharacterSurvey } from '@/lib/favorite-character-survey';
import { fail, json, readJson } from '@/lib/http';
import { validate } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdministrator(request);
    const [survey, responses] = await Promise.all([readFavoriteCharacterSurvey(), readFavoriteCharacterResponses()]);
    return json({ survey, responses });
  } catch (error) { return fail(error); }
}

export async function POST(request: Request) {
  try {
    await requireAdministrator(request);
    const survey = validate(favoriteCharacterSettingsInput, await readJson(request));
    await saveFavoriteCharacterSurvey(survey);
    return json({ survey });
  } catch (error) { return fail(error); }
}
