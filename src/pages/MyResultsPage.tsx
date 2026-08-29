import { Link } from "react-router-dom";
import { Header, Loading, Empty, ErrorNotice, labelFor } from "../components/UI";
import { rpc } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import { useLanguage } from "../i18n";
import "../results.css";

type Score = { set_no:number; a:number; b:number; ta:number|null; tb:number|null };
type MatchRow = { match_id:string; event_id:string; event_name:string; event_date:string|null; match_type:string; stage:string; round_no:number; won:boolean; my_side:"a"|"b"; opponents:{name:string}[]; scores:Score[] };
type History = { summary:{played:number;wins:number;losses:number}; matches:MatchRow[] };

function scoreText(scores: Score[], mySide: "a"|"b") {
  return scores.map(s => {
    const mine = mySide === "a" ? s.a : s.b;
    const theirs = mySide === "a" ? s.b : s.a;
    const myTie = mySide === "a" ? s.ta : s.tb;
    const theirTie = mySide === "a" ? s.tb : s.ta;
    return `${mine}-${theirs}${myTie != null && theirTie != null ? `(${myTie}-${theirTie})` : ""}`;
  }).join("  ");
}

export function MyResultsPage() {
  const {language,t}=useLanguage();const en=language==="en";
  const q = useQuery("my-match-history", () => rpc<History>("get_my_match_history"));
  const h = q.data;
  return <>
    <Header title={t("myResults")} />
    <main className="page">
      <span className="eyebrow">{en?"MY MATCH RECORD":"比赛记录"}</span>
      <h1>{t("myResults")}</h1>
      <p className="muted">{en?"Completed match results live here. Event registration and management stay in My Events.":"这里记录你真正完成的比赛结果；赛事报名和管理仍在「我的赛事」。"}</p>
      <ErrorNotice message={q.error} retry={q.refresh} />
      {q.loading && !h ? <Loading /> : h ? <>
        <div className="stats-grid">
          <div className="stat-card"><strong>{h.summary.played}</strong><span>{en?"Played":"完赛"}</span></div>
          <div className="stat-card"><strong>{h.summary.wins}</strong><span>{en?"Wins":"胜场"}</span></div>
          <div className="stat-card"><strong>{h.summary.losses}</strong><span>{en?"Losses":"负场"}</span></div>
        </div>
        <div className="section-heading"><h2>{en?"Match history":"比赛记录"}</h2></div>
        {h.matches.length ? h.matches.map(m => <Link className="card result-card" to={`/events/${m.event_id}`} key={m.match_id}>
          <div className="row between"><strong>{m.event_name}</strong><span className={`badge ${m.won ? "success" : ""}`}>{m.won ? (en?"Win":"胜") : (en?"Loss":"负")}</span></div>
          <p className="muted small">{m.event_date || (en?"Date TBD":"日期待定")} · {labelFor(m.match_type,language)} · {en?"vs":"对阵"} {m.opponents.map(x=>x.name).join(" / ") || (en?"TBD":"待补充")}</p>
          <div className="result-score">{scoreText(m.scores, m.my_side) || (en?"Completed":"已完赛")}</div>
        </Link>) : <Empty title={en?"No match results yet":"还没有比赛战绩"}><p>{en?"After you complete and submit a match, the result appears here automatically.":"完成并提交一场比赛后，结果会自动出现在这里。"}</p><Link className="button" to="/my-events">{en?"View My Events":"查看我的赛事"}</Link></Empty>}
      </> : null}
    </main>
  </>;
}
