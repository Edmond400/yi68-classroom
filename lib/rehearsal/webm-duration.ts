// Add a duration only to unindexed, unknown-size MediaRecorder WebM segments.
// Indexed/finite containers and their byte offsets are left unchanged.
export function withWebmDuration(bytes:Uint8Array,durationMs:number):Uint8Array{
 if(!Number.isFinite(durationMs)||durationMs<=0)return bytes;
 function header(at:number){
  const start=at;let n=1,mask=128;
  while(n<=4&&!(bytes[at]&mask)){n++;mask>>=1}if(n>4||at+n>=bytes.length)return null;
  let id=0;for(let i=0;i<n;i++)id=id*256+bytes[at++];
  const sizeAt=at;let width=1;mask=128;while(width<=8&&!(bytes[at]&mask)){width++;mask>>=1}
  if(width>8||at+width>bytes.length)return null;
  let size=bytes[at++]&(mask-1),unknown=size===mask-1;
  for(let i=1;i<width;i++){size=size*256+bytes[at];unknown=unknown&&bytes[at++]===255}
  if(!unknown&&!Number.isSafeInteger(size))return null;
  return {id,start,sizeAt,width,data:at,end:unknown?bytes.length:at+size,size,unknown};
 }
 let segment:ReturnType<typeof header>=null;
 for(let at=0;at<bytes.length;){const h=header(at);if(!h||h.end>bytes.length)return bytes;if(h.id===0x18538067){segment=h;break}at=h.end}
 if(!segment?.unknown)return bytes;
 let info:ReturnType<typeof header>=null,streamingCluster=false;
 for(let at=segment.data;at<bytes.length;){
  const h=header(at);if(!h||h.end>bytes.length)return bytes;
  if(h.id===0x114d9b74||h.id===0x1c53bb6b)return bytes;
  if(h.id===0x1f43b675){streamingCluster=h.unknown;break}
  if(h.unknown)return bytes;
  if(h.id===0x1549a966)info=h;
  at=h.end;
 }
 if(info&&streamingCluster){const h=info;
   let scale=1000000;
   for(let p=h.data;p<h.end;){const child=header(p);if(!child||child.end>h.end||child.unknown)return bytes;if(child.id===0x4489)return bytes;if(child.id===0x2ad7b1){scale=0;for(let i=child.data;i<child.end;i++)scale=scale*256+bytes[i]}p=child.end}
   if(!scale)return bytes;
   const extra=new Uint8Array(11);extra.set([0x44,0x89,0x88]);new DataView(extra.buffer).setFloat64(3,durationMs*1000000/scale);
   const size=h.size+extra.length;if(size>=2**(7*h.width)-1)return bytes;
   const result=new Uint8Array(bytes.length+extra.length);result.set(bytes.subarray(0,h.end));result.set(extra,h.end);result.set(bytes.subarray(h.end),h.end+extra.length);
   let value=size;for(let i=h.width-1;i>=0;i--){result[h.sizeAt+i]=value%256;value=Math.floor(value/256)}result[h.sizeAt]|=1<<(8-h.width);
   return result;
 }
 return bytes;
}
