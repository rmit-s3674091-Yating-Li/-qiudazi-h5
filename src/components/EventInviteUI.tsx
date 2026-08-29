import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, X } from "lucide-react";
import { Avatar, Empty, ErrorNotice, Header, Loading, Sheet } from "./UI";
import { explainError, rpc } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

type Connection = {
  connection_id: string;
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  created_at: string;
};

type EventInvite = {
  id: string;
  event_id: string;
  event_name: string;
  event_date: string | null;
  venue: string | null;
  inviter_user_id: string;
  inviter_nickname: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  created_at: string;
};

export function EventInviteSheet({ eventId, open, onClose }: { eventId: string; open: boolean; onClose: () => void }) {
  const q = useQuery("event-invite-connections-" + eventId, () => rpc<Connection[]>("list_connections"), 15000);
  const [busy, setBusy] = useState<string | null>(null);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");
  async function invite(profileId: string) {
    setBusy(profileId);
    setError("");
    try {
      await rpc("invite_connection_to_event", { p_event_id: eventId, p_invitee_user_id: profileId });
      setSent((prev) => new Set(prev).add(profileId));
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <Sheet open={open} title="邀请球搭子" onClose={onClose}>
      <p className="muted small">发送站内赛事邀请。对方可以在“我的赛事”里查看并回应。</p>
      <ErrorNotice message={error || q.error} retry={q.refresh} />
      {q.loading && !q.data ? <Loading /> : q.data?.length ? (
        <div className="stack">
          {q.data.map((c) => {
            const done = sent.has(c.id);
            return (
              <div className="card row" key={c.connection_id}>
                <Avatar path={c.avatar_url} name={c.nickname || "球搭子"} size={40} />
                <strong className="grow">{c.nickname || "球搭子"}</strong>
                <button className={done ? "secondary" : ""} disabled={done || busy === c.id} onClick={() => invite(c.id)}>
                  {done ? "已邀请" : busy === c.id ? "发送中…" : "邀请"}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty title="还没有可邀请的球搭子"><p>先和朋友建立球搭子关系，再从赛事里邀请 TA。</p><Link className="button secondary" to="/players" onClick={onClose}>去球搭子们</Link></Empty>
      )}
    </Sheet>
  );
}

export function EventInviteInboxLink() {
  const q = useQuery("my-event-invites-summary", () => rpc<EventInvite[]>("list_my_event_invites"), 15000);
  const pending = q.data?.filter((i) => i.status === "pending").length || 0;
  return (
    <Link className="card row between" to="/event-invites">
      <div>
        <strong>赛事邀请{pending ? ` · ${pending} 条待回应` : ""}</strong>
        <p className="muted small">查看球搭子发给你的参赛邀请</p>
      </div>
      <ArrowRight size={18} />
    </Link>
  );
}

export function EventInvitesPage() {
  const q = useQuery("my-event-invites", () => rpc<EventInvite[]>("list_my_event_invites"), 10000);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  async function respond(id: string, accept: boolean) {
    setBusy(id);
    setError("");
    try {
      await rpc("respond_event_invite", { p_invite_id: id, p_accept: accept });
      await q.refresh();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <Header title="赛事邀请" />
      <main className="page">
        <span className="eyebrow">EVENT INVITATIONS</span>
        <h1>收到的邀请</h1>
        <p className="muted">接受表示你愿意参加；请进入赛事详情后点击“立即报名”，选择本次实际参赛者并完成报名。</p>
        <ErrorNotice message={error || q.error} retry={q.refresh} />
        {q.loading && !q.data ? <Loading /> : q.data?.length ? (
          <div className="stack">
            {q.data.map((i) => (
              <article className="card" key={i.id}>
                <p className="muted small">{i.inviter_nickname || "一位球搭子"} 邀请你参加</p>
                <h3>{i.event_name}</h3>
                <p className="muted small">{i.event_date || "日期待定"} · {i.venue || "场地待定"}</p>
                {i.status === "pending" ? (
                  <div className="row">
                    <button className="grow" disabled={busy === i.id} onClick={() => respond(i.id, true)}><Check size={16} />接受</button>
                    <button className="secondary grow" disabled={busy === i.id} onClick={() => respond(i.id, false)}><X size={16} />拒绝</button>
                  </div>
                ) : (
                  <p className="muted small">{i.status === "accepted" ? "已接受邀请" : i.status === "declined" ? "已拒绝邀请" : "邀请已结束"}</p>
                )}
                <Link className="button secondary full" to={`/events/${i.event_id}`}>查看赛事</Link>
              </article>
            ))}
          </div>
        ) : (
          <Empty title="暂时没有赛事邀请"><p>当球搭子邀请你参赛时，会出现在这里。</p></Empty>
        )}
      </main>
    </>
  );
}
