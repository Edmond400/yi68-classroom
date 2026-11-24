import { notFound } from 'next/navigation';
import { readClass,listAlbums } from '@/lib/albums';
import { HttpError } from '@/lib/http';
import { AlbumCards } from '@/components/album-cards';
import { AlbumExport } from '@/components/album-export';
export const dynamic='force-dynamic';
export const metadata={title:'班级空间',robots:{index:false,follow:false}};
export default async function ClassPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{page?:string;semester?:string}>}){
 const {id}=await params,q=await searchParams,page=Math.max(0,Math.floor(Number(q.page)||0));let space,albums;try{space=await readClass(id);albums=await listAlbums(false,q.semester||'',id,page*60)}catch(e){if(e instanceof HttpError&&e.status===404)notFound();return <p>班级相册暂时无法加载。</p>}
 const link=(p:number)=>'/albums/classes/'+id+'?page='+p+'&semester='+encodeURIComponent(q.semester||'');
 return <><a href="/albums">返回公共相册</a><div className="page-heading"><div><h1>{space.name}</h1><p>{space.description}</p></div><AlbumExport classId={id} name={space.name}/></div><p>整班下载包含全部学期的公开照片，按活动相册分文件夹保存。</p><h2>活动相册</h2><form method="GET"><label>按学期筛选<input name="semester" defaultValue={q.semester} placeholder="如 2026-2027学年秋季"/></label><button className="btn">筛选</button></form><AlbumCards albums={albums.slice(0,60)}/>{!albums.length&&<p>活动相册正在准备中。</p>}{page>0&&<a className="btn" href={link(page-1)}>上一页</a>}{albums.length>60&&<a className="btn" href={link(page+1)}>更多相册</a>}</>;
}
