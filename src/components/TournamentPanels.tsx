import { useState } from "react";
import { Link } from "react-router-dom";
import { Camera, Trophy, GitBranch, ListOrdered, ImagePlus } from "lucide-react";
import type { Match, Snapshot } from "../domain/types";
import { ranking, groupRankings, podium } from "../domain/RankingEngine";
import { entryName, ErrorNotice, Confirm } from "./UI";
import {
  assetUrl,
  supabase,
  uploadAsset,
  rpc,
  explainError,
} from "../repositories/supabase";
import { imageBlob, watermarkPhoto } from "../utils/images";
export function MatchCard({ m, s }: { m: Match; s: Snapshot }) {
  const a = s.entries.find((e) => e.id === m.entry_a_id),
    b = s.entries.find((e) => e.id === m.entry_b_id),
    sets = s.set_scores
      .filter((x) => x.match_id === m.id)
      .sort((a, b) => a.set_no - b.set_no);
  return (
    <Link
      className="match-card"
      to={"/events/" + s.event.id + "/matches/" + m.id}
    >
      <div className="row between">
        <small>
          {m.is_bye
            ? "轮空"
            : m.status === "not_started"
              ? "未开始"
              : m.status === "ongoing"
                ? "进行中"
                : "已结束"}
        </small>
        <small>{m.is_bye ? "Bye" : sets.length ? "盘分" : "VS"}</small>
      </div>
      <div
        className={
          "row between " + (m.winner_entry_id === a?.id ? "winner" : "")
        }
      >
        <span>{a ? entryName(a) : m.is_bye ? "轮空" : entryName(a)}</span>
        <b className="score">
          {sets.map((x) => x.a_games_or_points).join(" · ")}
        </b>
      </div>
      <div
        className={
          "row between " + (m.winner_entry_id === b?.id ? "winner" : "")
        }
      >
        <span>{b ? entryName(b) : m.is_bye ? "轮空" : entryName(b)}</span>
        <b className="score">
          {sets.map((x) => x.b_games_or_points).join(" · ")}
        </b>
      </div>
      {m.is_bye && (
        <small>
          {m.stage === "knockout" ? "自动晋级下一轮" : "本轮休息，不计入胜场"}
        </small>
      )}
    </Link>
  );
}
function DrawPlaceholder({ s }: { s: Snapshot }) {
  const knockout = s.event.format === "knockout";
  return <div className="tournament-placeholder">
    <div className="placeholder-heading row">
      <span className="placeholder-icon"><GitBranch size={19}/></span>
      <div><strong>{knockout ? "淘汰签表" : s.event.format === "group_knockout" ? "小组赛与淘汰签表" : "轮次对阵"}</strong><p className="muted small">名单锁定并生成对阵后，比赛会直接填入这里。</p></div>
    </div>
    <div className="draw-skeleton" aria-hidden="true">
      <section><small>{knockout ? "首轮" : "第 1 轮"}</small><div className="skeleton-match"><i/><i/></div><div className="skeleton-match"><i/><i/></div></section>
      <span className="draw-connector">›</span>
      <section><small>{knockout ? "下一轮" : "第 2 轮"}</small><div className="skeleton-match compact"><i/><i/></div></section>
    </div>
    <p className="placeholder-foot">现在还没有真实对阵，不展示虚构选手或比分。</p>
  </div>;
}
export function DrawPanel({ s }: { s: Snapshot }) {
  const [group, setGroup] = useState(1);
  const ko = s.matches.filter((m) => m.stage === "knockout"),
    league = s.matches.filter(
      (m) =>
        m.stage !== "knockout" && (m.group_no === null || m.group_no === group),
    );
  return (
    <>
      {!s.matches.length && <DrawPlaceholder s={s}/>} 
      {s.event.format === "group_knockout" && s.matches.length > 0 && (
        <div className="chips">
          {Array.from({ length: s.event.group_count! }, (_, i) => (
            <button
              key={i}
              className={group === i + 1 ? "active" : ""}
              onClick={() => setGroup(i + 1)}
            >
              {String.fromCharCode(65 + i)} 组
            </button>
          ))}
        </div>
      )}
      {s.event.format === "group_knockout" && !!league.length && (
        <div className="card">
          <h3>本组实时排名</h3>
          {groupRankings(s)[group - 1].map((r) => (
            <div className="row between small" key={r.entry_id}>
              <span>
                {r.rank}.{" "}
                {entryName(s.entries.find((e) => e.id === r.entry_id))}
              </span>
              <span>
                {r.wins}胜 · 局差{r.game_difference}
              </span>
            </div>
          ))}
        </div>
      )}
      {[...new Set(league.map((m) => m.round_no))]
        .sort((a, b) => a - b)
        .map((r) => (
          <section key={r}>
            <h3>第 {r} 轮</h3>
            {league
              .filter((m) => m.round_no === r)
              .map((m) => (
                <MatchCard key={m.id} m={m} s={s} />
              ))}
          </section>
        ))}
      {!!ko.length && (
        <>
          <h2>淘汰签表</h2>
          <p className="small muted">左右滑动查看各轮 · 点击比赛查看或记分</p>
          <div className="bracket">
            {[...new Set(ko.map((m) => m.round_no))]
              .sort((a, b) => a - b)
              .map((r) => (
                <section key={r} className="bracket-round">
                  <h3>
                    {ko.filter((m) => m.round_no === r).length === 1
                      ? "决赛"
                      : ko.filter((m) => m.round_no === r).length === 2
                        ? "半决赛"
                        : "第 " + r + " 轮"}
                  </h3>
                  {ko
                    .filter((m) => m.round_no === r)
                    .sort((a, b) => a.bracket_position! - b.bracket_position!)
                    .map((m) => (
                      <MatchCard key={m.id} m={m} s={s} />
                    ))}
                </section>
              ))}
          </div>
        </>
      )}
      {s.event.format === "group_knockout" && !ko.length && !!league.length && (
        <p className="notice">
          全部小组赛完成后，系统按排名自动生成晋级名单与淘汰签表。
        </p>
      )}
    </>
  );
}
function RankingPlaceholder() {
  return <div className="tournament-placeholder ranking-placeholder">
    <div className="placeholder-heading row"><span className="placeholder-icon"><ListOrdered size={19}/></span><div><strong>赛事排名</strong><p className="muted small">比赛开始后，排名会根据真实赛果自动更新。</p></div></div>
    <div className="ranking-table-skeleton" aria-hidden="true">
      <div className="ranking-table-head"><span>名次</span><span>参赛者</span><span>已赛</span><span>胜负</span><span>局差</span></div>
      {[1,2,3].map(n=><div className="ranking-table-row" key={n}><b>0{n}</b><i/><span>—</span><span>—</span><span>—</span></div>)}
    </div>
    <p className="placeholder-foot">排名区域已经就位；没有真实赛果前不生成虚假名次。</p>
  </div>;
}
export function RankingPanel({ s }: { s: Snapshot }) {
  const [group, setGroup] = useState(1);
  const rows =
    s.event.format === "group_knockout"
      ? groupRankings(s)[group - 1]
      : ranking(s);
  const results = podium(s),
    complete =
      s.matches.length > 0 && s.matches.every((m) => m.status === "finished");
  return (
    <>
      {!s.matches.length && <RankingPlaceholder/>}
      {complete && results.length > 0 && (
        <div className="winner-banner">
          <Trophy size={30} />
          <h2>{entryName(results[0].entries[0])}</h2>
          <p>本场冠军</p>
        </div>
      )}
      {s.matches.length > 0 && (s.event.format === "knockout" ? (
        results.length ? (
          results.map((r) => (
            <div className="card" key={r.label}>
              <span className="badge">{r.label}</span>
              <h3>{r.entries.map(entryName).join("、")}</h3>
            </div>
          ))
        ) : (
          <div className="tournament-placeholder compact-placeholder"><div className="placeholder-heading row"><span className="placeholder-icon"><Trophy size={18}/></span><div><strong>领奖台等待赛果</strong><p className="muted small">决赛结束后，这里会展示冠军、亚军和并列季军。</p></div></div></div>
        )
      ) : (
        <>
          {s.event.format === "group_knockout" && (
            <div className="chips">
              {Array.from({ length: s.event.group_count! }, (_, i) => (
                <button
                  key={i}
                  className={group === i + 1 ? "active" : ""}
                  onClick={() => setGroup(i + 1)}
                >
                  {String.fromCharCode(65 + i)} 组
                </button>
              ))}
            </div>
          )}
          {rows.map((row) => (
            <div className="card" key={row.entry_id}>
              <div className="row">
                <b className="rank-number">
                  {String(row.rank).padStart(2, "0")}
                </b>
                <strong className="grow">
                  {entryName(s.entries.find((e) => e.id === row.entry_id))}
                </strong>
                {s.event.format === "group_knockout" &&
                  row.rank <= s.event.qualifiers_per_group! && (
                    <span className="badge">
                      {s.matches
                        .filter((m) => m.stage === "group")
                        .every((m) => m.status === "finished")
                        ? "晋级"
                        : "暂列晋级位"}
                    </span>
                  )}
              </div>
              <div className="ranking-stats">
                <span>已赛 {row.played}</span>
                <span>
                  {row.wins} 胜 / {row.losses} 负
                </span>
                <span>
                  局差 {row.game_difference > 0 ? "+" : ""}
                  {row.game_difference}
                </span>
                <span>胜局 {row.games_won}</span>
              </div>
            </div>
          ))}
          <p className="muted small">
            排序：胜场 → 两人同胜场时相互战绩 → 局差 → 胜局 →
            报名时间。三人及以上同胜场不使用两两相互战绩；连续抢分的小分不计入局差。
          </p>
        </>
      ))}
    </>
  );
}
export function PhotoPanel({
  s,
  owner,
  onDone,
}: {
  s: Snapshot;
  owner: boolean;
  onDone: () => void;
}) {
  const [pending, setPending] = useState<File | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function upload(file: File) {
    setBusy(true);
    setError("");
    const paths: string[] = [];
    let saved = false;
    try {
      const original = await imageBlob(file),
        marked = await watermarkPhoto(original, s);
      const { data } = await supabase!.auth.getSession();
      const folder =
        data.session!.user.id + "/" + s.event.id + "/" + crypto.randomUUID();
      paths.push(
        await uploadAsset(original, "event-photos", folder + "-original.jpg"),
      );
      paths.push(
        await uploadAsset(marked, "event-photos", folder + "-watermark.jpg"),
      );
      await rpc("save_event_photo", {
        p_event_id: s.event.id,
        p_original: paths[0],
        p_watermarked: paths[1],
        p_version: s.photo?.version || 0,
      });
      saved = true;
      if (s.photo)
        await supabase!.storage
          .from("event-photos")
          .remove([s.photo.original_url, s.photo.watermarked_url]);
      onDone();
    } catch (e) {
      setError(explainError(e));
    } finally {
      if (!saved && paths.length)
        await supabase!.storage.from("event-photos").remove(paths);
      setBusy(false);
    }
  }
  return (
    <>
      {s.photo ? (
        <>
          <img
            className="photo"
            src={assetUrl(s.photo.watermarked_url, "event-photos")}
            alt={s.event.name + "赛后合影，含最终名次水印"}
          />
          <p className="muted small">
            赛事主合影 ·{" "}
            {new Date(s.photo.uploaded_at).toLocaleDateString("zh-CN")}
          </p>
        </>
      ) : (
        <div className="photo-upload-stage">
          <span className="photo-upload-icon"><Camera size={28}/></span>
          <h3>把这场球，留在照片里</h3>
          <p className="muted">
            {s.event.status === "finished"
              ? owner ? "从手机照片中选择一张本场合影。上传后会自动生成赛事水印。" : "等待组织者上传本场合影。"
              : "比赛结束后，这里会成为本场赛事的合影位置。"}
          </p>
          <div className="photo-frame-preview" aria-hidden="true"><ImagePlus size={24}/><span>赛事主合影</span></div>
        </div>
      )}
      <ErrorNotice message={error} />
      {owner && s.event.status === "finished" && (
        <>
          <label className="button full photo-upload-button">
            {busy
              ? "正在生成水印并上传…"
              : s.photo
                ? "更换合影"
                : "选择照片并上传"}
            <input
              className="sr-only"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  if (s.photo) setPending(file);
                  else void upload(file);
                }
                e.target.value = "";
              }}
            />
          </label>
          <p className="muted small">
            不会在进入页面时申请摄像头权限。请选择已取得拍摄对象许可的照片；水印包含赛事名称、最终名次和比赛日期。
          </p>
        </>
      )}
      {pending && (
        <Confirm
          title="替换本场主合影？"
          description="新照片将替换原主合影，并重新生成赛事名称、最终名次和日期水印。"
          onCancel={() => setPending(null)}
          onConfirm={() => {
            const file = pending;
            setPending(null);
            void upload(file);
          }}
        />
      )}
    </>
  );
}
