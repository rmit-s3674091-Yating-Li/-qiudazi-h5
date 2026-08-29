import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import type { Player } from "../domain/types";
import { Avatar, Header, Loading, Empty, ErrorNotice } from "../components/UI";
import { repository, rpc, explainError } from "../repositories/supabase";
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

type ClaimInvite = {
  token: string;
  player_name: string;
  inviter_nickname: string | null;
  inviter_avatar_url: string | null;
  invite_status: "pending" | "accepted" | "cancelled" | "expired";
  is_self_inviter: boolean;
};

type CreatedClaimInvite = {
  token: string;
  player_id: string;
  player_name: string;
};

async function shareUrl(title: string, text: string, url: string) {
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return "";
  }
  await navigator.clipboard.writeText(url);
  return "邀请链接已复制";
}

export function ConnectionsPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<"connections" | "temporary">("connections");
  const [feedback, setFeedback] = useState("");
  const [sharingPlayerId, setSharingPlayerId] = useState("");
  const connections = useQuery(
    "connections",
    () => rpc<Connection[]>("list_connections"),
    15000,
  );
  const players = useQuery("partner-players", () => repository.players(), 15000);
  const temporaryPlayers = (players.data || []).filter(
    (p) => p.player_type === "manual" && !p.linked_user_id,
  );

  async function shareConnectionInvite() {
    if (!profile?.id) return;
    const url = `${window.location.origin}${window.location.pathname}?connect=${encodeURIComponent(profile.id)}`;
    try {
      setFeedback(
        await shareUrl(
          "球搭子邀请",
          `${profile.nickname || "你的朋友"} 邀请你加入球搭子，一起打球。`,
          url,
        ),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFeedback("分享失败，请重试");
    }
  }

  async function shareTemporaryPlayerInvite(player: Player) {
    setSharingPlayerId(player.id);
    setFeedback("");
    try {
      const rows = await rpc<CreatedClaimInvite[]>("create_player_claim_invite", {
        p_player_id: player.id,
      });
      const invite = rows[0];
      if (!invite) throw new Error("邀请创建失败，请重试");
      const url = `${window.location.origin}${window.location.pathname}?claim=${encodeURIComponent(invite.token)}`;
      setFeedback(
        await shareUrl(
          `邀请 ${player.name} 加入球搭子`,
          `我之前已经在球搭子里帮你记录过比赛。加入后，这些记录可以关联到你的打球档案。`,
          url,
        ),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFeedback(explainError(e));
    } finally {
      setSharingPlayerId("");
    }
  }

  const loading = tab === "connections" ? connections.loading : players.loading;
  const error = tab === "connections" ? connections.error : players.error;
  const retry = tab === "connections" ? connections.refresh : players.refresh;

  return (
    <>
      <Header title="球搭子们" back={false} />
      <main className="page">
        <span className="eyebrow">YOUR TENNIS PEOPLE</span>
        <h1>球搭子们</h1>
        <p className="muted">管理一起打球的人。有人已经在用球搭子，也有人暂时由你代为记录。</p>

        <div className="chips partner-tabs" role="tablist" aria-label="球搭子分类">
          <button
            className={tab === "connections" ? "active" : ""}
            onClick={() => { setTab("connections"); setFeedback(""); }}
          >
            我的球搭子
          </button>
          <button
            className={tab === "temporary" ? "active" : ""}
            onClick={() => { setTab("temporary"); setFeedback(""); }}
          >
            临时球搭子
          </button>
        </div>

        {feedback && <div className="notice">{feedback}</div>}

        <div className="section-heading">
          <div>
            <h2>{tab === "connections" ? "我的球搭子" : "临时球搭子"}</h2>
            <p className="muted small">
              {tab === "connections"
                ? "已经自己使用球搭子，并和你建立关系的人。"
                : "由你代录的人，对方现在不需要做任何操作。"}
            </p>
          </div>
          {tab === "connections" ? (
            <button className="text-button" onClick={shareConnectionInvite}>
              <Plus size={16} />
              邀请球搭子
            </button>
          ) : (
            <Link className="text-button" to="/players/new">
              <Plus size={16} />
              添加临时球搭子
            </Link>
          )}
        </div>

        <ErrorNotice message={error} retry={retry} />
        {loading && !(tab === "connections" ? connections.data : players.data) ? (
          <Loading />
        ) : tab === "connections" ? (
          connections.data?.length ? (
            <div className="partner-list">
              {connections.data.map((c) => (
                <div className="card row partner-card" key={c.connection_id}>
                  <Avatar path={c.avatar_url} name={c.nickname || "球搭子"} />
                  <div className="grow">
                    <strong>{c.nickname || "球搭子"}</strong>
                    <div className="muted small">以后报名双打时可以直接邀请 TA 组队</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty title="还没有球搭子">
              <p>把邀请分享给一起打球的朋友。TA 加入后会直接出现在这里。</p>
            </Empty>
          )
        ) : temporaryPlayers.length ? (
          <div className="partner-list">
            {temporaryPlayers.map((p) => (
              <div className="card partner-card" key={p.id}>
                <div className="row">
                  <Link className="row grow partner-person-link" to={`/players/${p.id}/edit`}>
                    <Avatar path={p.avatar_url} name={p.name} />
                    <div className="grow">
                      <div className="row partner-name-row">
                        <strong>{p.name}</strong>
                        <span className="badge">临时</span>
                      </div>
                      <div className="muted small">你代为创建和管理的打球档案</div>
                    </div>
                  </Link>
                </div>
                <div className="partner-card-action">
                  <button
                    className="text-button"
                    disabled={sharingPlayerId === p.id}
                    onClick={() => shareTemporaryPlayerInvite(p)}
                  >
                    {sharingPlayerId === p.id ? "正在准备邀请…" : "邀请 TA 加入球搭子"}
                  </button>
                </div>
              </div>
            ))}
            <p className="identity-note">
              临时球搭子以后自己开始使用球搭子时，可以通过你的专属邀请关联之前的比赛记录；关联完成后会自动进入“我的球搭子”。
            </p>
          </div>
        ) : (
          <Empty title="还没有临时球搭子">
            <p>需要替还没使用球搭子的朋友报名或记录比赛时，可以先帮 TA 建一个临时档案。</p>
          </Empty>
        )}
      </main>
    </>
  );
}

export function ConnectionInvitePage() {
  const { inviterId } = useParams(), navigate = useNavigate();
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const q = useQuery(
    "connection-invite-" + inviterId,
    () => rpc<Invite>("get_connection_invite", { p_inviter_profile_id: inviterId }),
    15000,
  );

  async function accept() {
    if (!inviterId || busy) return;
    setBusy(true);
    setError("");
    try {
      await rpc("accept_connection_invite", { p_inviter_profile_id: inviterId });
      await q.refresh();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!q.data || attempted || q.data.relationship_status === "self" || q.data.relationship_status === "accepted") return;
    setAttempted(true);
    void accept();
  }, [q.data?.relationship_status, attempted, inviterId]);

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
            {i.relationship_status === "self" ? (
              <>
                <h1>这是你的球搭子邀请</h1>
                <p className="muted">把这个邀请分享给想一起打球的人就可以了。</p>
                <button className="full" onClick={() => navigate("/players")}>回到球搭子们</button>
              </>
            ) : i.relationship_status === "accepted" ? (
              <>
                <h1>你和 {i.nickname || "TA"}<br />已经是球搭子了</h1>
                <p className="muted">以后可以直接一起报名、组双打，也会出现在彼此的球搭子列表里。</p>
                <button className="full" onClick={() => navigate("/players")}>看看我的球搭子</button>
              </>
            ) : (
              <>
                <h1>{i.nickname || "一位朋友"}<br />正在把你加为球搭子</h1>
                <p className="muted">{busy ? "马上就好…" : "打开邀请后会自动建立球搭子关系，不需要再确认一次。"}</p>
                {busy ? <Loading /> : error ? <button className="full" onClick={accept}>重试</button> : <Loading />}
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}

export function PlayerClaimInvitePage() {
  const { token } = useParams(), navigate = useNavigate();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const q = useQuery(
    "player-claim-invite-" + token,
    () => rpc<ClaimInvite[]>("get_player_claim_invite", { p_token: token }).then((rows) => rows[0] || null),
    15000,
  );

  async function acceptClaim() {
    if (!token) return;
    setBusy(true);
    setError("");
    try {
      await rpc("accept_player_claim_invite", { p_token: token });
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
        <Header title="关联打球记录" />
        <main className="page"><Loading /></main>
      </>
    );
  }

  const invite = q.data;
  return (
    <>
      <Header title="关联打球记录" />
      <main className="page profile-page">
        <ErrorNotice message={q.error || error} />
        {!invite ? (
          <Empty title="这个邀请已经不可用了">
            <p>请让对方重新从临时球搭子里发一次邀请。</p>
          </Empty>
        ) : invite.is_self_inviter ? (
          <>
            <Avatar path={invite.inviter_avatar_url} name={invite.inviter_nickname || "球搭子"} size={92} />
            <h1>这是你发给 {invite.player_name} 的邀请</h1>
            <p className="muted">把链接发给 TA，由 TA 自己确认关联历史记录。</p>
            <button className="full" onClick={() => navigate("/players")}>回到临时球搭子</button>
          </>
        ) : invite.invite_status === "accepted" ? (
          <>
            <span className="eyebrow">HISTORY CONNECTED</span>
            <h1>之前的打球记录<br />已经关联好了</h1>
            <p className="muted">这些比赛和战绩现在已经归到你的打球档案里，你们也已经成为球搭子。</p>
            <button className="full" onClick={() => navigate("/players")}>看看我的球搭子</button>
          </>
        ) : invite.invite_status !== "pending" ? (
          <Empty title="这个邀请已经失效">
            <p>请让 {invite.inviter_nickname || "对方"} 重新发送邀请。</p>
          </Empty>
        ) : (
          <>
            <Avatar path={invite.inviter_avatar_url} name={invite.inviter_nickname || "球搭子"} size={92} />
            <span className="eyebrow">YOUR TENNIS HISTORY</span>
            <h1>这是你之前的<br />打球记录吗？</h1>
            <div className="card claim-record-card">
              <span className="badge">之前由 TA 代录</span>
              <h2>{invite.player_name}</h2>
              <p className="muted">{invite.inviter_nickname || "一位球友"} 邀请你把这份历史记录关联到自己的打球档案。</p>
            </div>
            <p className="muted">确认后，之前以“{invite.player_name}”参加的比赛会保留下来，并归到你自己的战绩中。</p>
            <button className="full" disabled={busy} onClick={acceptClaim}>
              {busy ? "正在关联…" : "是我，关联这些记录"}
            </button>
          </>
        )}
      </main>
    </>
  );
}
