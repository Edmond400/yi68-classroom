import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {gunzipSync} from 'node:zlib';
import {getDocument,OPS} from 'pdfjs-dist/legacy/build/pdf.mjs';
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('wrangler/package.json'))]}));
const dir=mkdtempSync(resolve(tmpdir(),'rehearsal-reading-'));
try{
 await build({stdin:{contents:`export * from './lib/rehearsal/reading-pdf';export * from './lib/rehearsal/reading-document';export * from './lib/rehearsal/model';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',outfile:resolve(dir,'reading.mjs'),banner:{js:`import {createRequire} from 'node:module';const require=createRequire(import.meta.url);`}});
 const a=await import(pathToFileURL(resolve(dir,'reading.mjs')).href);
 const member=id=>({id,name:'组员'+({a:'甲',b:'乙',c:'丙'}[id]||id),enabled:true});
 const block=(id,text,memberId='a',slideIndex=0,extra={})=>({id,paragraphId:id,text,memberId,slideIndex,nonspoken:false,paragraphEnd:true,...extra});
 const long='这是一份用于演示跨页排版的虚构讲稿。我们从通行、停留与交流三个维度观察空间，比较不同位置的使用方式。需要继续追问的是，空间中的设施如何影响人的选择，以及研究者怎样避免把一次偶然观察当作普遍结论。';
 const p={id:'current',revision:7,title:'校园公共空间观察 - 朗读稿示例',theme:'所有内容均为虚构示例',status:'draft',publishedAt:null,updatedAt:'2026-11-01T12:00:00Z',scriptVersion:'script-demo-v7',deckVersion:'slides-demo-v3',algorithmVersion:a.DEFAULT_CONFIG.version,config:a.DEFAULT_CONFIG,overrides:{},members:['a','b','c'].map(member),slides:[{id:'s1',pageIndex:0,mime:'image/png',bytes:1},{id:'s2',pageIndex:1,mime:'image/png',bytes:1}],blocks:[
  block('p1','大家好。我们用这个虚构课题，演示多人讲稿如何与PPT对应。研究从一个简单的问题开始：为什么同一处校园空间，有人只是经过，有人愿意停留？'),
  block('p2a','英文说明：resea','b',0,{paragraphId:'p2',paragraphEnd:false}),
  block('p2b','rch-based observation。我们先说明观察方法，再比较不同位置。','b',0,{paragraphId:'p2'}),
  block('skip','不应出现在朗读正文的管理备注','a',0,{nonspoken:true}),
  block('p3',long.repeat(12),'a',1),
  block('p4','回到最初的问题。以上内容仅用于展示排版，不代表实际调查发现。下面由组员丙收束讨论。','c',0,{spokenText:'回到最初的问题。以上内容仅用于展示排版。'}),
 ]};
 const original=JSON.stringify(p),sections=a.collectReadingSections(p);
 assert.deepEqual(sections.map(s=>s.slideIndex),[0,1,0]);assert.deepEqual(sections[0].paragraphs.map(x=>x.memberId),['a','b']);assert(sections[0].paragraphs[1].text.includes('research-based'));
 assert.equal(JSON.stringify(p),original);assert.equal(sections[0].paragraphs.length,2);assert(sections.every(s=>s.paragraphs.every(x=>!x.text.includes('不应出现'))));
 for(const patch of [{memberId:null},{memberId:'missing'},{slideIndex:null},{slideIndex:99}])assert.throws(()=>a.collectReadingSections({...p,blocks:[block('bad','正文','a',0,patch)]}));
 assert.throws(()=>a.collectReadingSections({...p,blocks:[]}));
 const colors=a.readingColors(p.members);assert.deepEqual([...a.readingColors([...p.members].reverse())],[...colors]);assert.equal(new Set(a.readingColors(Array.from({length:40},(_,i)=>member('m'+i))).values()).size,40);
 const now=new Date('2026-11-01T12:00:00Z');assert(a.readingFilename(p,now).includes('_r7_202611012000.pdf'));assert(!a.readingFilename({...p,title:'a/b:*?"<>|'},now).match(/[\/:*?"<>|]/));
 const loads=[],bytes=await a.createReadingPdf(p,{fontBytes:gunzipSync(readFileSync('public/fonts/NotoSansSC-Reading.ttf.gz')),now,loadSlide:async(id,index)=>{loads.push(id);return {bytes:readFileSync('tests/fixtures/rehearsal-reading/slide'+(index+1)+'.png'),mime:'image/png'}}});
 assert.deepEqual(loads,['s1','s2'],'returning to a previous slide reuses its embedded image');
 assert.equal(JSON.stringify(p),original,'export must not mutate or publish the draft');
 const pdf=await getDocument({data:new Uint8Array(bytes),isEvalSupported:false}).promise;
 let text='',bodyText='';const rgbValues=new Set();
 assert(pdf.numPages>=4,'long paragraphs must continue on additional pages');
 for(let i=1;i<=pdf.numPages;i++){
  const page=await pdf.getPage(i),v=page.getViewport({scale:1});assert(Math.abs(v.width-595.28)<.1);assert(Math.abs(v.height-841.89)<.1);
  const content=await page.getTextContent();const parts=content.items.filter(x=>'str' in x);
  for(const item of parts){text+=item.str;if(Math.abs(item.transform[0]-13.5)<.01)bodyText+=item.str;assert(item.transform[4]>=40,'text stays within left margin');assert(item.transform[5]>=15,'text does not fall below footer');assert(item.transform[4]+item.width<=555,'text stays within right margin')}
  assert(parts.some(t=>t.str.includes('PPT 第')));assert(parts.some(t=>t.str.includes('第 '+i+' / '+pdf.numPages+' 页')));
  const ops=await page.getOperatorList();assert(ops.fnArray.includes(OPS.paintImageXObject),'every page, including continuation pages, has its PPT');
  for(let j=0;j<ops.fnArray.length;j++)if(ops.fnArray[j]===OPS.setFillRGBColor)rgbValues.add(JSON.stringify(ops.argsArray[j]));
 }
 assert(text.includes('当前已保存草稿'));assert(text.includes('【朗读人：组员甲】'));assert(text.includes('【朗读人：组员乙】'));assert(text.includes('【朗读人：组员丙】'));assert(text.includes('（续）'));assert(text.includes('读法提示：'));assert(!text.includes('不应出现在朗读正文'));
 assert(text.indexOf('为什么同一处')<text.indexOf('英文说明'));assert(text.indexOf('英文说明')<text.indexOf('这是一份用于演示'));assert(text.lastIndexOf('回到最初的问题')>text.indexOf('这是一份用于演示'));
 assert.equal(bodyText.split('这是一份用于演示跨页排版的虚构讲稿。').length-1,12,'no body text is duplicated or lost at page breaks');
 const compact=s=>s.replace(/\s+/g,'');assert.equal(compact(bodyText),compact(p.blocks.filter(b=>!b.nonspoken).map(b=>b.text).join('')),'all spoken body text is preserved across page headers and labels');
 assert(rgbValues.size>=5,'distinct reader colors and neutral header ink exist in the exported PDF');
 const metadata=await pdf.getMetadata();assert(metadata.info.Subject.includes('script-demo-v7'));assert(metadata.info.Subject.includes('slides-demo-v3'));
 await pdf.destroy();
 if(process.env.READING_PDF_SAMPLE_PATH){mkdirSync(dirname(process.env.READING_PDF_SAMPLE_PATH),{recursive:true});writeFileSync(process.env.READING_PDF_SAMPLE_PATH,bytes)}
 console.log('PASS reading PDF: A4 portrait, draft snapshot, same-slide readers, A-B-A order, anchors, repeated slides, Chinese text extraction, color ink, continuation labels/PPT, missing assignments, safe filename, no mutation; '+bytes.length+' bytes');
}finally{rmSync(dir,{recursive:true,force:true})}
