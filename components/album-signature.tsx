'use client';
import { useEffect,useState } from 'react';
import { randomArtist,ARTIST_NAMES } from '@/lib/artist-names';
type Preference={artist:string;custom:string};
let current:Preference={artist:'',custom:''};
let loaded=false;
function read(){if(!loaded){loaded=true;try{const saved=JSON.parse(localStorage.getItem('yi68-album-signature')||'null');if(saved&&ARTIST_NAMES.includes(saved.artist)&&typeof saved.custom==='string')current=saved}catch{}}if(!current.artist)current={artist:randomArtist(),custom:''};return current}
function save(next:Preference){current=next;try{localStorage.setItem('yi68-album-signature',JSON.stringify(next))}catch{}window.dispatchEvent(new Event('album-signature-change'))}
export function useAlbumSignature(){const [preference,setPreference]=useState<Preference>({artist:'',custom:''});useEffect(()=>{const sync=()=>setPreference({...read()});sync();window.addEventListener('album-signature-change',sync);return()=>window.removeEventListener('album-signature-change',sync)},[]);return {preference,name:preference.custom.trim()||preference.artist,setCustom:(custom:string)=>save({...read(),custom}),change:()=>save({...read(),artist:randomArtist(read().artist),custom:''})}}
export function AlbumSignature({value}:{value:ReturnType<typeof useAlbumSignature>}){return <div className="album-signature"><label>姓名或昵称（选填）<input maxLength={60} value={value.preference.custom} placeholder="留空使用艺术家昵称" onChange={e=>value.setCustom(e.target.value)}/></label><p>🎨 当前艺术家昵称：<strong>{value.preference.artist||'正在分配…'}</strong> <button type="button" onClick={value.change}>换一个</button></p><small>仅作公开署名，可随时更换，不代表身份认证。</small></div>}
