import React from "react";
import ReactDOM from "react-dom/client";
import {
  HashRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, IdentityGate } from "./hooks/Auth";
import { configured } from "./repositories/supabase";
import { BottomNav, Brand } from "./components/UI";
import {
  EventForm,
  Hall,
  PrivacyPage,
} from "./pages/Basics";
import { InviteAwareProfilePage } from "./pages/InviteAwareProfilePage";
import { MyProfileHome } from "./pages/MyProfileHome";
import { MyResultsPage } from "./pages/MyResultsPage";
import { MyTennisProfilePage } from "./pages/MyTennisProfilePage";
import { PartnerInvitesPage } from "./pages/PartnerInvitesPage";
import { PlayerFormPage } from "./pages/PlayerFormPage";
import {
  ConnectionInvitePage,
  ConnectionsPage,
  PlayerClaimInvitePage,
} from "./pages/ConnectionsPage";
import { EventPage } from "./pages/EventPage";
import { MatchPage } from "./pages/MatchPage";
import { EventInvitesPage } from "./components/EventInviteUI";
import "./styles.css";
import "./polish.css";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function HomeRedirect() {
  const params = new URLSearchParams(window.location.search);
  const claimToken = params.get("claim");
  if (claimToken && uuidPattern.test(claimToken)) {
    return <Navigate to={`/claim-player/${claimToken}`} replace />;
  }
  const inviterId = params.get("connect");
  if (inviterId && uuidPattern.test(inviterId)) {
    return <Navigate to={`/connect/${inviterId}`} replace />;
  }
  return <Navigate to="/events" replace />;
}

function App() {
  const location = useLocation();
  if (!configured) {
    return (
      <main className="app-shell setup page">
        <Brand />
        <h1>
          球场已准备好，
          <br />
          还差在线连接。
        </h1>
        <p>当前没有配置 Supabase 项目。</p>
      </main>
    );
  }
  const tab = ["/events", "/my-events", "/players", "/me"].includes(
    location.pathname,
  );
  return (
    <div className={"app-shell " + (tab ? "with-nav" : "")}>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/events" element={<IdentityGate><Hall /></IdentityGate>} />
        <Route path="/my-events" element={<IdentityGate><Hall mine /></IdentityGate>} />
        <Route path="/event-invites" element={<IdentityGate><EventInvitesPage /></IdentityGate>} />
        <Route path="/my-results" element={<IdentityGate><MyResultsPage /></IdentityGate>} />
        <Route path="/players" element={<IdentityGate><ConnectionsPage /></IdentityGate>} />
        <Route path="/partner-invites" element={<IdentityGate><PartnerInvitesPage /></IdentityGate>} />
        <Route path="/connect/:inviterId" element={<IdentityGate><ConnectionInvitePage /></IdentityGate>} />
        <Route path="/claim-player/:token" element={<IdentityGate><PlayerClaimInvitePage /></IdentityGate>} />
        <Route path="/players/new" element={<IdentityGate><PlayerFormPage /></IdentityGate>} />
        <Route path="/players/:id/edit" element={<IdentityGate><PlayerFormPage /></IdentityGate>} />
        <Route path="/my-tennis-profile" element={<IdentityGate><MyTennisProfilePage /></IdentityGate>} />
        <Route path="/me" element={<IdentityGate><MyProfileHome /></IdentityGate>} />
        <Route path="/profile" element={<InviteAwareProfilePage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route path="/events/new" element={<IdentityGate><EventForm /></IdentityGate>} />
        <Route path="/events/:id/edit" element={<IdentityGate><EventForm /></IdentityGate>} />
        <Route path="/events/:id/manage" element={<IdentityGate><EventPage manage /></IdentityGate>} />
        <Route path="/events/:id/matches/:matchId" element={<MatchPage />} />
        <Route path="/events/:id/matches/:matchId/score" element={<IdentityGate><MatchPage mode="direct" /></IdentityGate>} />
        <Route path="/events/:id/matches/:matchId/live" element={<IdentityGate><MatchPage mode="live" /></IdentityGate>} />
        <Route path="/events/:id" element={<EventPage />} />
        <Route path="*" element={<main className="page"><h1>没有找到这个球场</h1><a href="#/events">回到赛事大厅</a></main>} />
      </Routes>
      {tab && <BottomNav />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>,
);
