// Strip identifying metadata without re-encoding the full-resolution picture.
import { HttpError } from './http';
export const ALBUM_PHOTO_LIMIT = 30 * 1024 * 1024;
export function cleanAlbumImage(bytes:Uint8Array,mime:string):Uint8Array {
 const bad=()=>{throw new HttpError(400,'图片格式无效，请重新导出为 JPG、PNG 或 WebP。')};
 if(mime==='image/jpeg'){
  if(bytes[0]!==255||bytes[1]!==216) return bad();
  const parts:Uint8Array[]=[bytes.subarray(0,2)];let p=2;
  while(p<bytes.length){
   const start=p;if(bytes[p++]!==255)return bad();while(bytes[p]===255)p++;
   const marker=bytes[p++];if(marker===218){parts.push(bytes.subarray(start));return join(parts)}
   if(marker===217){parts.push(bytes.subarray(start,p));return join(parts)}
   if(marker===0||marker===216||marker===undefined)return bad();
   const length=(bytes[p]<<8)|bytes[p+1];if(length<2||p+length>bytes.length)return bad();
   if(marker===225){const orientation=exifOrientation(bytes.subarray(p+2,p+length));if(orientation>1)parts.push(orientationSegment(orientation))}
   // Keep JFIF and color profiles; remove EXIF/XMP/IPTC/comments and unknown APP segments.
   if(!((marker>=225&&marker<=239&&marker!==226)||marker===254))parts.push(bytes.subarray(start,p+length));
   p+=length;
  }return bad();
 }
 if(mime==='image/png'){
  if(![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b))return bad();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts=[bytes.subarray(0,8)];let p=8,ended=false;
  while(p+12<=bytes.length){const n=view.getUint32(p),end=p+12+n;if(end>bytes.length)return bad();const type=String.fromCharCode(...bytes.subarray(p+4,p+8));
   if(!['eXIf','tEXt','zTXt','iTXt','tIME'].includes(type))parts.push(bytes.subarray(p,end));p=end;if(type==='IEND'){ended=true;break}}
  if(!ended)return bad();return join(parts);
 }
 if(mime==='image/webp'){
  const str=(p:number)=>String.fromCharCode(...bytes.subarray(p,p+4));
  if(str(0)!=='RIFF'||str(8)!=='WEBP')return bad();
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),parts:Uint8Array[]=[];let p=12;
  if(view.getUint32(4,true)+8!==bytes.length)return bad();
  while(p+8<=bytes.length){const type=str(p),n=view.getUint32(p+4,true),end=p+8+n+(n%2);if(end>bytes.length)return bad();
   if(!['EXIF','XMP '].includes(type)){const part=type==='VP8X'?bytes.slice(p,end):bytes.subarray(p,end);if(type==='VP8X')part[8]&=~12;parts.push(part)}p=end}
  if(p!==bytes.length||!parts.length)return bad();const result=join([bytes.subarray(0,12),...parts]);new DataView(result.buffer).setUint32(4,result.length-8,true);return result;
 }
 throw new HttpError(415,'仅支持 JPG、PNG、WebP 图片。');
}
function join(parts:Uint8Array[]){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let p=0;for(const part of parts){out.set(part,p);p+=part.length}return out}

function exifOrientation(bytes:Uint8Array){
 try{
  if(String.fromCharCode(...bytes.subarray(0,6))!=='Exif\0\0')return 1;
  const v=new DataView(bytes.buffer,bytes.byteOffset+6,bytes.length-6),little=v.getUint16(0)===0x4949;
  if(v.getUint16(2,little)!==42)return 1;const start=v.getUint32(4,little),count=Math.min(v.getUint16(start,little),128);
  for(let n=0;n<count;n++){const p=start+2+n*12;if(v.getUint16(p,little)===0x112&&v.getUint16(p+2,little)===3&&v.getUint32(p+4,little)===1){const o=v.getUint16(p+8,little);return o>=1&&o<=8?o:1}}
 }catch{}return 1;
}
function orientationSegment(orientation:number){
 const out=new Uint8Array([255,225,0,34,69,120,105,102,0,0,73,73,42,0,8,0,0,0,1,0,18,1,3,0,1,0,0,0,orientation,0,0,0,0,0,0,0]);return out;
}
