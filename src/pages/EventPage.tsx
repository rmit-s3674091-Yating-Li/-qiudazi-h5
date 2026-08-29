import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Share2, RefreshCw, Plus } from "lucide-react";
import { useQuery } from "../hooks/useQuery";
import { useAuth } from "../hooks/Auth";
import {
  repository,
  rpc,
  explainError,
  command,
} from "../repositories/supabase";
import type { Snapshot, Entry, Player } from "../domain/types";
import {
  Header,
  ErrorNotice,
  Loading,
  labels,
  feeText,
  entryName,
  Avatar,
  Sheet,
  Confirm,
  unit,
  levelLabel,
} from "../components/UI";
import {
  DrawPanel,
  RankingPanel,
  PhotoPanel,
} from "../components/TournamentPanels";
export function EventPage({ manage = false }: { manage?: boolean }) {
  const { id } = useParams(),
    auth = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const q = useQuery("event-" + id, () => repository.event(id!), 10000);
  const myEntryQ = useQuery("my-event-entry-" + id, () => rpc<string | null>("get_my_event_entry_id", { p_event_id: id }), 10000);
  const [rosterStatus, setRosterStatus] = useState("confirmed");
  const [tab, setTab] = useState("info"),
    [signup, setSignup] = useState<"self" | "manual" | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<{
      title: string;
      description: string;
      run: () => Promise<unknown>;
    } | null>(null);
  useEffect(() => {
    if (
      params.get("join") === "1" &&
      auth.profile?.profile_status === "completed"
    ) {
      setSignup("self");
      setParams({}, { replace: true });
    }
  }, [params, auth.profile?.profile_status]);
  async function join() {
    setError("");
    try {
      const p = await auth.start();
      if (p.profile_status !== "completed") {
        navigate(
          "/profile?next=" + encodeURIComponent("/events/" + id + "?join=1"),
        );
        return;
      }
      setSignup("self");
    } catch (e) {
      setError(explainError(e));
    }
  }
  async function run(task: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await task();
      setConfirm(null);
      q.refresh();
    } catch (e) {
      setError(explainError(e));
      setConfirm(null);
    } finally {
      setBusy(false);
    }
  }
  async function share() {
    const url = `${location.origin}${location.pathname}#/events/${id}`;
    try {
      if (navigator.share) {
        try {
          await navigator.share({ title: q.data?.event.name, url });
          return;
        } catch (e) {
          if ((e as Error).name === "AbortError") return;
        }
      }
      await navigator.clipboard.writeText(url);
      setNotice("赛事链接已复制，可以发送给朋友");
    } catch {
      setNotice("请复制此赛事链接：" + url);
    }
  }
  if (!q.data)
    return (
      <>
        <Header title="赛事" />
        <main className="page">
          <ErrorNotice message={q.error} retry={q.refresh} />
          {q.loading && <Loading />}
        </main>
      </>
    );
  const s = q.data,
    e = s.event,
    owner = s.viewer_role === "owner",
    active = s.entries.filter((x) => x.status === "confirmed"),
    waiting = s.entries.filter((x) => x.status === "waitlist"),
    own = s.entries.find(
      (x) => (x.id === myEntryQ.data || x.signup_user_id === auth.profile?.id) && x.status !== "withdrawn",
    );
  return (
    <>
      <Header
        title={manage ? "赛事管理" : "赛事详情"}
        action={
          <button className="icon-button" aria-label="分享赛事" onClick={share}>
            <Share2 size={20} />
          </button>
        }
      />
      <main className="page has-action">
        <div className="event-hero">
          <div className="court-lines" />
          <span className={"badge " + e.status}>{labels[e.status]}</span>
          <h1>{e.name}</h1>
          <p>
            {e.level && levelLabel(e.level) + "级 · "}
            {labels[e.match_type]} · {labels[e.format]}
          </p>
        </div>
        <ErrorNotice message={error || q.error} retry={q.refresh} />
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        <div className="stats">
          <div><b>{active.length}</b><small>正式 / {e.entry_limit || "不限"} {unit(e)}</small></div>
          <div><b>{waiting.length}</b><small>候补 / 2 {unit(e)}</small></div>
          <div><b>{e.draw_generated ? "已生成" : "未生成"}</b><small>赛程 / 签表</small></div>
        </div>
        <div className="tab-strip">
          {[["info", "赛事"],["roster", "参赛"],["draw", "对阵"],["ranking", "排名"],["photo", "合影"]].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
          <button aria-label="刷新" onClick={q.refresh}><RefreshCw size={16} /></button>
        </div>
        {tab === "info" && <>
          <div className="event-facts">
            <div><small>比赛日期</small><strong>{e.event_date || "日期待定"} {e.event_time?.slice(0, 5)}</strong></div>
            <div><small>球场</small><strong>{e.venue || "场地待定"}</strong></div>
            <div><small>计分规则</small><strong>{e.best_of === 1 ? "一盘决胜" : e.best_of === 3 ? "三盘两胜" : "五盘三胜"} · {labels[e.scoring_type]}</strong></div>
            <div><small>费用</small><strong>{feeText(e, active.length)}</strong></div>
          </div>
          {e.tiebreak_trigger && <p className="muted small">{e.tiebreak_trigger}:{e.tiebreak_trigger} 后抢七 · 传统占先制</p>}
          {e.format === "group_knockout" && <div className="notice">{e.group_count} 个小组 · 每组前 {e.qualifiers_per_group} 晋级淘汰赛</div>}
          {owner && e.status === "signup" && <Link className="card row between" to={"/events/" + id + "/edit"}><div><strong>赛事设置</strong><p className="muted small">修改时间、场地、赛制和报名设置</p></div><span aria-hidden>›</span></Link>}
        </>}
        {tab === "roster" && <>
          <div className="chips">
            <button className={rosterStatus === "confirmed" ? "active" : ""} onClick={() => setRosterStatus("confirmed")}>正式名单 {active.length}</button>
            <button className={rosterStatus === "waitlist" ? "active" : ""} onClick={() => setRosterStatus("waitlist")}>候补名单 {waiting.length}</button>
          </div>
          <div className="section-heading"><h2>{rosterStatus === "confirmed" ? "正式名单" : "候补名单"} · {rosterStatus === "confirmed" ? active.length : waiting.length} {unit(e)}</h2></div>
          {(rosterStatus === "confirmed" ? active : waiting).map((entry) => <div className="card" key={entry.id}><strong>{entryName(entry)}</strong></div>)}
        </>}
        {tab === "draw" && <DrawPanel s={s} />}
        {tab === "ranking" && <RankingPanel s={s} />}
        {tab === "photo" && <PhotoPanel s={s} owner={owner} onDone={q.refresh} />}
        {signup && <Sheet open title="报名" onClose={() => setSignup(null)}><p>请继续完成报名。</p></Sheet>}
        {confirm && <Confirm title={confirm.title} description={confirm.description} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => run(confirm.run)} />}
      </main>
    </>
  );
}