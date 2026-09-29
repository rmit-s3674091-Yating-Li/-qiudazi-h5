import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, RefreshCw, SlidersHorizontal, UserPlus } from "lucide-react";
import { repository } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import { Header, Sheet, ErrorNotice, Loading, Empty, EventCard, isRegistrationOpenClient, levelLabel } from "../components/UI";
import { EventInviteInboxLink } from "../components/EventInviteUI";
import { useLanguage } from "../i18n";
import { matchesHallFilters } from "../domain/HallFilters";

export function Hall({mine=false}:{mine?:boolean}){
  const{t,language}=useLanguage();const en=language==="en";
  const[scope,setScope]=useState("created");const[type,setType]=useState(""),[city,setCity]=useState(""),[level,setLevel]=useState(""),[date,setDate]=useState(""),[status,setStatus]=useState(""),[filter,setFilter]=useState(false);
  const q=useQuery("events"+JSON.stringify({mine,scope,type,level,date,status}),()=>repository.events({mine,scope,match_type:type,level,event_date:date,status}));
  const visibleEvents=q.data?.filter(event=>matchesHallFilters(event,{city}));
  const statusFilters=[["",t("all")],["signup",t("signup")],["locked",t("locked")],["ongoing",t("ongoing")],["finished",t("finished")]];
  const typeFilters=[["",t("all")],["singles",t("singles")],["doubles",t("doubles")]];
  const levelFilters=[["",t("all")],["≤2.0",levelLabel("≤2.0",language)],["2.5","2.5"],["3.0","3.0"],["3.5","3.5"],["4.0","4.0"],["≥4.5",levelLabel("≥4.5",language)]];
  return <><Header title={mine?t("myEvents"):t("hall")} back={false} action={!mine?<button className="icon-button" aria-label={t("filterEvents")} onClick={()=>setFilter(true)}><SlidersHorizontal size={20}/></button>:undefined}/><main className="page">
    {!mine&&<div className="hall-hero"><div className="court-lines"/><div><span className="eyebrow">{t("hall")}</span><h1>{t("hallHero")}</h1><p>{t("hallHeroHint")}</p></div></div>}
    {mine&&<div className="chips"><button className={scope==="created"?"active":""} onClick={()=>{setScope("created");setStatus("");}}>{t("created")}</button><button className={scope==="joined"?"active":""} onClick={()=>{setScope("joined");setStatus("");}}>{t("joined")}</button></div>}
    {mine&&scope==="joined"&&<EventInviteInboxLink/>}
    <div className="section-heading"><h2>{mine?(scope==="created"?t("createdEvents"):t("joinedEvents")):t("recentMatches")}</h2><div className="row">{mine&&scope==="created"&&(!!q.data?.length||!!status)&&<Link className="text-button" to="/events/new"><Plus size={16}/>{t("createEvent")}</Link>}<button className="text-button" onClick={q.refresh} aria-label={t("refreshEvents")}><RefreshCw size={16}/></button></div></div>
    <div className="chips">{(mine?statusFilters:typeFilters).map(([value,label])=><button className={(mine?status:type)===value?"active":""} key={value} onClick={()=>mine?setStatus(value):setType(value)}>{label}</button>)}</div>
    <ErrorNotice message={q.error} retry={q.refresh}/>
    {q.loading&&!q.data?<Loading/>:visibleEvents?.length?visibleEvents.map(e=><div className="event-list-item" key={e.id}><EventCard event={e} manage={mine&&scope==="created"}/>{mine&&scope==="joined"&&e.visibility==="public"&&isRegistrationOpenClient(e)&&<div className="event-list-actions"><Link className="text-button" to={`/events/${e.id}/invite-friends`}><UserPlus size={15}/>{t("invitePartners")}</Link></div>}</div>):!q.error&&<Empty title={mine?(scope==="created"?(status?t("noFilteredEvents"):t("noCreatedEvents")):(status?t("noFilteredEvents"):t("noJoinedEvents"))):t("noDiscoverableEvents")}><p>{mine?(scope==="created"?(status?t("createdFilteredHint"):t("createdEmptyHint")):(status?t("joinedFilteredHint"):t("joinedEmptyHint"))):t("hallEmptyHint")}</p>{mine&&scope==="created"&&!status&&<Link className="button" to="/events/new">{t("createEvent")}</Link>}{!mine&&<Link className="button secondary" to="/my-events">{t("goMyEvents")}</Link>}</Empty>}
  </main><Sheet open={filter} title={t("filterEvents")} onClose={()=>setFilter(false)}><div className="hall-filter-form"><p className="hall-filter-hint muted small">{en?"Filter by city, level and date. Leave a field blank to keep all events visible for that field.":"按城市、参赛级别和日期组合筛选；不填写的条件保持不限。"}</p><div className="hall-filter-fields"><label>{en?"City":"城市"}<input value={city} maxLength={30} inputMode="text" autoComplete="address-level2" placeholder={en?"Optional, e.g. Shanghai":"可选，例如：上海"} onChange={e=>setCity(e.target.value)}/></label><label>{en?"Playing level":"参赛级别"}<select value={level} onChange={e=>setLevel(e.target.value)}>{levelFilters.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>{t("matchDate")}<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label></div><div className="hall-filter-actions"><button className="secondary" onClick={()=>{setDate("");setType("");setCity("");setLevel("");}}>{t("reset")}</button><button onClick={()=>setFilter(false)}>{t("viewEvents")}</button></div></div></Sheet></>;
}
