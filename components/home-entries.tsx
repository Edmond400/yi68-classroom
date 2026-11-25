import { siteModules, visibleHomeEntries, type HomeConfig } from '@/lib/site-modules';
export function HomeEntries({config,now}:{config:HomeConfig;now:number}){
 const entries=visibleHomeEntries(config,now),features=entries.filter(e=>e.style==='feature'),cards=entries.filter(e=>e.style==='card');
 const entry=(e:typeof entries[number])=><a key={e.id} data-site-entry={e.id} href={siteModules.find(m=>m[0]===e.id)![1]} className={e.style==='feature'?'home-feature':'home-function-card'}><div><h2>{e.title}</h2><p>{e.description}</p></div><span>{e.button}</span></a>;
 return <>{features.length>0&&<section className="home-functions" aria-label="当前重点事务"><h2 className="home-section-title">当前重点事务</h2><div className="home-feature-list">{features.map(entry)}</div></section>}{cards.length>0&&<section className="home-functions" aria-label="常用功能"><h2 className="home-section-title">常用功能</h2><div className="home-function-grid">{cards.map(entry)}</div></section>}</>;
}
