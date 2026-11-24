import {PDFDocument,rgb,type PDFFont,type PDFImage,type PDFPage} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type {Project} from './model';
import {collectReadingSections,readingColors,type ReadingSection} from './reading-document';

export type ReadingImage={bytes:Uint8Array;mime:'image/jpeg'|'image/png'};
export type ReadingPdfOptions={
 fontBytes:Uint8Array;
 loadSlide:(id:string,pageIndex:number)=>Promise<ReadingImage>;
 onProgress?:(message:string)=>void;
 yieldControl?:()=>Promise<void>;
 now?:Date;
};
const WIDTH=595.28,HEIGHT=841.89,MARGIN=42,BOTTOM=67,CONTENT=WIDTH-2*MARGIN;
const INK=rgb(.17,.14,.20),MUTED=rgb(.43,.39,.47),LINE=rgb(.88,.85,.91);
function color(hex:string){return rgb(parseInt(hex.slice(1,3),16)/255,parseInt(hex.slice(3,5),16)/255,parseInt(hex.slice(5,7),16)/255)}
function clean(text:string){return text.replace(/\r\n?/g,'\n').replace(/\t/g,'    ').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'')}
export function wrapReadingText(text:string,font:Pick<PDFFont,'widthOfTextAtSize'>,size:number,width:number):string[]{
 const result:string[]=[];
 for(const para of clean(text).split('\n')){
  let line='';
  const flush=()=>{result.push(line.trimEnd());line=''};
  const append=(token:string)=>{
   if(line&&font.widthOfTextAtSize(line+token,size)>width){
    // Keep a closing Chinese punctuation mark with a preceding character.
    if(/^[，。！？：；、）》】”’%]$/u.test(token)&&Array.from(line).length>1){const chars=Array.from(line);const end=chars.pop()!;line=chars.join('');flush();line=end+token;return}
    flush();
   }
   if(!line&&!token.trim())return;
   line+=token;
  };
  for(const token of para.match(/[A-Za-z0-9]+(?:[._:/@+\-][A-Za-z0-9]+)*|[^\r\n]/gu)||[]){
   if(font.widthOfTextAtSize(token,size)>width){for(const ch of token)append(ch)}else append(token);
  }
  result.push(line.trimEnd());
 }
 return result;
}

/** Browser and Node share the exact same generator; all body text is real PDF text. */
export async function createReadingPdf(project:Project,options:ReadingPdfOptions):Promise<Uint8Array>{
 const sections=collectReadingSections(project),colors=readingColors(project.members),now=options.now||new Date();
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 // Keep the full static TTF: fontkit 1.1.1 drops composite CJK outlines when
 // subsetting this font, even though ToUnicode extraction still looks correct.
 const font=await doc.embedFont(options.fontBytes,{subset:false});
 const stamp=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'short',hour12:false}).format(now);
 const texts=[project.title,project.theme,stamp,'全组朗读稿 当前已保存编排 草稿 已发布 已结束 朗读人 续 读法提示 第页共 稿件 编排 导出 说明 颜色用于区分朗读人，每段均标注姓名。',...project.members.map(m=>m.name),...sections.flatMap(s=>s.paragraphs.flatMap(p=>[p.text,...p.notes])),'0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz /:.-_【】（）|'];
 const supported=new Set(font.getCharacterSet()),unsupported=new Set<string>();
 for(const text of texts)for(const ch of clean(text)){if(ch!=='\n'&&!supported.has(ch.codePointAt(0)!))unsupported.add(ch)}
 if(unsupported.size)throw new Error('导出字体暂不支持以下字符：'+[...unsupported].slice(0,16).join(' ')+'。请联系管理员补充字体后重试。');
 doc.setTitle(project.title+' - 全组朗读稿');doc.setSubject(project.theme+' | script='+project.scriptVersion+' | deck='+project.deckVersion+' | revision='+project.revision);doc.setCreator('艺68学术探知模拟汇报平台');doc.setCreationDate(now);doc.setModificationDate(now);
 const images=new Map<string,PDFImage>(),pageInfo:{page:PDFPage;slideIndex:number;continued:boolean}[]=[];
 let page:PDFPage,y=0,sourceBytes=0;
 const draw=(text:string,x:number,baseline:number,size:number,ink=INK)=>page.drawText(text,{x,y:baseline,font,size,color:ink});
 async function imageFor(section:ReadingSection){
  let image=images.get(section.slide.id);if(image)return image;
  options.onProgress?.('正在读取PPT第'+(section.slideIndex+1)+'页…');
  const source=await options.loadSlide(section.slide.id,section.slideIndex);
  sourceBytes+=source.bytes.byteLength;if(sourceBytes>64*1024*1024)throw new Error('本次导出的PPT图片超过64MiB，请压缩页面图片后重试。');
  image=source.mime==='image/png'?await doc.embedPng(source.bytes):await doc.embedJpg(source.bytes);images.set(section.slide.id,image);return image;
 }
 async function newPage(section:ReadingSection,continued=false){
  if(pageInfo.length>=500)throw new Error('导出页数超过500页，请精简过长文稿后重试。');
  const image=await imageFor(section);page=doc.addPage([WIDTH,HEIGHT]);pageInfo.push({page,slideIndex:section.slideIndex,continued});y=HEIGHT-47;
  for(const line of wrapReadingText(project.title,font,15,CONTENT)){draw(line,MARGIN,y,15);y-=21}
  const state={draft:'草稿',published:'已发布',ended:'已结束'}[project.status];
  draw('全组朗读稿 | 当前已保存'+state+' | 编排 r'+project.revision,MARGIN,y-3,10,MUTED);y-=26;
  if(pageInfo.length===1){draw('颜色用于区分朗读人，每段均标注姓名。',MARGIN,y,10,MUTED);y-=24}
  draw('PPT 第'+(section.slideIndex+1)+'页 / 共'+project.slides.length+'页'+(continued?'（续）':''),MARGIN,y,11,color('#65358A'));y-=15;
  const boxHeight=Math.min(continued?130:272,y-BOTTOM-135);
  if(boxHeight<50)throw new Error('标题过长，无法保留PPT和正文空间，请缩短标题后重试。');
  page.drawRectangle({x:MARGIN,y:y-boxHeight,width:CONTENT,height:boxHeight,color:rgb(.979,.974,.986),borderColor:LINE,borderWidth:.6});
  const scale=Math.min((CONTENT-8)/image.width,(boxHeight-8)/image.height),iw=image.width*scale,ih=image.height*scale;
  page.drawImage(image,{x:MARGIN+(CONTENT-iw)/2,y:y-(boxHeight+ih)/2,width:iw,height:ih});y-=boxHeight+28;
  await options.yieldControl?.();
 }
 for(const section of sections){
  await newPage(section);
  for(const para of section.paragraphs){
   const ink=color(colors.get(para.memberId)!);
   const parts=[{text:para.text,size:13.5,lineHeight:21.5,note:false},...para.notes.map(text=>({text:'读法提示：'+text,size:10.5,lineHeight:17,note:true}))];
   let continued=false;
   for(const part of parts){
    const lines=wrapReadingText(part.text,font,part.size,CONTENT);let offset=0;
    while(offset<lines.length){
     const label=wrapReadingText('【朗读人：'+para.name+'】'+(continued?'（续）':''),font,11.5,CONTENT),labelHeight=label.length*18+5;
     if(y-BOTTOM<labelHeight+Math.min(2,lines.length-offset)*part.lineHeight){await newPage(section,true)}
     for(const line of label){draw(line,MARGIN,y,11.5,ink);y-=18}y-=5;
     const count=Math.max(1,Math.floor((y-BOTTOM)/part.lineHeight)+1);
     for(const line of lines.slice(offset,offset+count)){draw(line,MARGIN,y,part.size,ink);y-=part.lineHeight}
     offset+=count;continued=true;
     if(offset<lines.length)await newPage(section,true);
    }
    y-=part.note?8:12;
   }
  }
 }
 for(const [i,info] of pageInfo.entries()){
  page=info.page;page.drawLine({start:{x:MARGIN,y:47},end:{x:WIDTH-MARGIN,y:47},color:LINE,thickness:.6});
  draw('稿件 '+project.scriptVersion.slice(0,8)+' / PPT '+project.deckVersion.slice(0,8),MARGIN,32,8,MUTED);
  const counter='第 '+(i+1)+' / '+pageInfo.length+' 页';draw(counter,WIDTH-MARGIN-font.widthOfTextAtSize(counter,9),32,9,MUTED);
  draw('导出 '+stamp+'（北京时间）',MARGIN,18,8,MUTED);
 }
 options.onProgress?.('正在嵌入字体并生成PDF…');await options.yieldControl?.();return doc.save();
}
