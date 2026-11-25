import { favoriteCharacterMaxBytes, favoriteCharacterNameLimit, favoriteCharacterPath, favoriteCharacterRoleLimit, type FavoriteCharacterSurvey } from './favorite-character-model';

type Page = { requestKey?: string; fields?: { name: string; character: string }; error?: string; submitted?: boolean; maxBytes?: number; paused?: boolean };
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (value = '') => value.replace(/[&<>"']/g, char => entities[char]);

export function favoriteCharacterHtml(survey: FavoriteCharacterSurvey, page: Page = {}) {
  const content = page.submitted ? `<section class="card" role="status"><h2>已收到，谢谢你！</h2><p>你的图片和姓名已提交。</p><p><a href="/">返回班级服务站</a></p></section>`
    : !survey.open ? '<p class="card" role="status">当前未开放收集。请留意班群通知。</p>'
    : page.paused ? '<p class="card" role="status">图片上传暂时不可用，请稍后再试。</p>'
    : `<form class="card" action="${favoriteCharacterPath}" method="post" enctype="multipart/form-data" accept-charset="UTF-8">
      <input type="hidden" name="request_key" value="${escape(page.requestKey)}">
      <label for="name">你的姓名 <small>必填</small></label>
      <input id="name" name="name" autocomplete="name" maxlength="${favoriteCharacterNameLimit}" value="${escape(page.fields?.name)}" required>
      <label for="image">角色或人物图片 <small>必填</small></label>
      <p class="hint" id="image-hint">${escape(survey.imageHint)} 单张图片最多 ${(page.maxBytes ?? favoriteCharacterMaxBytes) / (1024 * 1024)} MB。</p>
      <input id="image" name="image" type="file" accept="image/jpeg,image/png,image/webp" aria-describedby="image-hint" required>
      <label for="character">角色名或作品名 <small>选填</small></label>
      <input id="character" name="character" maxlength="${favoriteCharacterRoleLimit}" value="${escape(page.fields?.character)}">
      ${page.error ? `<p class="error" role="alert">${escape(page.error)}</p>` : ''}
      <button type="submit">提交图片</button>
    </form>`;
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>${escape(survey.title)}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f9f6fb;color:#30263a;font:1rem/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:40rem;margin:auto;padding:2rem 1rem 2.5rem}header{margin-bottom:1.25rem}h1{color:#402651;font-size:1.65rem;line-height:1.35;margin:.5rem 0 .75rem}h2{margin:0 0 .5rem;font-size:1.3rem}p{margin:0 0 .6rem;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#613979}.eyebrow{color:#624773;font-size:.875rem;font-weight:600;letter-spacing:.06em}.notice,.hint{font-size:.9rem;color:#60556a}.notice{margin-top:.8rem}.card{background:white;border:1px solid #e3d8e9;border-radius:.75rem;padding:1.15rem;margin:0}label{display:block;font-weight:600;margin:1rem 0 .35rem}label:first-of-type{margin-top:0}small{font-size:.875rem;font-weight:400;color:#6e6076}input:not([type=hidden]){display:block;width:100%;min-height:2.75rem;padding:.6rem .7rem;border:1px solid #d9cade;border-radius:.45rem;background:#fff;color:inherit;font:inherit}input[type=file]{font-size:.9rem}button{width:100%;min-height:2.75rem;margin-top:1.15rem;border:0;border-radius:.45rem;background:#66417b;color:white;font:inherit;font-weight:600}.error{color:#8b2435;background:#fff1f3;border-radius:.4rem;padding:.65rem;margin-top:.9rem}:focus-visible{outline:2px solid #694484;outline-offset:2px}
</style><script defer src="/telemetry.js"></script></head><body><main><header><p class="eyebrow">艺68班级服务站 · 无需登录</p><h1>${escape(survey.title)}</h1>
<p>${escape(survey.description)}</p><p class="notice">现场只展示图片；姓名只供班长在后台核对，不会公开。</p></header>${content}</main></body></html>`;
}
