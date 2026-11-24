export const favoriteCharacterPath = '/survey/favorite-character';
export const favoriteCharacterAdminApi = '/api/admin/surveys/favorite-character';
export const favoriteCharacterMaxBytes = 5 * 1024 * 1024;
export const favoriteCharacterObjectMaxBytes = 30 * 1024 * 1024;
export const favoriteCharacterNameLimit = 40;
export const favoriteCharacterRoleLimit = 120;

export const favoriteCharacterExtensions = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
} as const;
export type FavoriteCharacterMime = keyof typeof favoriteCharacterExtensions;

export type FavoriteCharacterSurvey = { open: boolean; title: string; description: string; imageHint: string };
export const defaultFavoriteCharacterSurvey: FavoriteCharacterSurvey = {
  open: false,
  title: '艺68｜喜欢的角色或人物征集',
  description: '选一个你喜欢的角色或人物，上传一张你觉得最能代表 TA 的图。动漫、游戏、影视角色都可以，喜欢的公众人物也行。截图也可以，清楚就行！',
  imageHint: '一人交一张。支持 JPG、PNG、WebP。',
};

export type FavoriteCharacterResponse = {
  id: string;
  name: string;
  character: string;
  mime: FavoriteCharacterMime;
  size: number;
  created_at: string;
};

export function favoriteCharacterFilename(index: number, mime: FavoriteCharacterMime) {
  return `${String(index).padStart(3, '0')}.${favoriteCharacterExtensions[mime]}`;
}
