import { Link } from "react-router-dom";
import { Header, Loading, Empty, ErrorNotice, labels } from "../components/UI";
import { rpc } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";

type Score = { set_no:number; a:number; b:number; ta:number|null; tb:number|null };
type MatchRow = { match_id:string; event_id:string; event_name:string; event_date:string|null; match_type:string; stage:string; round_no:number; won:boolean; opponents:{name:string}[]; scores:Score[] };
type History = { summary:{played:number;wins:number;losses:number}; matches:MatchRow[] };

function scoreText(scores: Score[]) {
  return scores.map(s => `${s.a}-${s.b}${s.ta != null && s.tb != null ? `(${s.ta}-${s.tb})` : ""}`).join("  ");
}

export function MyResultsPage() {
  const q = useQuery("my-match-history", () => rpc<History>("get_my_match_history"), 15000);
  const h = q.data;
  return <>
    <Header title="我的战绩" />
    <main className="page">
      <span className="eyebrow">MY MATCH RECORD</span>
      <h1>我的战绩</h1>
      <p className="muted">这里记录你真正完成的比赛结果；赛事报名和管理仍在「我的赛事」。</p>
      <ErrorNotice message={q.error} retry={q.refresh} />
      {q.loading && !h ? <Loading /> : h ? <>
        <div className="stats-grid">
          <div className="stat-card"><strong>{h.summary.played}</strong><span>完赛</span></div>
          <div className="stat-card"><strong>{h.summary.wins}</strong><span>胜场</span></div>
          <div className="stat-card"><strong>{h.summary.losses}</strong><span>负场</span></div>
        </div>
        <div className="section-heading"><h2>比赛记录</h2></div>
        {h.matches.length ? h.matches.map(m => <Link className="card result-card" to={`/events/${m.event_id}`} key={m.match_id}>
          <div className="row between"><strong>{m.event_name}</strong><span className={`badge ${m.won ? "success" : ""}`}>{m.won ? "胜" : "负"}</span></div>
          <p className="muted small">{m.event_date || "日期待定"} · {labels[m.match_type] || m.match_type} · 对阵 {m.opponents.map(x=>x.name).join(" / ") || "待补充"}</p>
          <div className="result-score">{scoreText(m.scores) || "已完赛"}</div>
        </Link>) : <Empty title="还没有比赛战绩"><p>完成并提交一场比赛后，结果会自动出现在这里。</p><Link className="button" to="/my-events">查看我的赛事</Link></Empty>}
      </> : null}
    </main>
  </>;
}
