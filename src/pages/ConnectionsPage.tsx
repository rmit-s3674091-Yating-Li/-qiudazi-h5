import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Avatar, Header, Loading, Empty, ErrorNotice } from "../components/UI";
import { rpc, explainError } from "../repositories/supabase";
import { useAuth } from "../hooks/Auth";
import { useQuery } from "../hooks/useQuery";

type Connection = {
  connection_id: string;
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
};

type Invite = {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  relationship_status: "self" | "accepted" | "pending" | "rejected" | "none";
};

export function ConnectionsPage() {
  const { profile } = useAuth();
  const [feedback, setFeedback] = useState("");
  const connections = useQuery(
    "connections",
    () => rpc<Connection[]>("list_connections"),
    15000,
  );

  async function shareInvite() {
    if (!profile?.id) return;
    const url = `${window.location.origin}${window.location.pathname}?connect=${encodeURIComponent(profile.id)}`;
    try {
      if (navigator.share) {
        await navigator.share({
          title: "球搭子邀请",
          text: `${profile.nickname || "你的朋友"} 邀请你成为球搭子`,
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        setFeedback("邀请链接已复制");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFeedback("分享失败，请重试");
    }
  }

  return (
    <>
      <Header
        title="球搭子们"
        back={false}
        action={
          <button className="icon-button" aria-label="邀请球搭子" onClick={shareInvite}>
            <Plus />
          </button>
        }
      />
      <main className="page">
        <span className="eyebrow">YOUR TENNIS PEOPLE</span>
        <h1>球搭子们</h1>
        <p className="muted">这里放的是已经建立关系的真实用户，方便以后约球和双打组队。</p>
        {feedback && <div className="notice">{feedback}</div>}
        <div className="section-heading">
          <h2>我的球搭子</h2>
          <button className="text-button" onClick={shareInvite}>
            <Plus size={16} />
            邀请球搭子
          </button>
        </div>
        <ErrorNotice message={connections.error} retry={connections.refresh} />
        {connections.loading && !connections.data ? (
          <Loading />
        ) : connections.data?.length ? (
          connections.data.map((c) => (
            <div className="card row" key={c.connection_id}>
              <Avatar path={c.avatar_url} name={c.nickname || "球搭子"} />
              <strong className="grow">{c.nickname || "球搭子"}</strong>
            </div>
          ))
        ) : (
          <Empty title="还没有球搭子">
            <p>邀请一起打球的朋友建立球搭子关系，之后双打组队时可以直接邀请 TA。</p>
            <button onClick={shareInvite}>邀请球搭子</button>
          </Empty>
        )}
      </main>
    </>
  );
}

export function ConnectionInvitePage() {
  const { inviterId } = useParams(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const q = useQuery(
    "connection-invite-" + inviterId,
    () => rpc<Invite>("get_connection_invite", { p_inviter_profile_id: inviterId }),
    15000,
  );

  async function accept() {
    if (!inviterId) return;
    setBusy(true);
    try {
      await rpc("accept_connection_invite", { p_inviter_profile_id: inviterId });
      await q.refresh();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.loading && !q.data) {
    return (
      <>
        <Header title="球搭子邀请" />
        <main className="page"><Loading /></main>
      </>
    );
  }

  const i = q.data;
  return (
    <>
      <Header title="球搭子邀请" />
      <main className="page profile-page">
        <ErrorNotice message={q.error || error} />
        {i && (
          <>
            <Avatar path={i.avatar_url} name={i.nickname || "球搭子"} size={92} />
            <span className="eyebrow">LET'S PLAY TOGETHER</span>
            <h1>{i.nickname || "一位朋友"}<br />邀请你成为球搭子</h1>
            <p className="muted">成为球搭子后，你们会出现在彼此的球搭子列表里。</p>
            {i.relationship_status === "self" ? (
              <button className="full" onClick={() => navigate("/players")}>这是我的邀请链接</button>
            ) : i.relationship_status === "accepted" ? (
              <button className="full" onClick={() => navigate("/players")}>已经是球搭子 · 查看列表</button>
            ) : (
              <button className="full" disabled={busy} onClick={accept}>{busy ? "正在添加…" : "加为球搭子"}</button>
            )}
          </>
        )}
      </main>
    </>
  );
}
