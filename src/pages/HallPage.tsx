import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, SlidersHorizontal, UserPlus } from "lucide-react";
import { repository } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import { Header, Sheet, ErrorNotice, Loading, Empty, EventCard, isRegistrationOpenClient } from "../components/UI";
import { EventInviteInboxLink } from "../components/EventInviteUI";

export function Hall({mine=false}:{mine?:boolean}){
  const[scope,setScope]=useState("created");const[type,setType]=useState(""),[date,setDate]=useState(""),[status,setStatus]=useState(""),[filter,setFilter]=useState(false);
  const q=useQuery("events"+JSON.stringify({mine,scope,type,date,status}),()=>repository.events({mine,scope,match_type:type,event_date:date,status}));
  return <><Header title={mine?"我的赛事":"球搭子"} back={false} action={!mine?<button className="icon-button" aria-label="筛选赛事" onClick={()=>setFilter(true)}><SlidersHorizontal size={20}/></button>:undefined}/><main className="page">
    {!mine&&<div className="hall-hero"><div className="court-lines"/><div><span className="eyebrow">赛事大厅</span><h1>下一场球，<br/>从这里开场。</h1><p>和球搭子，一起认真打场好球。</p></div></div>}
    {mine&&<div className="chips"><button className={scope==="created"?"active":""} onClick={()=>{setScope("created");setStatus("");}}>我创建的</button><button className={scope==="joined"?"active":""} onClick={()=>{setScope("joined");setStatus("");}}>我参与的</button></div>}
    {mine&&scope==="joined"&&<EventInviteInboxLink/>}
    <div className="section-heading"><h2>{mine?(scope==="created"?"我创建的赛事":"我参与的赛事"):"最近的比赛"}</h2><div className="row">{mine&&scope==="created"&&(!!q.data?.length||!!status)&&<Link className="text-button" to="/events/new"><Plus size={16}/>创建赛事</Link>}<button className="text-button" onClick={q.refresh} aria-label="刷新赛事"><RefreshCw size={16}/></button></div></div>
    <div className="chips">{(mine?[["","全部"],["signup","报名中"],["locked","已锁定"],["ongoing","进行中"],["finished","已结束"]]:[["","全部"],["singles","单打"],["doubles","双打"]]).map(([value,label])=><button className={(mine?status:type)===value?"active":""} key={value} onClick={()=>mine?setStatus(value):setType(value)}>{label}</button>)}</div>
    <ErrorNotice message={q.error} retry={q.refresh}/>
    {q.loading&&!q.data?<Loading/>:q.data?.length?q.data.map(e=><div className="event-list-item" key={e.id}><EventCard event={e} manage={mine&&scope==="created"}/>{mine&&scope==="joined"&&e.visibility==="public"&&isRegistrationOpenClient(e)&&<div className="event-list-actions"><Link className="text-button" to={`/events/${e.id}/invite-friends`}><UserPlus size={15}/>喊球搭子一起来</Link></div>}</div>):!q.error&&<Empty title={mine?(scope==="created"?(status?"当前筛选下没有赛事":"还没有创建赛事"):(status?"当前筛选下没有赛事":"还没有参与赛事")):"暂时没有可发现赛事"}><p>{mine?(scope==="created"?(status?"换个赛事状态看看，或创建一场新的比赛。":"召集搭子，开始一场自己的比赛。"):(status?"换个赛事状态看看。":"完成报名后，赛事会出现在这里。收到的邀请可以在上方查看。")):"现在还没有可以发现的比赛。可以稍后再来，或去“我的赛事”看看自己的比赛。"}</p>{mine&&scope==="created"&&!status&&<Link className="button" to="/events/new">创建赛事</Link>}{!mine&&<Link className="button secondary" to="/my-events">去我的赛事</Link>}</Empty>}
  </main><Sheet open={filter} title="筛选赛事" onClose={()=>setFilter(false)}><p className="muted small">参赛建议级别目前用于赛事信息展示，不作为硬性报名资格；本版暂不提供单值级别筛选，避免沿用旧“赛事级别”造成误导。</p><label>比赛日期<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><div className="row"><button className="secondary grow" onClick={()=>{setDate("");setType("");}}>重置</button><button className="grow" onClick={()=>setFilter(false)}>查看赛事</button></div></Sheet></>;
}
