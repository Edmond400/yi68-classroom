import { boysDayResponseLimits, boysDaySurveyPath, type BoysDaySurvey } from './boys-day-survey-model';

type Fields = { name?: string; pairs?: string; introduction?: string };
type SurveyPage = {
  requestKey?: string;
  fields?: Fields;
  error?: string;
  submitted?: boolean;
  preview?: boolean;
};

const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (value = '') => value.replace(/[&<>"']/g, char => entities[char]);

export function boysDaySurveyHtml({ copy, open }: BoysDaySurvey, page: SurveyPage = {}) {
  const text = Object.fromEntries(Object.entries(copy).map(([key, value]) => [key, escapeHtml(value)]));
  const fields = page.fields ?? {};
  const hint = (content: string) => content ? `<p class="hint">${content}</p>` : '';
  let content;
  if (page.submitted) {
    content = `<section class="card"><h2>${text.successTitle}</h2>${hint(text.successText)}<p><a href="/">返回班级服务站</a></p></section>`;
  } else if (!open) {
    content = `<p class="card message">${text.closedText}</p>`;
  } else {
    content = `<form class="card" action="${boysDaySurveyPath}" method="post" accept-charset="UTF-8">
      <fieldset${page.preview ? ' disabled' : ''}>
        <input type="hidden" name="request_key" value="${escapeHtml(page.requestKey)}">
        <label for="name">${text.nameLabel}<small>必填</small></label>
        ${hint(text.nameHint)}
        <input id="name" name="name" required autocomplete="name" maxlength="${boysDayResponseLimits.name}" value="${escapeHtml(fields.name)}">
        <label for="pairs">${text.pairsLabel}<small>选填</small></label>
        ${hint(text.pairsHint)}
        <textarea id="pairs" name="pairs" rows="4" maxlength="${boysDayResponseLimits.pairs}" placeholder="${text.pairsExample}">${escapeHtml(fields.pairs)}</textarea>
        <label for="introduction">${text.introductionLabel}<small>选填</small></label>
        ${hint(text.introductionHint)}
        <input id="introduction" name="introduction" maxlength="${boysDayResponseLimits.introduction}" value="${escapeHtml(fields.introduction)}">
        ${page.error ? `<p role="alert" class="error">${escapeHtml(page.error)}</p>` : ''}
        <button type="submit">${text.submitLabel}</button>
      </fieldset>
    </form>`;
  }

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${text.title}</title><style>
*{box-sizing:border-box}body{margin:0;background:#f9f6fb;color:#30263a;font:16px/1.6 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}main{max-width:660px;margin:auto;padding:28px 16px 36px}header{margin:0 0 20px}h1{font-size:26px;line-height:1.4;margin:0 0 12px;color:#402651}h2{font-size:21px;margin:0}p{margin:0}a{color:#613979}.message,.hint,.error{white-space:pre-wrap;overflow-wrap:break-word}.badge{margin-top:12px;color:#624773;font-size:13px}.card{background:#fff;border:1px solid #e3d8e9;border-radius:12px;padding:20px}fieldset{min-width:0;margin:0;padding:0;border:0}label{display:block;font-size:16px;font-weight:600;margin-top:18px}label:first-of-type{margin-top:0}small{margin-left:8px;font-size:12px;font-weight:400;color:#6e6076}.hint{font-size:14px;color:#60556a;margin:3px 0}input:not([type=hidden]),textarea{display:block;width:100%;margin:8px 0 0;padding:9px 12px;border:1px solid #d9cade;border-radius:7px;background:#fff;color:inherit;font:inherit}textarea{resize:vertical}button{width:100%;margin-top:20px;padding:12px;border:0;border-radius:7px;background:#66417b;color:#fff;font:inherit;font-weight:600}button:disabled{opacity:.55}.error{color:#8b2435;background:#fff1f3;border-radius:6px;padding:10px;margin-top:14px}
</style></head><body><main>
<header><h1>${text.title}</h1><p class="message">${text.description}</p><p class="badge">无需登录 · 投稿仅管理员可查看</p></header>
${content}</main></body></html>`;
}
