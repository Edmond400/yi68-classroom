import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import {unzipSync,zipSync,strFromU8} from 'fflate';
const require=createRequire(import.meta.url),{build}=require(require.resolve('esbuild',{paths:[dirname(require.resolve('wrangler/package.json'))]})),dir=mkdtempSync(resolve(tmpdir(),'rehearsal-pptx-'));
try{
 await build({stdin:{contents:`export * from './lib/rehearsal/pptx';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,format:'esm',platform:'node',outfile:resolve(dir,'pptx.mjs')});
 const {inspectPptx,exportPptx}=await import(pathToFileURL(resolve(dir,'pptx.mjs')).href);
 execFileSync('python',['-c',`from pptx import Presentation
from pptx.util import Inches
import sys
r=Presentation()
for i in range(3):
 s=r.slides.add_slide(r.slide_layouts[6]);s.shapes.add_textbox(Inches(1),Inches(1),Inches(6),Inches(2)).text='Original page '+str(i+1)
 if i!=2:s.notes_slide.notes_text_frame.text='OLD NOTES '+str(i)
r.save(sys.argv[1])`,resolve(dir,'original.pptx')]);
 const fixture=unzipSync(new Uint8Array(readFileSync(resolve(dir,'original.pptx'))));fixture['ppt/slides/slide3.xml']=new TextEncoder().encode(strFromU8(fixture['ppt/slides/slide3.xml']).replace('</p:sld>','<p:transition spd="med"><p:fade/></p:transition><p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"/></p:par></p:tnLst></p:timing></p:sld>'));const source=zipSync(fixture),manifest=inspectPptx(source);assert.deepEqual(manifest,['ppt/slides/slide1.xml','ppt/slides/slide2.xml','ppt/slides/slide3.xml']);
 const project={title:'测试汇报',members:[{id:'a',name:'甲 & 乙',enabled:true},{id:'b',name:'组员二',enabled:true}],sourceDeck:{id:'original',pages:manifest,bytes:source.length},slides:[{id:'preview3',sourcePage:manifest[2]},{id:'preview1',sourcePage:manifest[0]}],blocks:[{id:'b1',text:'第3页正文 <重点>\n下一行',memberId:'a',nonspoken:false,slideIndex:0},{id:'b2',text:'第二位继续。',memberId:'b',nonspoken:false,slideIndex:0},{id:'b3',text:'原第1页，现第2页。',memberId:'b',nonspoken:false,slideIndex:1},{id:'b4',text:'不应进入备注',memberId:'a',nonspoken:true,slideIndex:1}]};
 project.blocks=project.blocks.map(b=>({...b,paragraphId:b.id,paragraphEnd:true}));
 const output=exportPptx(source,project);writeFileSync(resolve(dir,'export.pptx'),output);assert.deepEqual(inspectPptx(output),[manifest[2],manifest[0]]);
 const before=unzipSync(source),after=unzipSync(output);assert(strFromU8(after['ppt/slides/slide3.xml']).includes('<p:timing>'));assert(strFromU8(after['ppt/slides/slide3.xml']).includes('<p:fade/>'));for(const path of manifest)assert.deepEqual(after[path],before[path],'original editable slide/animation XML preserved');
 // Verify with a second implementation, not the same regular expressions used by export.
 const parsed=JSON.parse(execFileSync('python',['-c',`from pptx import Presentation
from lxml import etree
from zipfile import ZipFile
import json,sys
p=Presentation(sys.argv[1]);notes=[s.notes_slide.notes_text_frame.text for s in p.slides]
with ZipFile(sys.argv[1]) as z:
 for n in z.namelist():
  if n.endswith('.xml') or n.endswith('.rels'):etree.fromstring(z.read(n))
p.save(sys.argv[2]);q=Presentation(sys.argv[2]);assert len(q.slides)==2
print(json.dumps({'pages':len(p.slides),'notes':notes,'text':[s.shapes[0].text for s in p.slides]},ensure_ascii=False))`,resolve(dir,'export.pptx'),resolve(dir,'roundtrip.pptx')],{encoding:'utf8'}));
 assert.equal(parsed.pages,2);assert.deepEqual(parsed.text,['Original page 3','Original page 1']);assert.equal(parsed.notes[0],'甲 & 乙：第3页正文 <重点>\n下一行\n\n组员二：第二位继续。');assert.equal(parsed.notes[1],'组员二：原第1页，现第2页。');assert(!parsed.notes.join('').includes('OLD NOTES'));assert(!parsed.notes.join('').includes('不应进入备注'));
 const second=exportPptx(output,{...project,sourceDeck:{...project.sourceDeck,pages:inspectPptx(output)}});assert.equal(inspectPptx(second).length,2,'repeat notes export remains valid');
 assert.throws(()=>exportPptx(source,{...project,slides:[project.slides[0],project.slides[0]]}),/原始PPTX页面/);assert.throws(()=>exportPptx(source,{...project,blocks:[{...project.blocks[0],slideIndex:null}]}),/未关联/);assert.throws(()=>exportPptx(source,{...project,sourceDeck:{...project.sourceDeck,pages:manifest.slice(1)}}),/版本/);assert.throws(()=>inspectPptx(new Uint8Array([1,2,3])));const withReading=exportPptx(source,{...project,blocks:project.blocks.map(b=>b.id==='b3'?{...b,spokenText:'实际读法'}:b)});assert(Object.values(unzipSync(withReading)).some(b=>strFromU8(b).includes('读法提示：实际读法')));
 const malformed={...before,'ppt/presentation.xml':new TextEncoder().encode(strFromU8(before['ppt/presentation.xml']).replace('r:id="rId7"','r:id="missing"'))};assert.throws(()=>inspectPptx(zipSync(malformed)));
 console.log('PASS PPTX: real editable file, delete/reorder pages, original slide XML preserved, exact speaker/Chinese/escaped notes, overwrite existing notes, second-parser XML validation, python-pptx open/save roundtrip, invalid mapping/version/ZIP rejection');
}finally{rmSync(dir,{recursive:true,force:true})}
