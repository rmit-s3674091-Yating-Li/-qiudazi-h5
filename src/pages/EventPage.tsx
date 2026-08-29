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
} from "../components/UI";
import {
  DrawPanel,
  RankingPanel,
  PhotoPanel,
} from "../components/TournamentPanels";
import { EventInviteSheet } from "../components/EventInviteUI";
export function EventPage({ manage = false }: { manage?: boolean }) {
  const { id } = useParams(),
    auth = useAuth(),
    navigate = useNavigate(),
    [params, setParams] = useSearchParams();
  const q = useQuery("event-" + id, () => repository.event(id!), 10000);
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
    const url = location.origin + "/events/" + id;
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
    owner = auth.profile?.id === e.owner_user_id,
    active = s.entries.filter((x) => x.status === "confirmed"),
    waiting = s.entries.filter((x) => x.status === "waitlist"),
    own = s.entries.find(
      (x) => x.signup_user_id === auth.profile?.id && x.status !== "withdrawn",
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
            {e.level && e.level + " · "}
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
          <div>
            <b>{active.length}</b>
            <small>
              正式 / {e.entry_limit || "不限"} {unit(e)}
            </small>
          </div>
          <div>
            <b>{waiting.length}</b>
            <small>候补 / 2 {unit(e)}</small>
          </div>
          <div>
            <b>{e.draw_generated ? "已生成" : "未生成"}</b>
            <small>赛程 / 签表</small>
          </div>
        </div>
        <div className="tab-strip">
          {[
            ["info", "赛事"],
            ["roster", "参赛"],
            ["draw", "对阵"],
            ["ranking", "排名"],
            ["photo", "合影"],
          ].map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? "active" : ""}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
          <button aria-label="刷新" onClick={q.refresh}>
            <RefreshCw size={16} />
          </button>
        </div>
        {tab === "info" && (
          <>
            <div className="event-facts">
              <div>
                <small>比赛日期</small>
                <strong>
                  {e.event_date || "日期待定"} {e.event_time?.slice(0, 5)}
                </strong>
              </div>
              <div>
                <small>球场</small>
                <strong>{e.venue || "场地待定"}</strong>
              </div>
              <div>
                <small>计分规则</small>
                <strong>
                  {e.best_of === 1
                    ? "一盘决胜"
                    : e.best_of === 3
                      ? "三盘两胜"
                      : "五盘三胜"}{" "}
                  · {labels[e.scoring_type]}
                </strong>
              </div>
              <div>
                <small>费用</small>
                <strong>{feeText(e, active.length)}</strong>
              </div>
            </div>
            {e.tiebreak_trigger && (
              <p className="muted small">
                {e.tiebreak_trigger}:{e.tiebreak_trigger} 后抢七 · 传统占先制
              </p>
            )}
            {e.format === "group_knockout" && (
              <div className="notice">
                {e.group_count} 个小组 · 每组前 {e.qualifiers_per_group}{" "}
                晋级淘汰赛
              </div>
            )}
            {e.visibility === "link_only" && (
              <div className="notice">
                仅链接赛事 ·{" "}
                {e.link_signup_enabled
                  ? "允许报名"
                  : "仅供查看，不开放自主报名"}
              </div>
            )}
            {owner && e.status === "signup" && (
              <Link
                className="button secondary full"
                to={"/events/" + id + "/edit"}
              >
                编辑赛事
              </Link>
            )}
          </>
        )}
        {tab === "roster" && (
          <>
            <div className="chips">
              <button
                className={rosterStatus === "confirmed" ? "active" : ""}
                onClick={() => setRosterStatus("confirmed")}
              >
                正式名单 {active.length}
              </button>
              <button
                className={rosterStatus === "waitlist" ? "active" : ""}
                onClick={() => setRosterStatus("waitlist")}
              >
                候补名单 {waiting.length}
              </button>
            </div>
            <div className="section-heading">
              <h2>
                {rosterStatus === "confirmed" ? "正式名单" : "候补名单"} ·{" "}
                {rosterStatus === "confirmed" ? active.length : waiting.length}{" "}
                {unit(e)}
              </h2>
              {owner && e.status === "signup" && (
                <button
                  className="text-button"
                  onClick={() => setSignup("manual")}
                >
                  <Plus size={16} />
                  手动添加
                </button>
              )}
            </div>
            {rosterStatus === "confirmed" &&
              active.map((en) => (
                <RosterRow
                  key={en.id}
                  entry={en}
                  remove={
                    e.status === "signup" &&
                    (owner || en.signup_user_id === auth.profile?.id)
                      ? () =>
                          setConfirm({
                            title: owner ? "移出参赛名单？" : "确认退出报名？",
                            description:
                              "退出后会自动递补最早报名的候补；重新报名将按新的时间排序。",
                            run: () =>
                              rpc("withdraw_entry", {
                                p_event_id: id,
                                p_entry_id: en.id,
                              }),
                          })
                      : undefined
                  }
                />
              ))}
            {rosterStatus === "confirmed" && !active.length && (
              <p className="muted">还没有参赛者。</p>
            )}
            {rosterStatus === "waitlist" &&
              waiting.map((en) => (
                <RosterRow
                  key={en.id}
                  entry={en}
                  remove={
                    e.status === "signup" &&
                    (owner || en.signup_user_id === auth.profile?.id)
                      ? () =>
                          setConfirm({
                            title: "退出候补？",
                            description:
                              "将释放整个参赛单元，双打将同时退出两位参赛者。",
                            run: () =>
                              rpc("withdraw_entry", {
                                p_event_id: id,
                                p_entry_id: en.id,
                              }),
                          })
                      : undefined
                  }
                />
              ))}
            {e.status !== "signup" && (
              <p className="notice">名单已锁定，候补不再递补。</p>
            )}
          </>
        )}
        {tab === "draw" && <DrawPanel s={s} />}
        {tab === "ranking" && <RankingPanel s={s} />}
        {tab === "photo" && (
          <PhotoPanel s={s} owner={owner} onDone={q.refresh} />
        )}
        {owner && e.status === "locked" && (
          <div className="stack">
            <button
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: e.draw_generated ? "重新生成对阵？" : "生成本场对阵？",
                  description: e.draw_generated
                    ? "将清空当前签表，按正式名单重新生成。自动轮空不算已经开赛。"
                    : "按锁定的正式名单和赛制生成；此操作不会开始赛事。",
                  run: () =>
                    command(e.id, {
                      type: "draw",
                      event_version: e.version,
                      confirmed: true,
                    }),
                })
              }
            >
              {e.draw_generated ? "重新生成对阵" : "生成对阵"}
            </button>
            {e.draw_generated && (
              <button
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "开始赛事？",
                    description: "开始后开放记分，不能再改动参赛名单。",
                    run: () =>
                      command(e.id, {
                        type: "start",
                        event_version: e.version,
                      }),
                  })
                }
              >
                开始赛事
              </button>
            )}
            <button
              className="text-button"
              disabled={busy}
              onClick={() =>
                setConfirm({
                  title: "解锁并清空对阵？",
                  description:
                    "将重新开放报名，清空当前所有对阵。已有正式比赛开始或结束时禁止解锁。",
                  run: () =>
                    command(e.id, {
                      type: "unlock",
                      event_version: e.version,
                      confirmed: true,
                    }),
                })
              }
            >
              解锁名单
            </button>
          </div>
        )}
        {owner && e.status === "ongoing" && (
          <button
            className="secondary full"
            disabled={busy}
            onClick={() =>
              setConfirm({
                title: "结束本场赛事？",
                description:
                  "必须完成所有比赛。结束后结果只读，不能再记分或更正；随后可以上传合影。",
                run: () =>
                  command(e.id, { type: "finish", event_version: e.version }),
              })
            }
          >
            结束赛事
          </button>
        )}
        {manage && !owner && <ErrorNotice message="仅赛事创建者可以管理。" />}
        <div className="action-bar">
          <div className="row">
            {e.status === "signup" &&
              !own &&
              (e.visibility === "public" || e.link_signup_enabled) && (
                <button
                  className="grow"
                  disabled={
                    !!e.entry_limit &&
                    active.length >= e.entry_limit &&
                    waiting.length >= 2
                  }
                  onClick={join}
                >
                  {e.entry_limit && active.length >= e.entry_limit
                    ? waiting.length >= 2
                      ? "报名已满"
                      : "加入候补"
                    : owner ? "报名参赛" : "立即报名"}
                </button>
              )}
            {own && (
              <button
                className="secondary grow"
                onClick={() => {
                  setTab("roster");
                  setRosterStatus(own.status);
                }}
              >
                {own.status === "waitlist"
                  ? "已候补 · 查看/退出"
                  : "已报名 · 查看/退出"}
              </button>
            )}
            {owner && e.status === "signup" && (
              <button
                className="secondary grow"
                disabled={busy}
                onClick={() =>
                  setConfirm({
                    title: "锁定参赛名单？",
                    description:
                      "锁定后不能继续报名、退出或递补。请确认正式名单和小组人数设置无误；锁定不会自动生成对阵。",
                    run: () =>
                      rpc("lock_event_roster", {
                        p_event_id: id,
                        p_version: e.version,
                      }),
                  })
                }
              >
                锁定名单
              </button>
            )}
            {e.status !== "signup" && (
              <button className="secondary full" onClick={share}>
                分享赛事
              </button>
            )}
          </div>
        </div>
      </main>
      {signup && (
        <SignupSheet
          snapshot={s}
          manual={signup === "manual"}
          onClose={() => setSignup(null)}
          onDone={() => {
            setSignup(null);
            setTab("roster");
            q.refresh();
          }}
        />
      )}
      {confirm && (
        <Confirm
          {...confirm}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() => run(confirm.run)}
        />
      )}
    </>
  );
}
function RosterRow({ entry, remove }: { entry: Entry; remove?: () => void }) {
  return (
    <div className="card row">
      <Avatar path={entry.players[0]?.avatar_url} size={38} />
      <div className="grow">
        <strong>{entryName(entry)}</strong>
        {entry.team_name && (
          <p className="small muted">
            {entry.players.map((p) => p.name).join(" / ")}
          </p>
        )}
        {entry.status === "waitlist" && (
          <small className="muted">候补第 {entry.waitlist_order} 位</small>
        )}
      </div>
      {remove && (
        <button className="text-button" onClick={remove}>
          退出
        </button>
      )}
    </div>
  );
}
type PartnerInvite = {
  id: string;
  invitee_user_id: string;
  nickname: string | null;
  avatar_url: string | null;
  status: "pending" | "accepted" | "declined" | "cancelled" | "expired";
  self_player_id: string | null;
  created_at: string;
};
function SignupSheet({ snapshot: s, manual, onClose, onDone }: { snapshot: Snapshot; manual: boolean; onClose: () => void; onDone: () => void; }) {
  const [players,setPlayers]=useState<Player[]>([]),[selected,setSelected]=useState<string[]>([]),[team,setTeam]=useState(""),[newName,setNewName]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[consent,setConsent]=useState(false),[partnerInviteOpen,setPartnerInviteOpen]=useState(false);
  const count=s.event.match_type==="doubles"?2:1;
  const partnerInvites=useQuery("accepted-partner-invites-"+s.event.id,()=>count===2&&!manual?rpc<PartnerInvite[]>("list_sent_doubles_partner_invites",{p_event_id:s.event.id}):Promise.resolve([] as PartnerInvite[]),10000);
  useEffect(()=>{repository.players().then(ps=>{setPlayers(ps);const self=ps.find(p=>p.player_type==="self");setSelected(!manual&&self?[self.id]:[])}).catch(e=>setError(explainError(e)))},[manual]);
  const taken=new Set(s.entries.filter(e=>e.status!=="withdrawn").flatMap(e=>e.players.map(p=>p.id)));
  const selfPlayer=players.find(p=>p.player_type==="self"),manualPlayers=players.filter(p=>p.player_type==="manual"),selectedPlayers=players.filter(p=>selected.includes(p.id)),hasProxyPlayer=selectedPlayers.some(p=>p.player_type==="manual"),acceptedPartners=(partnerInvites.data||[]).filter(i=>i.status==="accepted"&&!!i.self_player_id),partnerId=selected.find(id=>id!==selfPlayer?.id);
  function choosePartner(id:string){if(selfPlayer){setSelected([selfPlayer.id,id]);setConsent(false)}}
  async function add(){if(!newName.trim())return;setBusy(true);try{const p=await repository.savePlayer(null,newName.trim(),null);setPlayers(x=>[...x,p]);setNewName("");if(manual){if(selected.length<count)setSelected(x=>[...x,p.id])}else if(count===2&&selfPlayer){setSelected([selfPlayer.id,p.id]);setConsent(false)}}catch(e){setError(explainError(e))}finally{setBusy(false)}}
  async function save(){setBusy(true);setError("");try{await rpc("join_event",{p_event_id:s.event.id,p_player_ids:selected,p_team_name:team||null,p_manual:manual});onDone()}catch(e){setError(explainError(e))}finally{setBusy(false)}}
  return <><Sheet open title={manual?"手动添加"+(count===2?"双打队伍":"临时参赛者"):count===2?"报名双打":"确认报名"} onClose={onClose}>
    <p>{s.event.name}</p><p className="muted small">{s.event.event_date||"日期待定"} · {s.event.venue||"场地待定"} · {feeText(s.event,s.entries.filter(e=>e.status==="confirmed").length)}</p>
    {count===2&&<label>队伍名称（可选）<input maxLength={60} value={team} onChange={e=>setTeam(e.target.value)}/></label>}
    {manual?<><h3>选择 {count} 位参赛者</h3>{players.map(p=><label className="check" key={p.id}><input type="checkbox" checked={selected.includes(p.id)} disabled={taken.has(p.id)} onChange={e=>setSelected(x=>e.target.checked?(x.length<count?[...x,p.id]:x):x.filter(id=>id!==p.id))}/><span>{p.name}{p.player_type==="self"?"（我）":""}{taken.has(p.id)?" · 已在名单中":""}</span></label>)}<div className="card"><label>临时参赛者姓名 / 昵称<input maxLength={40} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="录入一位临时参赛者"/></label><button className="secondary full" disabled={busy||!newName.trim()} onClick={add}>录入临时参赛者</button></div></>:<><h3>参赛身份</h3>{selfPlayer?<div className="card row"><Avatar path={selfPlayer.avatar_url} name={selfPlayer.name} size={40}/><div><strong>{selfPlayer.name}（我）</strong><p className="muted small">本次报名固定由你本人参加</p></div></div>:<div className="error">没有找到你的参赛身份，请先完善个人资料。</div>}{count===2&&<><div className="section-heading"><h3>选择搭档</h3><button className="text-button" onClick={()=>setPartnerInviteOpen(true)}>邀请球搭子</button></div>{acceptedPartners.length>0&&<p className="muted small">已接受组队邀请</p>}{acceptedPartners.map(i=><button type="button" className={"card row full "+(partnerId===i.self_player_id?"selected":"")} key={i.id} disabled={!i.self_player_id||taken.has(i.self_player_id)} onClick={()=>i.self_player_id&&choosePartner(i.self_player_id)}><Avatar path={i.avatar_url} name={i.nickname||"球搭子"} size={40}/><span className="grow">{i.nickname||"球搭子"}</span><span className="muted small">{taken.has(i.self_player_id!)?"已在名单中":partnerId===i.self_player_id?"已选择":"选择"}</span></button>)}<p className="muted small">搭档还没使用球搭子？可以作为临时搭档录入。</p>{manualPlayers.map(p=><button type="button" className={"card row full "+(partnerId===p.id?"selected":"")} key={p.id} disabled={taken.has(p.id)} onClick={()=>choosePartner(p.id)}><Avatar path={p.avatar_url} name={p.name} size={40}/><span className="grow">{p.name}</span><span className="muted small">临时搭档{taken.has(p.id)?" · 已在名单中":partnerId===p.id?" · 已选择":""}</span></button>)}<div className="card"><label>新临时搭档姓名 / 昵称<input maxLength={40} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="例如：Alex"/></label><button className="secondary full" disabled={busy||!newName.trim()} onClick={add}>添加临时搭档</button></div></>}</>}
    {hasProxyPlayer&&<label className="check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>我已获得临时参赛者同意，代其提交本次赛事报名信息。</span></label>}
    <p className="muted small">名额以提交时数据库为准。正式名额已满将按顺序加入候补，最多候补2{unit(s.event)}。</p><ErrorNotice message={error||partnerInvites.error}/><button className="full" disabled={busy||(!selfPlayer&&!manual)||selected.length!==count||(hasProxyPlayer&&!consent)||selected.some(id=>taken.has(id))} onClick={save}>{busy?"正在提交…":manual?"确认添加":"确认报名"}</button>
  </Sheet>{count===2&&!manual&&<EventInviteSheet eventId={s.event.id} open={partnerInviteOpen} onClose={()=>{setPartnerInviteOpen(false);partnerInvites.refresh()}} onChanged={partnerInvites.refresh}/>}</>;
}
