import { useState } from "react";
import { Header, Loading, Empty, ErrorNotice } from "../components/UI";
import { rpc, explainError } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

type ClaimInviteRow = {
  id: string;
  token: string;
  player_id: string;
  player_name: string;
  status: "pending" | "accepted" | "cancelled" | "expired";
  created_at: string;
  responded_at: string | null;
};

async function shareUrl(title: string, text: string, url: string) {
  if (navigator.share) {
    await navigator.share({ title, text, url });
    return "";
  }
  await navigator.clipboard.writeText(url);
  return "邀请链接已复制";
}

const statusLabel: Record<ClaimInviteRow["status"], string> = {
  pending: "等待加入",
  accepted: "已关联",
  cancelled: "已取消",
  expired: "已失效",
};

export function PartnerInvitesPage() {
  const [feedback, setFeedback] = useState("");
  const [busyId, setBusyId] = useState("");
  const q = useQuery(
    "my-player-claim-invites",
    () => rpc<ClaimInviteRow[]>("list_my_player_claim_invites"),
    15000,
  );

  async function reshare(invite: ClaimInviteRow) {
    const url = `${window.location.origin}${window.location.pathname}?claim=${encodeURIComponent(invite.token)}`;
    try {
      setFeedback(
        await shareUrl(
          `邀请 ${invite.player_name} 加入球搭子`,
          "我之前已经在球搭子里帮你记录过比赛。加入后，这些记录可以关联到你的打球档案。",
          url,
        ),
      );
    } catch (e) {
      if ((e as Error).name !== "AbortError") setFeedback("分享失败，请重试");
    }
  }

  async function cancel(invite: ClaimInviteRow) {
    setBusyId(invite.id);
    setFeedback("");
    try {
      await rpc("cancel_player_claim_invite", { p_invite_id: invite.id });
      await q.refresh();
      setFeedback("邀请已取消");
    } catch (e) {
      setFeedback(explainError(e));
    } finally {
      setBusyId("");
    }
  }

  return (
    <>
      <Header title="邀请记录" />
      <main className="page">
        <span className="eyebrow">INVITE ACTIVITY</span>
        <h1>邀请记录</h1>
        <p className="muted">
          这里看需要持续跟踪的邀请状态。邀请新的球搭子、添加或管理临时球搭子，都回到“球搭子们”操作。
        </p>

        {feedback && <div className="notice">{feedback}</div>}

        <div className="section-heading">
          <div>
            <h2>历史记录关联</h2>
            <p className="muted small">
              从临时球搭子发出的“邀请 TA 加入球搭子”会在这里显示进度。
            </p>
          </div>
        </div>
        <ErrorNotice message={q.error} retry={q.refresh} />
        {q.loading && !q.data ? (
          <Loading />
        ) : q.data?.length ? (
          <div className="partner-list">
            {q.data.map((invite) => (
              <div className="card partner-card" key={invite.id}>
                <div className="row between">
                  <div>
                    <strong>{invite.player_name}</strong>
                    <div className="muted small">
                      {new Date(invite.created_at).toLocaleDateString("zh-CN")} 发出
                    </div>
                  </div>
                  <span
                    className={`badge ${
                      invite.status === "accepted"
                        ? "success"
                        : invite.status === "pending"
                          ? ""
                          : "finished"
                    }`}
                  >
                    {statusLabel[invite.status]}
                  </span>
                </div>
                {invite.status === "pending" && (
                  <div className="partner-card-action invite-actions">
                    <button className="text-button" onClick={() => reshare(invite)}>
                      重新分享
                    </button>
                    <button
                      className="text-button muted-action"
                      disabled={busyId === invite.id}
                      onClick={() => cancel(invite)}
                    >
                      {busyId === invite.id ? "正在取消…" : "取消邀请"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <Empty title="还没有需要跟踪的记录">
            <p>
              从某个临时球搭子卡片发出“邀请 TA 加入球搭子”后，会在这里看到等待加入、已关联或已取消状态。
            </p>
          </Empty>
        )}
      </main>
    </>
  );
}
