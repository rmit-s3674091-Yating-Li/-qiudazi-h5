import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, IdentityGate } from "./hooks/Auth";
import { configured } from "./repositories/supabase";
import { BottomNav, Brand } from "./components/UI";
import { Hall, PlayerForm, ProfilePage, PrivacyPage, EventForm } from "./pages/Basics";
import { MyProfileHome } from "./pages/MyProfileHome";
import { MyResultsPage } from "./pages/MyResultsPage";
import { MyTennisProfilePage } from "./pages/MyTennisProfilePage";
import { ConnectionsPage, ConnectionInvitePage } from "./pages/ConnectionsPage";
import { EventPage } from "./pages/EventPage";
import { MatchPage } from "./pages/MatchPage";
import "./styles.css";
import "./polish.css";
function App(){const location=useLocation();if(!configured)return <main className="app-shell setup page"><Brand/><div className="court-mini"/><h1>球场已准备好，<br/>还差在线连接。</h1><p>当前没有配置 Supabase 项目。为保证你和朋友访问同一份数据，本产品不会退回本地 Demo。</p><div className="notice">按 README 配置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重新构建。</div></main>;const tab=["/events","/my-events","/players","/me"].includes(location.pathname);return <div className={"app-shell "+(tab?"with-nav":"")}><Routes><Route path="/" element={<Navigate to="/events" replace/>}/><Route path="/events" element={<IdentityGate><Hall/></IdentityGate>}/><Route path="/my-events" element={<IdentityGate><Hall mine/></IdentityGate>}/><Route path="/my-results" element={<IdentityGate><MyResultsPage/></IdentityGate>}/><Route path="/players" element={<IdentityGate><ConnectionsPage/></IdentityGate>}/><Route path="/connect/:inviterId" element={<IdentityGate><ConnectionInvitePage/></IdentityGate>}/><Route path="/players/new" element={<IdentityGate><PlayerForm/></IdentityGate>}/><Route path="/players/:id/edit" element={<IdentityGate><PlayerForm/></IdentityGate>}/><Route path="/my-tennis-profile" element={<IdentityGate><MyTennisProfilePage/></IdentityGate>}/><Route path="/me" element={<IdentityGate><MyProfileHome/></IdentityGate>}/><Route path="/profile" element={<ProfilePage/>}/><Route path="/privacy" element={<PrivacyPage/>}/><Route path="/events/new" element={<IdentityGate><EventForm/></IdentityGate>}/><Route path="/events/:id/edit" element={<IdentityGate><EventForm/></IdentityGate>}/><Route path="/events/:id/manage" element={<IdentityGate><EventPage manage/></IdentityGate>}/><Route path="/events/:id/matches/:matchId" element={<MatchPage/>}/><Route path="/events/:id/matches/:matchId/score" element={<IdentityGate><MatchPage mode="direct"/></IdentityGate>}/><Route path="/events/:id/matches/:matchId/live" element={<IdentityGate><MatchPage mode="live"/></IdentityGate>}/><Route path="/events/:id" element={<EventPage/>}/><Route path="*" element={<main className="page"><h1>没有找到这个球场</h1><a href="#/events">回到赛事大厅</a></main>}/></Routes>{tab&&<BottomNav/>}</div>}
ReactDOM.createRoot(document.getElementById("root")!).render(<React.StrictMode><HashRouter><AuthProvider><App/></AuthProvider></HashRouter></React.StrictMode>);
