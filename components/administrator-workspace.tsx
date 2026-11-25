'use client';
import { useEffect,useState } from 'react';
import { api } from '@/lib/client';
import { clearAdministratorSession } from '@/lib/administrator-session';
import { AdministratorAccess,AdministratorBar } from './administrator-forms';
import { AdminConsole } from './admin-console';
import { BirthdayResults } from './birthday-results';
import { BoysDaySurveyAdmin } from './boys-day-survey-admin';
import { FavoriteCharacterSurveyAdmin } from './favorite-character-survey-admin';
import {FundsView} from './funds';
import { IncentiveAdmin } from './incentive-admin';
import { AlbumAdmin } from './album-admin';
import { DrinkOrderAdmin } from './drink-order-admin';
import { TalentSurveyAdmin } from './talent-survey-admin';
import { SongRequestAdmin } from './song-request-admin';
import { SketchHomeworkAdmin } from './sketch-homework';
import { ColorHomeworkAdmin } from './color-homework';
import {HomeConfigAdmin} from './home-config-admin';
import {SiteAnalytics} from './site-analytics';
const pages = {
 homeConfig:{title:'首页管理',Content:HomeConfigAdmin},
 analytics:{title:'站点监测',Content:SiteAnalytics},
 sketchHomework: { title: '素描作业上交登记', Content: SketchHomeworkAdmin },
 homework: { title: '色彩作业上交登记', Content: ColorHomeworkAdmin },
 songs: { title: '现场点歌管理', Content: SongRequestAdmin },
 talent: { title: '才艺表演报名管理', Content: TalentSurveyAdmin },
 drinks: { title: '男生节饮品订单', Content: DrinkOrderAdmin },
 albums: { title: '班级相册管理', Content: AlbumAdmin },
 class: { title: '班务管理', Content: AdminConsole },
 birthdays: { title: '生日问卷结果', Content: BirthdayResults },
 boysDay: { title: '男生节征题管理', Content: BoysDaySurveyAdmin },
 favoriteCharacter: { title: '角色图片征集管理', Content: FavoriteCharacterSurveyAdmin },
 activities: { title: '活动参与管理', Content: IncentiveAdmin },
 funds: { title: '班费管理', Content: () => <FundsView admin /> },
};
type Page = keyof typeof pages;
export function AdministratorWorkspace({configured,initialPage='birthdays'}:{configured:boolean;initialPage?:Page}){
 const [ready,setReady]=useState(false),[authenticated,setAuthenticated]=useState(false),[page,setPage]=useState(initialPage),[error,setError]=useState(''),[message,setMessage]=useState('');
 useEffect(()=>{let live=true;api('/api/admin/auth').then(()=>{if(live)setAuthenticated(true)}).catch(e=>{if(live){setAuthenticated(false);if(e.message==='请先登录管理员账号。')clearAdministratorSession();else setError(e.message)}}).finally(()=>{if(live)setReady(true)});return()=>{live=false}},[]);
 if(!ready)return <p className="callout" role="status">正在恢复管理员登录状态…</p>;
 if(!authenticated)return <div className="narrow"><div className="page-heading"><div><p className="eyebrow">CLASS ADMINISTRATION</p><h1>{configured?'管理员登录':'设置管理员账号'}</h1></div></div><section className="panel form-panel"><h2>{configured?'班级信息，妥善管理':'仅班长可初始化'}</h2><p>使用主管理员账号管理班务。获授权的同学请从“我的参与”进入活动管理。</p>{error&&<p role="alert" className="callout error">{error}</p>}{message&&<p role="status" className="callout">{message}</p>}<AdministratorAccess configured={configured} onLogin={()=>{setError('');setMessage('');setAuthenticated(true)}}/></section></div>;
 const { title, Content } = pages[page];
 return <><div className="page-heading"><div><p className="eyebrow">CLASS ADMINISTRATION</p><h1>{title}</h1></div></div><AdministratorBar onNavigate={setPage} onSignedOut={changed=>{setAuthenticated(false);setError('');setMessage(changed?'密码已更新，请使用新密码登录。':'')}}/><Content/></>;
}


