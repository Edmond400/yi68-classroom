import type {Member,Project,Slide} from './model';

export type ReadingParagraph={memberId:string;name:string;paragraphId:string;text:string;notes:string[]};
export type ReadingSection={slide:Slide;slideIndex:number;paragraphs:ReadingParagraph[]};
// Dark ink on white paper; the printed name remains the primary identity cue.
const PALETTE=['#65358A','#195D91','#267047','#9A3C30','#775518','#7D3971','#176C70','#4C5599','#7F4731','#505F23','#853D57','#365D65'];
export function readingColors(members:Member[]):Map<string,string>{
 const extra=(i:number)=>{const h=((i*137.508)%360)/60,c=.40,x=c*(1-Math.abs(h%2-1)),m=.12;const a=h<1?[c,x,0]:h<2?[x,c,0]:h<3?[0,c,x]:h<4?[0,x,c]:h<5?[x,0,c]:[c,0,x];return '#'+a.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('')};
 return new Map([...members].sort((a,b)=>a.id<b.id?-1:a.id>b.id?1:0).map((m,i)=>[m.id,i<PALETTE.length?PALETTE[i]:extra(i)]));
}
export function collectReadingSections(p:Project):ReadingSection[]{
 const sections:ReadingSection[]=[];
 for(const [index,b] of p.blocks.entries()){
  if(b.nonspoken||!b.text.trim())continue;
  const member=p.members.find(m=>m.id===b.memberId&&m.enabled);
  if(!member)throw new Error('片段'+(index+1)+'尚未分配有效朗读人，请先完成分工并保存。');
  if(b.slideIndex===null||!Number.isInteger(b.slideIndex)||!p.slides[b.slideIndex])throw new Error('片段'+(index+1)+'尚未关联有效PPT页，请先完成映射并保存。');
  let section=sections[sections.length-1];
  if(!section||section.slideIndex!==b.slideIndex){section={slide:p.slides[b.slideIndex],slideIndex:b.slideIndex,paragraphs:[]};sections.push(section)}
  const note=b.spokenText?.trim()&&b.spokenText!==b.text?b.spokenText:undefined;
  const last=section.paragraphs[section.paragraphs.length-1];
  if(last&&last.memberId===member.id&&last.paragraphId===b.paragraphId){last.text+=b.text;if(note)last.notes.push(note)}
  else section.paragraphs.push({memberId:member.id,name:member.name,paragraphId:b.paragraphId,text:b.text,notes:note?[note]:[]});
 }
 if(!sections.length)throw new Error('尚无可导出的朗读正文。请先添加讲稿、分配朗读人并关联PPT后保存。');
 return sections;
}
export function readingFilename(p:Project,date=new Date()):string{
 const title=Array.from(p.title.replace(/[<>:"/\\|?*\u0000-\u001f]/g,'_').replace(/[. ]+$/,'').trim()||'模拟汇报').slice(0,65).join('');
 const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(date).replace(/[-: ]/g,'');
 return title+'_全组朗读稿_r'+p.revision+'_'+stamp+'.pdf';
}
