import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { Header, Avatar, ErrorNotice, Loading } from "../components/UI";
import { repository, rpc, explainError } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

const timeOptions = ["工作日白天", "工作日晚上", "周末白天", "周末晚上"];

export function MyTennisProfilePage() {
  const q = useQuery("partner-players", () => repository.players());
  const player = q.data?.find((x) => x.player_type === "self") || null;
  const [editing, setEditing] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [level, setLevel] = useState(""), [city, setCity] = useState(""), [times, setTimes] = useState<string[]>([]), [pref, setPref] = useState("");

  useEffect(() => {
    if (!player) return;
    setLevel(player.level || "");
    setCity(player.city || "");
    setTimes(player.play_times || []);
    setPref(player.play_preference || "");
  }, [player?.id, player?.version]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await rpc("save_my_tennis_profile", {
        p_level: level || null,
        p_city: city || null,
        p_play_times: times,
        p_play_preference: pref || null,
      });
      await q.refresh();
      setEditing(false);
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.loading && !q.data) return <><Header title="我的打球档案" /><main className="page"><Loading /></main></>;

  return <><Header title="我的打球档案" /><main className="page">
    <ErrorNotice message={error || q.error} retry={q.refresh} />
    {player && <>
      <div className="tennis-profile-head">
        <Avatar path={player.avatar_url} name={player.name} size={58} />
        <div className="grow"><strong>{player.name}</strong><p className="muted small">用于赛事名单和赛果展示</p></div>
        <a className="icon-button" href={`#/players/${player.id}/edit`} aria-label="编辑头像和昵称"><Pencil size={17} /></a>
      </div>
      <div className="section-heading"><div><span className="eyebrow">MY TENNIS PROFILE</span><h1>打球偏好</h1></div>{!editing && <button className="text-button" onClick={() => setEditing(true)}><Pencil size={15} /> 编辑</button>}</div>
      {!editing ? <div className="profile-fields">
        <div><small>水平级别</small><strong>{level || "待完善"}</strong></div>
        <div><small>常打城市</small><strong>{city || "待完善"}</strong></div>
        <div><small>单双打偏好</small><strong>{pref === "singles" ? "单打" : pref === "doubles" ? "双打" : pref === "both" ? "单双打都可以" : "待完善"}</strong></div>
        <div><small>约球时间</small><strong>{times.length ? times.join("、") : "待完善"}</strong></div>
      </div> : <div className="profile-editor">
        <label>水平级别<select value={level} onChange={(e) => setLevel(e.target.value)}><option value="">请选择</option>{["2.0", "2.5", "3.0", "3.5", "4.0", "4.5", "5.0+"].map((x) => <option key={x}>{x}</option>)}</select></label>
        <label>常打城市<input value={city} maxLength={30} placeholder="例如：北京" onChange={(e) => setCity(e.target.value)} /></label>
        <label>单双打偏好<select value={pref} onChange={(e) => setPref(e.target.value)}><option value="">请选择</option><option value="singles">单打</option><option value="doubles">双打</option><option value="both">单双打都可以</option></select></label>
        <div><strong className="field-label">约球时间</strong><div className="choice-grid">{timeOptions.map((t) => <label className="choice" key={t}><input type="checkbox" checked={times.includes(t)} onChange={(e) => setTimes((x) => e.target.checked ? [...x, t] : x.filter((v) => v !== t))} /><span>{t}</span></label>)}</div></div>
        <div className="row"><button className="secondary grow" onClick={() => setEditing(false)}>取消</button><button className="grow" disabled={busy} onClick={save}>{busy ? "保存中…" : "保存档案"}</button></div>
      </div>}
      <p className="muted small profile-hint">这些信息帮助球搭子了解你的打球习惯；比赛成绩由真实赛事自动记录，不能手动填写。</p>
    </>}
  </main></>;
}
