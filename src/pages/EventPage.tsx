import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { Share2, RefreshCw } from "lucide-react";
import { useQuery } from "../hooks/useQuery";
import { useAuth } from "../hooks/Auth";
import {
  repository,
  rpc,
  explainError,
} from "../repositories/supabase";
import {
  Header,
  ErrorNotice,
  Loading,
  feeText,
  entryName,
  Sheet,
  Confirm,
  unit,
  levelLabel,
  labelFor,
} from "../components/UI";
import {
  DrawPanel,
  RankingPanel,
  PhotoPanel,
} from "../components/TournamentPanels";
import { useLanguage } from "../i18n";
export function EventPage({ manage = false }: { manage?: boolean }) {
  const { id } = useParams(),
    auth = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const { language, t } = useLanguage();
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
      setNotice(t("shareCopied"));
    } catch {
      setNotice(t("copyEventLink") + url);
    }
  }
  if (!q.data)
    return (
      <>
        <Header title={t("event")} />
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
  void own;
  void join;
  return (
    <>
      <Header
        title={manage ? t("eventManage") : t("eventDetail")}
        action={
          <button className="icon-button" aria-label={t("shareEvent")} onClick={share}>
            <Share2 size={20} />
          </button>
        }
      />
      <main className="page has-action">
        <div className="event-hero">
          <div className="court-lines" />
          <span className={"badge " + e.status}>{labelFor(e.status, language)}</span>
          <h1>{e.name}</h1>
          <p>
            {e.level && levelLabel(e.level, language) + (language === "en" ? " · " : "级 · ")}
            {labelFor(e.match_type, language)} · {labelFor(e.format, language)}
          </p>
        </div>
        <ErrorNotice message={error || q.error} retry={q.refresh} />
        {notice && (
          <div role="status" className="notice">
            {notice}
          </div>
        )}
        <div className="stats">
          <div><b>{active.length}</b><small>{t("confirmed")} / {e.entry_limit || t("unlimited")} {unit(e, language)}</small></div>
          <div><b>{waiting.length}</b><small>{t("waitlist")} / 2 {unit(e, language)}</small></div>
          <div><b>{e.draw_generated ? t("generated") : t("notGenerated")}</b><small>{t("scheduleDraw")}</small></div>
        </div>
        <div className="tab-strip">
          {[["info", t("eventTab")],["roster", t("rosterTab")],["draw", t("drawTab")],["ranking", t("rankingTab")],["photo", t("photoTab")]].map(([key, label]) => (
            <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>
          ))}
          <button aria-label={t("refresh")} onClick={q.refresh}><RefreshCw size={16} /></button>
        </div>
        {tab === "info" && <>
          <div className="event-facts">
            <div><small>{t("matchDate")}</small><strong>{e.event_date || t("dateTbd")} {e.event_time?.slice(0, 5)}</strong></div>
            <div><small>{t("venue")}</small><strong>{e.venue || t("venueTbd")}</strong></div>
            <div><small>{t("scoringRules")}</small><strong>{e.best_of === 1 ? t("oneSet") : e.best_of === 3 ? t("bestOfThree") : t("bestOfFive")} · {labelFor(e.scoring_type, language)}</strong></div>
            <div><small>{t("fee")}</small><strong>{feeText(e, active.length, language)}</strong></div>
          </div>
          {e.tiebreak_trigger && <p className="muted small">{e.tiebreak_trigger}:{e.tiebreak_trigger} {t("afterTiebreak")} · {t("traditionalAdvantage")}</p>}
          {e.format === "group_knockout" && <div className="notice">{e.group_count} {t("group")} · {t("topPerGroup")} {e.qualifiers_per_group} {t("advanceKnockout")}</div>}
          {owner && e.status === "signup" && <Link className="card row between" to={"/events/" + id + "/edit"}><div><strong>{t("eventSettings")}</strong><p className="muted small">{t("eventSettingsHint")}</p></div><span aria-hidden>›</span></Link>}
        </>}
        {tab === "roster" && <>
          <div className="chips">
            <button className={rosterStatus === "confirmed" ? "active" : ""} onClick={() => setRosterStatus("confirmed")}>{t("confirmedRoster")} {active.length}</button>
            <button className={rosterStatus === "waitlist" ? "active" : ""} onClick={() => setRosterStatus("waitlist")}>{t("waitlistRoster")} {waiting.length}</button>
          </div>
          <div className="section-heading"><h2>{rosterStatus === "confirmed" ? t("confirmedRoster") : t("waitlistRoster")} · {rosterStatus === "confirmed" ? active.length : waiting.length} {unit(e, language)}</h2></div>
          {(rosterStatus === "confirmed" ? active : waiting).map((entry) => <div className="card" key={entry.id}><strong>{entryName(entry)}</strong></div>)}
        </>}
        {tab === "draw" && <DrawPanel s={s} />}
        {tab === "ranking" && <RankingPanel s={s} />}
        {tab === "photo" && <PhotoPanel s={s} owner={owner} onDone={q.refresh} />}
        {signup && <Sheet open title={t("registration")} onClose={() => setSignup(null)}><p>{t("continueRegistration")}</p></Sheet>}
        {confirm && <Confirm title={confirm.title} description={confirm.description} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => run(confirm.run)} />}
      </main>
    </>
  );
}