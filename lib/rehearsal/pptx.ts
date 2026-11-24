import {unzipSync,zipSync,strFromU8,strToU8,type Zippable} from 'fflate';
import type {Project} from './model';
import {collectReadingSections} from './reading-document';
const REL='http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const decode=(s:string)=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');
const esc=(s:string)=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const attrs=(s:string)=>Object.fromEntries([...s.matchAll(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g)].map(m=>[m[1],decode(m[3])]));
function resolve(base:string,target:string){const parts=target.startsWith('/')?[]:base.split('/').slice(0,-1);for(const p of target.split('/'))if(p==='..')parts.pop();else if(p&&p!=='.')parts.push(p);return parts.join('/')}
function parts(data:Uint8Array,all=false){if(data.length>20*1024*1024)throw new Error('原始PPTX请不超过20MiB。');let total=0;return unzipSync(data,{filter:file=>{if(!all&&!['ppt/presentation.xml','ppt/_rels/presentation.xml.rels'].includes(file.name))return false;total+=file.originalSize;if(file.originalSize>40*1024*1024||total>(all?160:4)*1024*1024)throw new Error('PPTX解压后过大，请压缩图片后上传。');return true}})}
function manifest(files:Record<string,Uint8Array>){const text=strFromU8(files['ppt/presentation.xml']??new Uint8Array()),rels=strFromU8(files['ppt/_rels/presentation.xml.rels']??new Uint8Array());if(!text||!rels||/<!DOCTYPE/i.test(text+rels))throw new Error('文件不是有效的PPTX。');const map=new Map([...rels.matchAll(/<(?:[\w-]+:)?Relationship\b[^>]*\/?\s*>/g)].map(m=>{const a=attrs(m[0]);return [a.Id,a]}));const slides=[...text.matchAll(/<(?:[\w-]+:)?sldId\b[^>]*\/?\s*>/g)].map(m=>{const a=attrs(m[0]),rel=map.get(a['r:id']);if(!rel||rel.TargetMode==='External'||!rel.Type?.endsWith('/slide'))throw new Error('PPTX页序关系无效。');const path=resolve('ppt/presentation.xml',rel.Target);if(!/^ppt\/slides\/[^/]+\.xml$/.test(path))throw new Error('PPTX页面路径无效。');return {path,id:a.id,rid:a['r:id'],xml:m[0]}});if(!slides.length||slides.length>200||new Set(slides.map(s=>s.path)).size!==slides.length)throw new Error('PPTX须包含1—200张有效幻灯片。');return {slides,text,rels}}
export function inspectPptx(data:Uint8Array){return manifest(parts(data)).slides.map(s=>s.path)}
function notesXml(text:string){return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:notes xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="${REL.slice(0,-1)}" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="Notes Placeholder"/><p:cNvSpPr/><p:nvPr><p:ph type="body" idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/><a:lstStyle/>${text.split('\n').map(t=>'<a:p><a:r><a:rPr lang="zh-CN"/><a:t xml:space="preserve">'+esc(t)+'</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p>').join('')}</p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:notes>`}
export function exportPptx(data:Uint8Array,project:Project){
 const files=parts(data,true),m=manifest(files);if(!project.sourceDeck||JSON.stringify(project.sourceDeck.pages)!==JSON.stringify(m.slides.map(s=>s.path)))throw new Error('原始PPTX版本已变化，请重新关联预览页。');
 if(!project.slides.length)throw new Error('请先上传网页预览页并完成映射。');
 const selected=project.slides.map(s=>m.slides.find(p=>p.path===s.sourcePage));if(selected.some(s=>!s)||new Set(selected.map(s=>s!.path)).size!==selected.length)throw new Error('请为每张预览页确认对应的原始PPTX页面。');
 if(project.blocks.some(b=>!b.nonspoken&&b.text.trim()&&(b.slideIndex===null||!project.slides[b.slideIndex])))throw new Error('存在未关联PPT的讲稿，请先完成映射。');
 const reading=collectReadingSections(project);
 let contentTypes=strFromU8(files['[Content_Types].xml']);const master=Object.keys(files).find(p=>/^ppt\/notesMasters\/[^/]+\.xml$/.test(p));
 selected.forEach((slide,i)=>{const p=slide!,slideRel=p.path.replace('/slides/','/slides/_rels/')+'.rels';let rels=files[slideRel]?strFromU8(files[slideRel]):`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
  const oldNote=[...rels.matchAll(/<(?:[\w-]+:)?Relationship\b[^>]*\/?\s*>/g)].map(n=>attrs(n[0])).find(n=>n.Type?.endsWith('/notesSlide')&&n.TargetMode!=='External');
  let notePath=oldNote?resolve(p.path,oldNote.Target):'';
  if(!/^ppt\/notesSlides\/[^/]+\.xml$/.test(notePath)){let n=i+1;do{notePath='ppt/notesSlides/yi68Notes'+(n++)+'.xml'}while(files[notePath]);}
  rels=rels.replace(/<(?:[\w-]+:)?Relationship\b[^>]*\/?\s*>/g,node=>attrs(node).Type?.endsWith('/notesSlide')?'':node);let n=1;while([...rels.matchAll(/<(?:[\w-]+:)?Relationship\b[^>]*>/g)].some(m=>attrs(m[0]).Id==='yi68Notes'+n))n++;
  rels=rels.replace(/<\/(?:[\w-]+:)?Relationships>/,`<Relationship Id="yi68Notes${n}" Type="${REL}notesSlide" Target="../notesSlides/${notePath.split('/').at(-1)}"/></Relationships>`);files[slideRel]=strToU8(rels);
  const text=reading.filter(section=>section.slideIndex===i).flatMap(section=>section.paragraphs.map(p=>p.name+'：'+p.text+p.notes.map(note=>'\n读法提示：'+note).join(''))).join('\n\n');files[notePath]=strToU8(notesXml(text));
  const slideTarget='../slides/'+p.path.split('/').at(-1);files[notePath.replace('/notesSlides/','/notesSlides/_rels/')+'.rels']=strToU8(`<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}slide" Target="${slideTarget}"/>${master?`<Relationship Id="rId2" Type="${REL}notesMaster" Target="../notesMasters/${master.split('/').at(-1)}"/>`:''}</Relationships>`);
  const part='/'+notePath;if(!contentTypes.includes('PartName="'+part+'"'))contentTypes=contentTypes.replace('</Types>',`<Override PartName="${part}" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/></Types>`);
 });
 let presentation=m.text.replace(/<(?:[\w-]+:)?sldIdLst\b[^>]*>[\s\S]*?<\/(?:[\w-]+:)?sldIdLst>/,list=>list.replace(/>([\s\S]*)<\//, '>'+selected.map(s=>s!.xml).join('')+'</'));
 const ids=new Set(selected.map(s=>s!.id)),rids=new Set(selected.map(s=>s!.rid));presentation=presentation.replace(/<(?:[\w-]+:)?sldId\b[^>]*\bid=["'](\d+)["'][^>]*\/?>/g,node=>ids.has(attrs(node).id)?node:'');
 // Section and custom-show references to removed slides must not survive a deletion.
 presentation=presentation.replace(/<(?:p14:)?sldId\b[^>]*\bid=["'](\d+)["'][^>]*\/?>/g,node=>ids.has(attrs(node).id)?node:'');
 presentation=presentation.replace(/<(?:[\w-]+:)?sld\b[^>]*\br:id=["']([^"']+)["'][^>]*\/?>/g,node=>rids.has(attrs(node)['r:id'])?node:'');
 files['ppt/_rels/presentation.xml.rels']=strToU8(m.rels.replace(/<(?:[\w-]+:)?Relationship\b[^>]*\/?\s*>/g,node=>attrs(node).Type?.endsWith('/slide')&&!rids.has(attrs(node).Id)?'':node));
 files['ppt/presentation.xml']=strToU8(presentation);files['[Content_Types].xml']=strToU8(contentTypes);
 const output:Zippable={};for(const [name,bytes] of Object.entries(files))output[name]=[bytes,{level:/\.(?:png|jpe?g|gif|mp[34]|woff2?|zip)$/i.test(name)?0:6}];return zipSync(output);
}
