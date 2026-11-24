'use client';
let selected='',token='';
const key='yi68.rehearsal.access';
function restore(){if(!selected)try{const s=JSON.parse(sessionStorage.getItem(key)||'null');if(s&&/^[a-zA-Z0-9_-]{1,80}$/.test(s.id)){selected=s.id;token=/^[a-f0-9]{64}$/.test(s.token)?s.token:''}}catch{}}
export function rehearsalProject(){restore();return selected}
export function rehearsalHeaders(){restore();return {...(selected?{'X-Yi68-Rehearsal-Project':selected}:{}),...(token?{'X-Yi68-Rehearsal-Token':token}:{})} as Record<string,string>}
export function rehearsalScope(){restore();return selected+':'+token}
export function selectRehearsal(id:string,value=''){if(!/^[a-zA-Z0-9_-]{1,80}$/.test(id))throw new Error('汇报标识无效');selected=id;token=value;try{sessionStorage.setItem(key,JSON.stringify({id,token}))}catch{}}
export function leaveRehearsal(){selected='';token='';try{sessionStorage.removeItem(key)}catch{}}
