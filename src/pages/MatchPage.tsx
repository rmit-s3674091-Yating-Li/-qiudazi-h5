import { useEffect, useRef, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import type { ScoreInput, Snapshot, Side } from "../domain/types";
import {
  replay,
  displayPoints,
  contextFor,
  setWinner,
  validateFinalScore,
  tieTrigger,
  isPointSet,
} from "../domain/ScoringEngine";
import { command, repository, explainError } from "../repositories/supabase";
import { useQuery } from "../hooks/useQuery";
import {
  Header,
  ErrorNotice,
  Loading,
  entryName,
  labels,
  Confirm,
} from "../components/UI";
import { applyCommand } from "../application/TournamentService";
export function MatchPage({
  mode = "detail",
}: {
  mode?: "detail" | "direct" | "live";
}) {
  const { id, matchId } = useParams(),
    navigate = useNavigate();
  const q = useQuery(
    "match-" + id + "-" + matchId,
    () => repository.event(id!),
    10000,
  );
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState<(() => void) | null>(null),
    [inputs, setInputs] = useState<
      { a: string; b: string; ta: string; tb: string }[]
    >([]),
    [formVersion, setFormVersion] = useState<number>(),
    [editing, setEditing] = useState(false);
  const loaded = useRef("");
  const s = q.data,
    m = s?.matches.find((x) => x.id === matchId);
  useEffect(() => {
    if (!s || !m || loaded.current === m.id + mode) return;
    loaded.current = m.id + mode;
    const sets = s.set_scores
      .filter((x) => x.match_id === m.id)
      .sort((a, b) => a.set_no - b.set_no);
    setInputs(
      Array.from({ length: s.event.best_of }, (_, i) => ({
        a: sets[i] ? String(sets[i].a_games_or_points) : "",
        b: sets[i] ? String(sets[i].b_games_or_points) : "",
        ta:
          sets[i]?.a_tiebreak_points != null
            ? String(sets[i].a_tiebreak_points)
            : "",
        tb:
          sets[i]?.b_tiebreak_points != null
            ? String(sets[i].b_tiebreak_points)
            : "",
      })),
    );
    setFormVersion(m.version);
    setEditing(false);
  }, [s, m, mode]);
  async function send(
    type: string,
    extra: Record<string, unknown> = {},
    confirmed = false,
  ) {
    if (!s || !m) return;
    setBusy(true);
    setError("");
    try {
      await command(s.event.id, {
        type,
        event_version: s.event.version,
        match_id: m.id,
        match_version: type === "score" ? formVersion : m.version,
        ...extra,
        confirmed,
      });
      setConfirm(null);
      await q.refresh();
      if (type === "score")
        navigate("/events/" + id + "/matches/" + matchId, { replace: true });
    } catch (e) {
      const text = explainError(e);
      if (text.includes("级联") || text.includes("请确认")) {
        setConfirmText(text);
        setConfirm(() => () => {
          void send(type, extra, true);
        });
      } else setError(text);
    } finally {
      setBusy(false);
    }
  }
  if (!s)
    return (
      <>
        <Header title="比赛" />
        <main className="page">
          <ErrorNotice message={q.error} retry={q.refresh} />
          {q.loading && <Loading />}
        </main>
      </>
    );
  if (!m)
    return (
      <>
        <Header title="比赛已调整" />
        <main className="page">
          <p>这场比赛可能在重新生成签表后被替换，请返回赛事查看最新对阵。</p>
          <Link className="button" to={"/events/" + id}>
            查看赛事
          </Link>
        </main>
      </>
    );
  const e = s.event,
    owner = s.viewer_role === "owner",
    canScore =
      owner &&
      e.status === "ongoing" &&
      !m.is_bye &&
      !!m.entry_a_id &&
      !!m.entry_b_id,
    a = entryName(s.entries.find((x) => x.id === m.entry_a_id)),
    b = entryName(s.entries.find((x) => x.id === m.entry_b_id));
  const logs = s.point_logs.filter((l) => l.match_id === m.id),
    live = replay(e, logs),
    display = displayPoints(e, live),
    sets = s.set_scores
      .filter((x) => x.match_id === m.id)
      .sort((a, b) => a.set_no - b.set_no),
    base = "/events/" + id + "/matches/" + matchId;
  const scores: ScoreInput[] = inputs
    .filter((x) => x.a !== "" || x.b !== "")
    .map((x) => ({
      a: x.a === "" ? NaN : Number(x.a),
      b: x.b === "" ? NaN : Number(x.b),
      ta: x.ta === "" ? null : Number(x.ta),
      tb: x.tb === "" ? null : Number(x.tb),
    }));
  let validation = "";
  try {
    const lastFilled = inputs.reduce(
      (last, score, i) => (score.a !== "" || score.b !== "" ? i : last),
      -1,
    );
    if (
      inputs
        .slice(0, lastFilled + 1)
        .some((score) => score.a === "" || score.b === "")
    ) {
      throw new Error("请按顺序完整填写每一盘的双方比分，不能跳过中间盘。");
    }
    validateFinalScore(e, scores);
  } catch (err) {
    validation = explainError(err);
  }
  const wins = [0, 0];
  let stop = -1;
  inputs.forEach((x, i) => {
    if (stop >= 0) return;
    try {
      const winner = setWinner(e, {
        a: x.a === "" ? NaN : Number(x.a),
        b: x.b === "" ? NaN : Number(x.b),
        ta: x.ta === "" ? null : Number(x.ta),
        tb: x.tb === "" ? null : Number(x.tb),
      });
      wins[winner === "A" ? 0 : 1]++;
      if (Math.max(...wins) === (e.best_of + 1) / 2) stop = i;
    } catch {}
  });
  function confirmScore() {
    try {
      const next = applyCommand(
        s!,
        e.owner_user_id,
        {
          type: "score",
          event_version: e.version,
          match_id: m!.id,
          match_version: formVersion,
          scores,
          confirmed: true,
        },
        { id: () => crypto.randomUUID(), now: () => new Date().toISOString() },
      );
      const changed = next.matches.filter((n) => {
        const old = s!.matches.find((o) => o.id === n.id);
        return (
          n.id !== m!.id &&
          (!old ||
            old.entry_a_id !== n.entry_a_id ||
            old.entry_b_id !== n.entry_b_id)
        );
      });
      setConfirmText(
        changed.length
          ? "本次更正会重建 " +
              changed.length +
              " 场未开始的下游/晋级比赛，并刷新排名。已开始的下游不会被覆盖。"
          : "本次更正会替换本场比分并重新计算排名；不改变其他比赛参赛者。",
      );
      setConfirm(() => () => {
        void send("score", { scores }, true);
      });
    } catch (err) {
      setError(explainError(err));
    }
  }
  function update(i: number, key: "a" | "b" | "ta" | "tb", value: string) {
    setEditing(true);
    setInputs((old) => {
      const next = old.map((x, j) => (j === i ? { ...x, [key]: value } : x));
      const w = [0, 0];
      let won = false;
      return next.map((x) => {
        if (won) return { a: "", b: "", ta: "", tb: "" };
        try {
          const side = setWinner(e, {
            a: x.a === "" ? NaN : Number(x.a),
            b: x.b === "" ? NaN : Number(x.b),
            ta: x.ta === "" ? null : Number(x.ta),
            tb: x.tb === "" ? null : Number(x.tb),
          });
          w[side === "A" ? 0 : 1]++;
          won = Math.max(...w) === (e.best_of + 1) / 2;
        } catch {}
        return x;
      });
    });
  }
  return (
    <>
      <Header
        title={
          mode === "live"
            ? "实时记分"
            : mode === "direct"
              ? "直接录入比分"
              : "比赛详情"
        }
      />
      <main className="page">
        <span className="eyebrow">
          {m.stage === "knockout" ? "KNOCKOUT" : "MATCH DAY"} · ROUND{" "}
          {m.round_no}
        </span>
        <div className="row between">
          <span className="badge">
            {m.is_bye
              ? "轮空"
              : m.status === "finished"
                ? "已结束"
                : m.status === "ongoing"
                  ? "进行中"
                  : "未开始"}
          </span>
          <small className="muted">
            {labels[e.scoring_type]} · best of {e.best_of}
          </small>
        </div>
        <h2>
          {a} <span className="muted">vs</span> {b}
        </h2>
        <ErrorNotice message={error || q.error} retry={q.refresh} />
        {formVersion !== undefined &&
          mode === "direct" &&
          m.version !== formVersion && (
            <div className="error">
              此比赛已被其他页面更新，当前表单版本已过期。请返回比赛详情后重新录入。
            </div>
          )}
        {mode === "live" && (
          <>
            <div className="score-state">
              {m.status === "finished" ? "比赛结束" : display.label}
            </div>
            <div className="score-court">
              <div className="score-head">
                <span>{a}</span>
                <span>{b}</span>
              </div>
              <div className="points">
                <span>{display.a}</span>
                <span>{display.b}</span>
              </div>
              <div className="game-score">
                {live.winner
                  ? "最终盘分 " + live.wins.join(" : ")
                  : "第 " +
                    (live.sets.length + 1) +
                    " 盘 · 局分 " +
                    live.games.join(" : ")}
              </div>
              <div className="point-actions">
                <button
                  disabled={
                    !canScore ||
                    busy ||
                    m.status === "finished" ||
                    m.scoring_mode === "direct"
                  }
                  onClick={() => send("point", { side: "A" as Side })}
                  aria-label={a + "得一分"}
                >
                  ＋1 分
                </button>
                <button
                  disabled={
                    !canScore ||
                    busy ||
                    m.status === "finished" ||
                    m.scoring_mode === "direct"
                  }
                  onClick={() => send("point", { side: "B" as Side })}
                  aria-label={b + "得一分"}
                >
                  ＋1 分
                </button>
              </div>
            </div>
            <button
              className="secondary full"
              disabled={
                !canScore ||
                busy ||
                !logs.some((l) => !l.voided_at) ||
                m.scoring_mode === "direct"
              }
              onClick={() => send("undo")}
            >
              撤销上一分
            </button>
            <p className="small muted">
              {busy ? "正在保存，请稍候…" : "每一分实时保存到在线数据库。"}{" "}
              {contextFor(e, live) === "normal_game"
                ? "传统占先制"
                : "领先2分获胜"}
              。已记录 {logs.filter((l) => !l.voided_at).length} 分。
            </p>
          </>
        )}
        {mode === "direct" && (
          <>
            <p className="small muted">
              按实际盘分逐盘填写。发生抢七时需要填写抢七小分；比赛结束后的盘会自动禁用。
            </p>
            <div className="row between">
              <strong>{a}</strong>
              <strong>{b}</strong>
            </div>
            {inputs.map((x, i) => {
              const tb =
                !isPointSet(e) &&
                Math.max(Number(x.a), Number(x.b)) === tieTrigger(e) + 1 &&
                Math.min(Number(x.a), Number(x.b)) === tieTrigger(e);
              return (
                <section className="card" key={i}>
                  <div className="score-input-row">
                    <span>第{i + 1}盘</span>
                    <input
                      aria-label={"第" + (i + 1) + "盘A方比分"}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={x.a}
                      disabled={!canScore || busy || (stop >= 0 && i > stop)}
                      onChange={(ev) => update(i, "a", ev.target.value)}
                    />
                    <span>:</span>
                    <input
                      aria-label={"第" + (i + 1) + "盘B方比分"}
                      type="number"
                      inputMode="numeric"
                      min="0"
                      value={x.b}
                      disabled={!canScore || busy || (stop >= 0 && i > stop)}
                      onChange={(ev) => update(i, "b", ev.target.value)}
                    />
                  </div>
                  {(tb || x.ta || x.tb) && (
                    <div className="score-input-row">
                      <span>抢七</span>
                      <input
                        aria-label={"第" + (i + 1) + "盘A方抢七小分"}
                        className="tb"
                        type="number"
                        inputMode="numeric"
                        value={x.ta}
                        disabled={!canScore || busy}
                        onChange={(ev) => update(i, "ta", ev.target.value)}
                      />
                      <span>:</span>
                      <input
                        aria-label={"第" + (i + 1) + "盘B方抢七小分"}
                        className="tb"
                        type="number"
                        inputMode="numeric"
                        value={x.tb}
                        disabled={!canScore || busy}
                        onChange={(ev) => update(i, "tb", ev.target.value)}
                      />
                    </div>
                  )}
                </section>
              );
            })}
            {editing && validation && <p className="notice">{validation}</p>}
            <button
              className="full"
              disabled={
                !canScore || busy || !!validation || m.version !== formVersion
              }
              onClick={() =>
                m.status === "finished"
                  ? confirmScore()
                  : send("score", { scores })
              }
            >
              {busy
                ? "正在保存…"
                : m.status === "finished"
                  ? "更正比分"
                  : "保存最终比分"}
            </button>
          </>
        )}
        {mode === "detail" && (
          <div className="detail-score">
            <strong>
              {sets.filter((x) => x.winner_entry_id === m.entry_a_id).length}
            </strong>
            <span>盘分</span>
            <strong>
              {sets.filter((x) => x.winner_entry_id === m.entry_b_id).length}
            </strong>
          </div>
        )}
        {mode !== "direct" && (
          <>
            <h3>{sets.length ? "已完成盘分" : "比赛记录"}</h3>
            {sets.length ? (
              <table className="score-table">
                <thead>
                  <tr>
                    <th>参赛者</th>
                    {sets.map((x) => (
                      <th key={x.set_no}>第{x.set_no}盘</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{a}</td>
                    {sets.map((x) => (
                      <td key={x.set_no}>
                        {x.a_games_or_points}
                        {x.a_tiebreak_points !== null && (
                          <small> ({x.a_tiebreak_points})</small>
                        )}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td>{b}</td>
                    {sets.map((x) => (
                      <td key={x.set_no}>
                        {x.b_games_or_points}
                        {x.b_tiebreak_points !== null && (
                          <small> ({x.b_tiebreak_points})</small>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            ) : (
              <p className="muted">
                {m.is_bye ? "本轮轮空，不需要记分。" : "尚无已完成盘分。"}
              </p>
            )}
          </>
        )}
        {mode === "detail" && canScore && (
          <div className="stack">
            <Link className="button" to={base + "/score"}>
              {m.status === "finished" ? "更正比分" : "直接录入最终比分"}
            </Link>
            {m.scoring_mode !== "direct" && (
              <Link className="button secondary" to={base + "/live"}>
                {m.status === "finished"
                  ? "查看逐分记录 / 撤销末分"
                  : "实时逐分记分"}
              </Link>
            )}
            {m.status === "not_started" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => send("begin")}
              >
                标记本场已开始
              </button>
            )}
          </div>
        )}
        {!canScore && (
          <p className="notice">
            {!owner
              ? "访客与参赛者可查看；只有创建者能记分。"
              : e.status === "finished"
                ? "赛事已结束，比分只读。"
                : e.status !== "ongoing"
                  ? "请在赛事管理中先开始赛事。"
                  : "轮空或等待双方晋级，暂不能记分。"}
          </p>
        )}
        <Link
          className="text-button full"
          to={"/events/" + id + (owner ? "/manage" : "")}
        >
          返回赛事 · 查看对阵与排名
        </Link>
      </main>
      {confirm && (
        <Confirm
          title="确认比分更正与级联影响"
          description={confirmText}
          busy={busy}
          onCancel={() => setConfirm(null)}
          onConfirm={confirm}
        />
      )}
    </>
  );
}