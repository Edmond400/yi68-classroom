'use client';
// Root administrator sessions are isolated from student sessions and never use URLs.
const KEY='yi68.administrator.session';
let memoryToken:string|null=null;
export function administratorSession(){if(memoryToken)return memoryToken;try{const token=sessionStorage.getItem(KEY);if(token&&/^[a-f0-9]{64}$/.test(token))memoryToken=token}catch{}return memoryToken}
export function saveAdministratorSession(token:string){if(!/^[a-f0-9]{64}$/.test(token))throw new Error('登录状态有误，请重新登录。');memoryToken=token;try{sessionStorage.setItem(KEY,token)}catch{}}
export function clearAdministratorSession(){memoryToken=null;try{sessionStorage.removeItem(KEY)}catch{}}
export function administratorHeaders(){const token=administratorSession();return token?{Authorization:'Bearer '+token}:{} as Record<string,string>}
