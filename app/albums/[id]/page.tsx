import { notFound } from 'next/navigation';
import { readAlbum } from '@/lib/albums';
import { HttpError } from '@/lib/http';
import { AlbumGallery } from '@/components/album-gallery';
import { AlbumExport } from '@/components/album-export';
export const dynamic='force-dynamic';
export const metadata={title:'活动相册',robots:{index:false,follow:false}};
export default async function AlbumPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{photo?:string}>}){
 const {id}=await params,{photo}=await searchParams;let data;try{data=await readAlbum(id,false,0,photo||'')}catch(e){if(e instanceof HttpError&&e.status===404)notFound();return <p className="callout">相册暂时无法加载，请稍后刷新。</p>}
 return <><a className="text-link" href={'/albums/classes/'+data.album.class_id}>返回班级相册</a><div className="page-heading"><div><p className="eyebrow">CLASS 68 / MOMENTS</p><h1>{data.album.title}</h1><p>{data.album.activity_date} · {data.album.photo_count} 张照片 · {data.album.semester}</p></div><AlbumExport albumId={id} name={data.album.title} disabled={!data.album.photo_count}/></div>{data.album.description&&<p className="album-description">{data.album.description}</p>}<AlbumGallery albumId={id} photos={data.photos} uploadsOpen={!!data.album.uploads_open} commentsOpen={!!data.album.comments_open} nextOffset={data.next_offset} focus={photo||''}/></>;
}

