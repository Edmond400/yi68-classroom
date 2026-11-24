import { requireAdministrator } from '@/lib/administrator';
import { favoriteCharacterExtensions } from '@/lib/favorite-character-model';
import { readFavoriteCharacterImage } from '@/lib/favorite-character-survey';
import { fail, HttpError } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdministrator(request);
    const { id } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, '这张图片不存在。');
    const { body, mime, size } = await readFavoriteCharacterImage(id);
    return new Response(body, { headers: {
      'Content-Type': mime,
      'Content-Length': String(size),
      'Content-Disposition': `inline; filename="character.${favoriteCharacterExtensions[mime]}"`,
      'Cache-Control': 'private, no-store',
      'Cross-Origin-Resource-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'Vary': 'Cookie, Authorization',
    } });
  } catch (error) { return fail(error); }
}
