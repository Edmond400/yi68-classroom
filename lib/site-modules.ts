// Stable IDs are shared by the homepage and all telemetry producers.
export const siteModules = [
 ['home','/','首页','班级近况与公共服务','打开首页',false],
 ['sketch_homework','/sketch-homework','素描作业','查看已交老师的同学、张数及全班进度。','查看上交进度',true],
 ['color_homework','/color-homework','色彩作业','查看作业移交老师的实际进度。','查看进度',true],
 ['albums','/albums','公共相册','课堂、工坊与每一次相聚。','查看相册',true],
 ['songs','/song-request','现场点歌','填写歌名，分享你想听的歌。','提交点歌',false],
 ['talent','/survey/talent','才艺表演报名','登记想要表演的节目。','提交报名',false],
 ['drinks','/survey/drinks','男生节饮品预订','确认活动饮品与口味。','填写预订',false],
 ['birthday','/survey/birthday','生日信息登记','公历生日与集体生日意愿。','前往填写',false],
 ['character','/survey/favorite-character','图片征集','分享喜欢的角色与图片。','参与征集',false],
 ['boys_day','/survey/boys-day','活动问卷','男生节活动征题。','填写问卷',false],
 ['participation','/participation','我的参与','活动参与与个人记录。','查看记录',false],
 ['rewards','/rewards','月度感谢','查看班级活动感谢与奖励。','查看感谢',false],
 ['rehearsal','/rehearsal','模拟汇报','准备、练习与回看小组汇报。','开始练习',false],
 ['funds','/funds','班费公开','班费收支与余额。','查看收支',false],
 ['feedback','/feedback','意见反馈','无需登录，可不署名，仅管理员可见。','提交想法',false],
 ['journal','/journal','班务日志','班务推进记录。','查看日志',false],
 ['schedule','/schedule','日程与 DDL','活动与截止时间。','查看日程',false],
 ['notices','/notices','重要事项','近期通知与班级事务。','查看事项',false],
 ['admin','/admin','管理员后台','站点管理。','管理',false],
] as const;
export type ModuleId = typeof siteModules[number][0];
export const moduleIds = siteModules.map(m=>m[0]);
export function moduleForPath(path:string): ModuleId {
 if(/^\/api\/admin\/(?:incentives|activity-admins)(?:\/|$)/.test(path))return 'participation';
 const p=path.replace(/^\/api/,'').replace(/^\/admin(?=\/(albums|surveys|color-homework|sketch-homework|song-requests|rehearsal|funds))/, '');
 if(p.includes('favorite-character'))return 'character';
 if(p.includes('song-request'))return 'songs';
 if(p.startsWith('/upload')||p.startsWith('/assets/')||p.startsWith('/items/'))return 'journal';
 if(p.startsWith('/account')||p.startsWith('/nickname')||p.startsWith('/activity-management'))return 'participation';
 return [...siteModules].sort((a,b)=>b[1].length-a[1].length).find(m=>m[1]!=='/'&&(p===m[1]||p.startsWith(m[1]+'/')))?.[0]||'home';
}
export function normalizedRoute(path:string){
 // No query, object identifiers, filenames or user-supplied path segments survive.
 const m=moduleForPath(path); return (path.startsWith('/api/')?'/api':'')+siteModules.find(x=>x[0]===m)![1];
}
export const homeBlockIds=['identity','journal','notices','schedule','pending','feedback'] as const;
export const homeBlockNames:Record<typeof homeBlockIds[number],string>={identity:'班级视觉',journal:'班务日志',notices:'近期重要事项',schedule:'未来七天日程',pending:'待确定时间节点',feedback:'意见反馈邀请'};
export type HomeEntry={id:ModuleId;visible:boolean;style:'feature'|'card';title:string;description:string;button:string;expires_at:string|null};
export type HomeConfig={version:number;entries:HomeEntry[];blocks:Record<typeof homeBlockIds[number],boolean>};
export function defaultHomeConfig():HomeConfig{return {version:0,entries:siteModules.filter(m=>!['home','admin'].includes(m[0])).map(m=>({id:m[0],visible:m[5],style:m[0]==='sketch_homework'?'feature':'card',title:m[2],description:m[3],button:m[4],expires_at:null})),blocks:Object.fromEntries(homeBlockIds.map(id=>[id,true])) as HomeConfig['blocks']};}
export function visibleHomeEntries(config:HomeConfig,now=Date.now()){return config.entries.filter(e=>e.visible&&(!e.expires_at||Date.parse(e.expires_at)>now));}
