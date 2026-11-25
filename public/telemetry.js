/* First-party anonymous measurements. No fingerprinting or personal identifiers. */
(()=>{
 if(window.__yi68Telemetry)return;window.__yi68Telemetry=true;
 const key='yi68_anon_stats_v1',offKey='yi68_stats_off';let last='',visitor;
 function enabled(){try{return localStorage.getItem(offKey)!=='1'&&navigator.doNotTrack!=='1'}catch{return false}}
 function anonymous(){try{let v=JSON.parse(localStorage.getItem(key)||'null');if(!v||Date.now()-v.created>=30*86400000){v={id:crypto.randomUUID(),created:Date.now()};localStorage.setItem(key,JSON.stringify(v))}return v.id}catch{return undefined}}
 const routes=[['sketch_homework','/sketch-homework'],['color_homework','/color-homework'],['character','/survey/favorite-character'],['boys_day','/survey/boys-day'],['birthday','/survey/birthday'],['drinks','/survey/drinks'],['talent','/survey/talent'],['songs','/song-request'],['albums','/albums'],['participation','/participation'],['rewards','/rewards'],['rehearsal','/rehearsal'],['funds','/funds'],['feedback','/feedback'],['journal','/journal'],['schedule','/schedule'],['notices','/notices'],['admin','/admin'],['journal','/items/']];
 function module(path){return routes.find(r=>path===r[1]||path.startsWith(r[1]+'/')||r[1]==='/items/'&&path.startsWith(r[1]))?.[0]||'home'}
 function safePath(){return location.pathname.replace(/[^a-zA-Z0-9/_-]/g,'').slice(0,200)||'/'}
 function send(event_name,module_id){if(!enabled()||document.visibilityState!=='visible')return;visitor=anonymous();const body=JSON.stringify({id:crypto.randomUUID(),event_name,path:safePath(),module_id,...(visitor?{visitor}:{})});fetch('/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body,keepalive:true}).catch(()=>{});}
 function page(){const path=safePath();if(path===last||!enabled()||document.visibilityState!=='visible')return;last=path;send('page_view',module(path));}
 function privacy(){const disabled=!enabled();if(confirm('本站使用最长30天的随机匿名浏览器标识估算访问量；不采集完整IP、设备指纹、姓名或浏览轨迹。业务结果与管理员操作另行记录，关闭匿名访问统计不影响正常使用。\n\n'+(disabled?'是否开启匿名访问统计？':'是否关闭匿名访问统计？'))){try{localStorage.setItem(offKey,disabled?'0':'1');if(!disabled){localStorage.removeItem(key);visitor=undefined}window.dispatchEvent(new Event('yi68-stats-changed'))}catch{}}}
 let button;function label(){if(button)button.textContent='统计隐私 · '+(enabled()?'关闭匿名统计':'匿名统计已关闭')}
 function init(){page();if(!document.documentElement.hasAttribute('data-yi68-shell')){button=document.createElement('button');button.type='button';button.className='ops-privacy';label();button.addEventListener('click',privacy);const footer=document.querySelector('footer')||document.body;footer.appendChild(button);}document.addEventListener('click',e=>{const a=e.target.closest?.('a[data-site-entry]');if(a)send('entry_click',a.dataset.siteEntry)});}
 window.addEventListener('yi68-stats-changed',()=>{last='';page();label()});window.addEventListener('yi68-route',page);window.addEventListener('popstate',page);document.addEventListener('visibilitychange',page);
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
