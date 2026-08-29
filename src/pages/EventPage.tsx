import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus, RefreshCw, Share2 } from "lucide-react";
import { useQuery } from "../hooks/useQuery";
import { useAuth } from "../hooks/Auth";
import { command, explainError, repository, rpc } from "../repositories/supabase";
import type { Entry, Player, Snapshot } from "../domain/types";
import {
  Avatar,
  Confirm,
  ErrorNotice,
  Header,
  Loading,
  Sheet,
  entryName,
  feeText,
  isRegistrationOpenClient,
  labelFor,
  suggestedLevelDisplay,
  unit,
} from "../components/UI";
import { DrawPanel, PhotoPanel, RankingPanel } from "../components/TournamentPanels";
import { useLanguage } from "../i18n";

export function EventPage({ manage = false }: { manage?: boolean }) {
  const { id } = useParams(),
    auth = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const { language, t } = useLanguage();
  const en = language === "en";
  const q = useQuery("event-" + id, () => repository.event(id!), 10000);
  const myEntryQ = useQuery(
    "my-event-entry-" + id,
    () => rpc<string | null>("get_my_event_entry_id", { p_event_id: id }),
    10000,
  );
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
    if (params.get("join") === "1" && auth.profile?.profile_status === "completed") {
      setSignup("self");
      setParams({}, { replace: true });
    }
  }, [params, auth.profile?.profile_status]);

  async function join() {
    setError("");
    try {
      const p = await auth.start();
      if (p.profile_status !== "completed") {
        navigate("/profile?next=" + encodeURIComponent("/events/" + id + "?join=1"));
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
      await Promise.all([q.refresh(), myEntryQ.refresh()]);
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
    registrationOpen = isRegistrationOpenClient(e),
    active = s.entries.filter((x) => x.status === "confirmed"),
    waiting = s.entries.filter((x) => x.status === "waitlist"),
    own = s.entries.find(
      (x) => (x.id === myEntryQ.data || x.signup_user_id === auth.profile?.id) && x.status !== "withdrawn",
    );
  const txt = (zh: string, english: string) => (en ? english : zh);

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
            {labelFor(e.match_type, language)} · {suggestedLevelDisplay(e.suggested_level_min, e.suggested_level_max, language)} · {labelFor(e.format, language)}
          </p>
        </div>
        <ErrorNotice message={error || q.error} retry={q.refresh} />
        {notice && <div role="status" className="notice">{notice}</div>}
        {!registrationOpen && e.status === "signup" && (
          <div className="notice">{txt("报名已截止，参赛名单按锁定状态处理。", "Registration is closed and the roster is treated as locked.")}</div>
        )}
        <div className="stats">
          <div><b>{active.length}</b><small>{t("confirmed")} / {e.entry_limit || t("unlimited")} {unit(e, language)}</small></div>
          <div><b>{waiting.length}</b><small>{t("waitlist")} / 2 {unit(e, language)}</small></div>
          <div><b>{e.draw_generated ? t("generated") : t("notGenerated")}</b><small>{t("scheduleDraw")}</small></div>
        </div>
        <div className="tab-strip">
          {[["info", t("eventTab")], ["roster", t("rosterTab")], ["draw", t("drawTab")], ["ranking", t("rankingTab")], ["photo", t("photoTab")]].map(([key, label]) => (
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
          {owner && registrationOpen && <Link className="card row between" to={"/events/" + id + "/edit"}><div><strong>{t("eventSettings")}</strong><p className="muted small">{t("eventSettingsHint")}</p></div><span aria-hidden>›</span></Link>}
        </>}

        {tab === "roster" && <>
          <div className="chips">
            <button className={rosterStatus === "confirmed" ? "active" : ""} onClick={() => setRosterStatus("confirmed")}>{t("confirmedRoster")} {active.length}</button>
            <button className={rosterStatus === "waitlist" ? "active" : ""} onClick={() => setRosterStatus("waitlist")}>{t("waitlistRoster")} {waiting.length}</button>
          </div>
          <div className="section-heading">
            <h2>{rosterStatus === "confirmed" ? t("confirmedRoster") : t("waitlistRoster")} · {rosterStatus === "confirmed" ? active.length : waiting.length} {unit(e, language)}</h2>
            {owner && registrationOpen && <button className="text-button" onClick={() => setSignup("manual")}><Plus size={16} />{txt("添加参赛者", "Add players")}</button>}
          </div>
          {rosterStatus === "confirmed" && active.map((entry) => (
            <RosterRow
              key={entry.id}
              entry={entry}
              language={language}
              remove={registrationOpen && (owner || entry.id === own?.id) ? () => setConfirm({
                title: owner ? txt("移出参赛名单？", "Remove from roster?") : txt("确认退出报名？", "Withdraw registration?"),
                description: txt("退出后会自动递补最早报名的候补；重新报名将按新的时间排序。", "The earliest waitlisted entry will be promoted automatically. Registering again uses a new registration time."),
                run: () => rpc("withdraw_entry", { p_event_id: id, p_entry_id: entry.id }),
              }) : undefined}
            />
          ))}
          {rosterStatus === "confirmed" && !active.length && <p className="muted">{txt("还没有参赛者。其他用户可自行报名，组织者也可以添加临时球搭子。", "No players yet. Other users can register themselves, and the organizer can add temporary partners.")}</p>}
          {rosterStatus === "waitlist" && waiting.map((entry) => (
            <RosterRow
              key={entry.id}
              entry={entry}
              language={language}
              remove={registrationOpen && (owner || entry.id === own?.id) ? () => setConfirm({
                title: txt("退出候补？", "Leave the waitlist?"),
                description: txt("将释放整个参赛单元，双打将同时退出两位参赛者。", "The whole entry will be released; a doubles team withdraws both players together."),
                run: () => rpc("withdraw_entry", { p_event_id: id, p_entry_id: entry.id }),
              }) : undefined}
            />
          ))}
          {!registrationOpen && <p className="notice">{txt("名单已锁定，候补不再递补。", "The roster is locked and waitlist promotion has ended.")}</p>}
        </>}

        {tab === "draw" && <DrawPanel s={s} />}
        {tab === "ranking" && <RankingPanel s={s} />}
        {tab === "photo" && <PhotoPanel s={s} owner={owner} onDone={q.refresh} />}

        {owner && e.status === "locked" && <div className="stack">
          <button disabled={busy} onClick={() => setConfirm({
            title: e.draw_generated ? txt("重新生成对阵？", "Regenerate the draw?") : txt("生成本场对阵？", "Generate the draw?"),
            description: e.draw_generated
              ? txt("将清空当前签表，按正式名单重新生成。自动轮空不算已经开赛。", "The current draw will be cleared and rebuilt from the confirmed roster. Automatic byes do not count as started matches.")
              : txt("按锁定的正式名单和赛制生成；此操作不会开始赛事。", "Generate from the locked confirmed roster and event format. This does not start the event."),
            run: () => command(e.id, { type: "draw", event_version: e.version, confirmed: true }),
          })}>{e.draw_generated ? txt("重新生成对阵", "Regenerate draw") : txt("生成对阵", "Generate draw")}</button>
          {e.draw_generated && <button disabled={busy} onClick={() => setConfirm({
            title: txt("开始赛事？", "Start the event?"),
            description: txt("开始后开放记分，不能再改动参赛名单。", "Scoring opens after the event starts and the roster can no longer be changed."),
            run: () => command(e.id, { type: "start", event_version: e.version }),
          })}>{txt("开始赛事", "Start event")}</button>}
          <button className="text-button" disabled={busy} onClick={() => setConfirm({
            title: txt("解锁并清空对阵？", "Unlock roster and clear the draw?"),
            description: txt("将重新开放报名，清空当前所有对阵。已有正式比赛开始或结束时禁止解锁。", "Registration will reopen and the draw will be cleared. Unlocking is blocked after a real match has started or finished."),
            run: () => command(e.id, { type: "unlock", event_version: e.version, confirmed: true }),
          })}>{txt("解锁名单", "Unlock roster")}</button>
        </div>}

        {owner && e.status === "ongoing" && <button className="secondary full" disabled={busy} onClick={() => setConfirm({
          title: txt("结束本场赛事？", "Finish this event?"),
          description: txt("必须完成所有比赛。结束后结果只读，不能再记分或更正；随后可以上传合影。", "All matches must be completed. After finishing, results become read-only and the event photo can be uploaded."),
          run: () => command(e.id, { type: "finish", event_version: e.version }),
        })}>{txt("结束赛事", "Finish event")}</button>}

        {manage && !owner && <ErrorNotice message={txt("仅赛事创建者可以管理。", "Only the event organizer can manage this event.")} />}

        <div className="action-bar"><div className="row">
          {registrationOpen && !own && (e.visibility === "public" || e.link_signup_enabled) && <button
            className={owner ? "secondary grow" : "grow"}
            disabled={!!e.entry_limit && active.length >= e.entry_limit && waiting.length >= 2}
            onClick={join}
          >
            {e.entry_limit && active.length >= e.entry_limit
              ? waiting.length >= 2 ? txt("报名已满", "Registration full") : txt("加入候补", "Join waitlist")
              : owner ? txt("我也参赛", "Register myself") : txt("立即报名", "Register now")}
          </button>}
          {own && <button className="secondary grow" onClick={() => { setTab("roster"); setRosterStatus(own.status); }}>
            {registrationOpen
              ? own.status === "waitlist" ? txt("已候补 · 查看/退出", "Waitlisted · view / withdraw") : txt("已报名 · 查看/退出", "Registered · view / withdraw")
              : own.status === "waitlist" ? txt("已候补 · 查看名单", "Waitlisted · view roster") : txt("已报名 · 查看名单", "Registered · view roster")}
          </button>}
          {owner && e.status === "signup" && <button className="grow" disabled={busy} onClick={() => setConfirm({
            title: txt("锁定参赛名单？", "Lock the roster?"),
            description: txt("锁定后不能继续报名、退出或递补。请确认正式名单和小组人数设置无误；锁定不会自动生成对阵。", "After locking, registration, withdrawal and waitlist promotion stop. Check the confirmed roster and group settings first; locking does not generate the draw."),
            run: () => rpc("lock_event_roster", { p_event_id: id, p_version: e.version }),
          })}>{txt("锁定名单", "Lock roster")}</button>}
          {e.status !== "signup" && <button className="secondary full" onClick={share}>{t("shareEvent")}</button>}
        </div></div>
      </main>

      {signup && <SignupSheet
        snapshot={s}
        manual={signup === "manual"}
        onClose={() => setSignup(null)}
        onDone={() => {
          setSignup(null);
          setTab("roster");
          void Promise.all([q.refresh(), myEntryQ.refresh()]);
        }}
      />}
      {confirm && <Confirm title={confirm.title} description={confirm.description} busy={busy} onCancel={() => setConfirm(null)} onConfirm={() => run(confirm.run)} />}
    </>
  );
}

function RosterRow({ entry, remove, language }: { entry: Entry; remove?: () => void; language: "zh-CN" | "en" }) {
  const en = language === "en";
  return <div className="card row">
    <Avatar path={entry.players[0]?.avatar_url} size={38} />
    <div className="grow">
      <strong>{entryName(entry)}</strong>
      {entry.team_name && <p className="small muted">{entry.players.map((p) => p.name).join(" / ")}</p>}
      {entry.status === "waitlist" && <small className="muted">{en ? `Waitlist position ${entry.waitlist_order}` : `候补第 ${entry.waitlist_order} 位`}</small>}
    </div>
    {remove && <button className="text-button" onClick={remove}>{en ? "Withdraw" : "退出"}</button>}
  </div>;
}

function SignupSheet({ snapshot: s, manual, onClose, onDone }: { snapshot: Snapshot; manual: boolean; onClose: () => void; onDone: () => void }) {
  type Connection = { connection_id: string; id: string; nickname: string | null; avatar_url: string | null };
  type PartnerInvite = { id: string; invitee_user_id: string; nickname: string | null; avatar_url: string | null; status: "pending" | "accepted" | "declined" | "cancelled" | "expired"; self_player_id: string | null };
  type EventInvite = { invitee_user_id: string; status: "pending" | "accepted" | "declined" | "cancelled" | "expired"; created_at: string };
  const { language } = useLanguage();
  const en = language === "en";
  const txt = (zh: string, english: string) => (en ? english : zh);
  const count = s.event.match_type === "doubles" ? 2 : 1;
  const [players, setPlayers] = useState<Player[]>([]),
    [selected, setSelected] = useState<string[]>([]),
    [team, setTeam] = useState(""),
    [newName, setNewName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [consent, setConsent] = useState(false),
    [connections, setConnections] = useState<Connection[]>([]),
    [partnerInvites, setPartnerInvites] = useState<PartnerInvite[]>([]),
    [eventInvites, setEventInvites] = useState<EventInvite[]>([]),
    [partnerBusy, setPartnerBusy] = useState<string | null>(null),
    [eventInviteBusy, setEventInviteBusy] = useState<string | null>(null);

  const loadPartnerInvites = () => rpc<PartnerInvite[]>("list_sent_doubles_partner_invites", { p_event_id: s.event.id }).then(setPartnerInvites);
  const loadEventInvites = () => rpc<EventInvite[]>("list_sent_event_invites", { p_event_id: s.event.id }).then(setEventInvites);

  useEffect(() => {
    repository.players().then((ps) => {
      setPlayers(ps);
      if (!manual) {
        const self = ps.find((p) => p.player_type === "self");
        if (self) setSelected([self.id]);
        else setError(txt("请先完成我的打球档案，再报名参赛。", "Complete your tennis profile before registering."));
      } else setSelected([]);
    }).catch((e) => setError(explainError(e)));
    if (manual || count === 2) rpc<Connection[]>("list_connections").then(setConnections).catch((e) => setError(explainError(e)));
    if (!manual && count === 2) loadPartnerInvites().catch((e) => setError(explainError(e)));
    if (manual) loadEventInvites().catch((e) => setError(explainError(e)));
  }, [manual, count, language]);

  const taken = new Set(s.entries.filter((entry) => entry.status !== "withdrawn").flatMap((entry) => entry.players.map((p) => p.id)));
  const selfPlayer = players.find((p) => p.player_type === "self");
  const temporaryPlayers = players.filter((p) => p.player_type === "manual" && !p.linked_user_id);
  const selectedOwned = players.filter((p) => selected.includes(p.id));
  const hasTemporaryPartner = !manual && count === 2 && selectedOwned.some((p) => p.player_type === "manual");
  const hasProxyPlayer = manual && selectedOwned.some((p) => p.player_type === "manual");
  const selectedAccepted = partnerInvites.find((i) => i.status === "accepted" && i.self_player_id && selected.includes(i.self_player_id));
  const selectedTemporary = temporaryPlayers.find((p) => selected.includes(p.id));

  async function add() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await repository.savePlayer(null, newName.trim(), null);
      setPlayers((x) => [...x, p]);
      setNewName("");
      if (manual) {
        if (selected.length < count) setSelected((x) => [...x, p.id]);
      } else if (selfPlayer) {
        setSelected([selfPlayer.id, p.id]);
        setConsent(false);
      }
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  async function invitePartner(profileId: string) {
    setPartnerBusy(profileId);
    setError("");
    try {
      await rpc("invite_doubles_partner", { p_event_id: s.event.id, p_invitee_user_id: profileId });
      await loadPartnerInvites();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setPartnerBusy(null);
    }
  }

  async function inviteToEvent(profileId: string) {
    setEventInviteBusy(profileId);
    setError("");
    try {
      await rpc("invite_connection_to_event", { p_event_id: s.event.id, p_invitee_user_id: profileId });
      await loadEventInvites();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setEventInviteBusy(null);
    }
  }

  function choosePartner(i: PartnerInvite) {
    if (selfPlayer && i.self_player_id) setSelected([selfPlayer.id, i.self_player_id]);
    setConsent(false);
  }
  function chooseTemporaryPartner(player: Player) {
    if (!selfPlayer || taken.has(player.id)) return;
    setSelected([selfPlayer.id, player.id]);
    setConsent(false);
  }
  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("join_event", { p_event_id: s.event.id, p_player_ids: selected, p_team_name: team || null, p_manual: manual });
      onDone();
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  const invitedIds = new Set(partnerInvites.filter((i) => i.status === "pending" || i.status === "accepted").map((i) => i.invitee_user_id));
  const eventInviteByUser = new Map(eventInvites.map((i) => [i.invitee_user_id, i]));

  return <Sheet open title={manual ? (count === 2 ? txt("添加双打队伍", "Add doubles team") : txt("添加参赛者", "Add player")) : count === 2 ? txt("双打报名", "Doubles registration") : txt("确认报名", "Confirm registration")} onClose={onClose}>
    <p>{s.event.name}</p>
    <p className="muted small">{s.event.event_date || txt("日期待定", "Date TBD")} · {s.event.venue || txt("场地待定", "Venue TBD")} · {feeText(s.event, s.entries.filter((entry) => entry.status === "confirmed").length, language)}</p>
    {count === 2 && <label>{txt("队伍名称（可选）", "Team name (optional)")}<input maxLength={60} value={team} onChange={(e) => setTeam(e.target.value)} /></label>}

    {manual ? <>
      <div className="card">
        <strong>{txt("我的球搭子", "My partners")}</strong>
        <p className="muted small">{txt("真实球搭子由本人完成报名。你可以邀请 TA 参加这场赛事，不替 TA 创建新的参赛身份。", "Connected partners register themselves. You can invite them to this event without creating another player identity for them.")}</p>
        <div className="stack">
          {connections.map((c) => {
            const invite = eventInviteByUser.get(c.id);
            const alreadyInRoster = s.entries.some((entry) => entry.status !== "withdrawn" && entry.players.some((p) => p.linked_user_id === c.id));
            return <div className="row" key={c.connection_id}>
              <Avatar path={c.avatar_url} name={c.nickname || txt("球搭子", "Partner")} size={36} />
              <span className="grow">{c.nickname || txt("球搭子", "Partner")}</span>
              {alreadyInRoster ? <span className="muted small">{txt("已报名", "Registered")}</span>
                : invite?.status === "pending" ? <span className="muted small">{txt("等待回应", "Awaiting response")}</span>
                  : invite?.status === "accepted" ? <span className="muted small">{txt("已接受邀请", "Invitation accepted")}</span>
                    : <button className="secondary" disabled={eventInviteBusy === c.id} onClick={() => inviteToEvent(c.id)}>{eventInviteBusy === c.id ? txt("发送中…", "Sending…") : txt("邀请参赛", "Invite")}</button>}
            </div>;
          })}
          {!connections.length && <p className="muted small">{txt("还没有我的球搭子。真实用户先在“球搭子们”建立关系，再邀请参赛。", "No connected partners yet. Connect in Partners first, then invite them to the event.")}</p>}
        </div>
      </div>
      <div className="card">
        <strong>{txt("临时球搭子", "Temporary partners")}</strong>
        <p className="muted small">{txt("对方还没使用球搭子时，可以直接从已有临时档案中选择并代为报名。", "If the person is not using Qiu Dazi yet, choose an existing temporary profile and register on their behalf.")}</p>
        <div className="stack">
          {temporaryPlayers.map((p) => <label className="check" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={taken.has(p.id)} onChange={(e) => setSelected((x) => e.target.checked ? (x.length < count ? [...x, p.id] : x) : x.filter((playerId) => playerId !== p.id))} /><span>{p.name}{taken.has(p.id) ? txt(" · 已在名单中", " · already on roster") : ""}</span></label>)}
          {!temporaryPlayers.length && <p className="muted small">{txt("还没有临时球搭子。", "No temporary partners yet.")}</p>}
        </div>
      </div>
      <div className="card">
        <strong>{txt("列表里没有这个人？", "Not on the list?")}</strong>
        <p className="muted small">{txt("新建后会保存为临时球搭子，之后其他比赛可以继续复用，不需要重复录入。", "A new temporary partner can be reused in future events without creating duplicate player records.")}</p>
        <label>{txt("姓名 / 昵称", "Name / nickname")}<input maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={txt("输入姓名或昵称", "Enter a name or nickname")} /></label>
        <button className="secondary full" disabled={busy || !newName.trim()} onClick={add}>{txt("添加临时球搭子", "Add temporary partner")}</button>
      </div>
    </> : count === 1 ? <>
      <h3>{txt("我的报名", "My registration")}</h3>
      {selfPlayer && <div className="card row"><Avatar path={selfPlayer.avatar_url} name={selfPlayer.name} size={42} /><div><strong>{selfPlayer.name}</strong><p className="muted small">{txt("使用我的打球档案参赛", "Register with my tennis profile")}</p></div></div>}
    </> : <>
      <h3>{txt("我和谁搭档？", "Who is my partner?")}</h3>
      {selfPlayer && <div className="card row"><Avatar path={selfPlayer.avatar_url} name={selfPlayer.name} size={42} /><div><strong>{selfPlayer.name}{txt("（我）", " (me)")}</strong><p className="muted small">{txt("你已作为本队第一位参赛者", "You are the first player on this team")}</p></div></div>}
      {selectedAccepted && <div className="notice">{txt(`已选择 ${selectedAccepted.nickname || "球搭子"} 作为搭档。`, `${selectedAccepted.nickname || "Partner"} is selected as your partner.`)}</div>}
      {selectedTemporary && <div className="notice">{txt(`已选择临时球搭子 ${selectedTemporary.name} 作为搭档。`, `${selectedTemporary.name} is selected as your temporary partner.`)}</div>}
      <div className="card">
        <strong>{txt("我的球搭子", "My partners")}</strong>
        <p className="muted small">{txt("真实球搭子需要先接受双打组队邀请，接受后你再完成整队报名。", "A connected partner must accept the doubles team invitation before you can submit the team registration.")}</p>
        <div className="stack">
          {partnerInvites.filter((i) => i.status === "pending" || i.status === "accepted").map((i) => <div className="row" key={i.id}><Avatar path={i.avatar_url} name={i.nickname || txt("球搭子", "Partner")} size={36} /><span className="grow">{i.nickname || txt("球搭子", "Partner")}</span>{i.status === "accepted" ? <button className={selectedAccepted?.id === i.id ? "secondary" : ""} onClick={() => choosePartner(i)}>{selectedAccepted?.id === i.id ? txt("已选择", "Selected") : txt("选择", "Select")}</button> : <span className="muted small">{txt("等待确认", "Awaiting confirmation")}</span>}</div>)}
          {connections.filter((c) => !invitedIds.has(c.id)).map((c) => <div className="row" key={c.connection_id}><Avatar path={c.avatar_url} name={c.nickname || txt("球搭子", "Partner")} size={36} /><span className="grow">{c.nickname || txt("球搭子", "Partner")}</span><button className="secondary" disabled={partnerBusy === c.id} onClick={() => invitePartner(c.id)}>{partnerBusy === c.id ? txt("发送中…", "Sending…") : txt("邀请组队", "Invite to team")}</button></div>)}
          {!connections.length && !partnerInvites.length && <p className="muted small">{txt("还没有可邀请的球搭子，可以先去“球搭子们”建立关系。", "No partners are available to invite yet. Connect with someone in Partners first.")}</p>}
        </div>
      </div>
      <div className="card">
        <strong>{txt("临时球搭子", "Temporary partners")}</strong>
        <p className="muted small">{txt("搭档还没使用球搭子时，优先选择已经存在的临时球搭子，避免重复创建比赛身份。", "If your partner is not using Qiu Dazi yet, choose an existing temporary partner to avoid duplicate player identities.")}</p>
        <div className="stack">
          {temporaryPlayers.map((p) => <div className="row" key={p.id}><Avatar path={p.avatar_url} name={p.name} size={36} /><span className="grow">{p.name}</span>{taken.has(p.id) ? <span className="muted small">{txt("已在名单中", "Already on roster")}</span> : <button className={selectedTemporary?.id === p.id ? "secondary" : ""} onClick={() => chooseTemporaryPartner(p)}>{selectedTemporary?.id === p.id ? txt("已选择", "Selected") : txt("选择", "Select")}</button>}</div>)}
          {!temporaryPlayers.length && <p className="muted small">{txt("还没有临时球搭子。", "No temporary partners yet.")}</p>}
        </div>
        <label>{txt("添加新的临时球搭子", "Add a new temporary partner")}<input maxLength={40} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={txt("列表里没有时再输入姓名或昵称", "Enter a name only if they are not already listed")} /></label>
        <button className="secondary full" disabled={busy || !newName.trim()} onClick={add}>{txt("添加并选择", "Add and select")}</button>
      </div>
    </>}

    {(hasTemporaryPartner || hasProxyPlayer) && <label className="check"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /><span>{txt("我已获得临时球搭子本人同意，代其提交本次赛事报名信息。", "I have this temporary partner's permission to submit this event registration on their behalf.")}</span></label>}
    <p className="muted small">{txt(`名额以提交时数据库为准。正式名额已满将按顺序加入候补，最多候补2${unit(s.event, language)}。`, `Availability is checked when you submit. If confirmed places are full, up to 2 ${unit(s.event, language)} can join the waitlist.`)}</p>
    <ErrorNotice message={error} />
    {manual && selected.length === 0 && <p className="muted small">{txt("邀请真实球搭子后由 TA 自行报名；选择临时球搭子后可在这里确认代报名。", "Connected partners register themselves after an invitation; select temporary partners here to register on their behalf.")}</p>}
    {(!manual || selected.length > 0) && <button className="full" disabled={busy || selected.length !== count || ((hasTemporaryPartner || hasProxyPlayer) && !consent) || selected.some((playerId) => taken.has(playerId))} onClick={save}>{busy ? txt("正在提交…", "Submitting…") : manual ? txt("确认代报名", "Confirm proxy registration") : txt("确认报名", "Confirm registration")}</button>}
  </Sheet>;
}