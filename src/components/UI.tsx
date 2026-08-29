import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  MapPin,
  Trophy,
  Users,
  UserRound,
  Flag,
  RefreshCw,
} from "lucide-react";
import type { Event, Entry } from "../domain/types";
import { assetUrl } from "../repositories/supabase";
export const labels: Record<string, string> = {
  signup: "报名中",
  locked: "已锁定",
  ongoing: "进行中",
  finished: "已结束",
  singles: "单打",
  doubles: "双打",
  round_robin: "单循环",
  knockout: "单淘汰",
  group_knockout: "小组 + 淘汰",
  games_4: "4局制",
  games_6: "6局制",
  tiebreak_7: "抢7",
  points_11: "抢11",
  points_15: "抢15",
  custom_games: "自定义局数",
};
export function unit(e: Event) {
  return e.match_type === "doubles" ? "队" : "人";
}
export function entryName(e: Entry | undefined) {
  return e ? e.team_name || e.players.map((p) => p.name).join(" / ") : "待晋级";
}
export function feeText(e: Event, count = e.confirmed_count || 0) {
  if (e.fee_type === "free") return "免费";
  if (e.fee_type === "fixed")
    return "¥" + e.fixed_fee_per_entry + "/" + unit(e);
  const total =
    (e.venue_fee_total || 0) +
    (e.ball_fee_total || 0) +
    (e.other_fee_total || 0);
  return count
    ? "AA 预计 ¥" + (total / count).toFixed(2) + "/" + unit(e)
    : "AA 总额 ¥" + total;
}
export function Brand() {
  return (
    <span className="brand">
      <i className="brand-mark" />
      <span>
        球搭子<small>TENNIS · TOGETHER</small>
      </span>
    </span>
  );
}
export function Avatar({
  path,
  name,
  size = 48,
}: {
  path?: string | null;
  name?: string;
  size?: number;
}) {
  return path ? (
    <img
      className="avatar"
      style={{ width: size, height: size }}
      src={assetUrl(path)}
      alt={name || "参赛者头像"}
    />
  ) : (
    <span
      className="avatar fallback"
      style={{ width: size, height: size }}
      aria-label="默认网球头像"
    >
      <i />
    </span>
  );
}
export function Header({
  title,
  back = true,
  action,
}: {
  title: string;
  back?: boolean;
  action?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="topbar">
      {back ? (
        <button
          className="icon-button"
          aria-label="返回"
          onClick={() =>
            window.history.length > 1 ? navigate(-1) : navigate("/events")
          }
        >
          <ArrowLeft size={21} />
        </button>
      ) : (
        <span className="brand-mark small" />
      )}
      <strong>{title}</strong>
      <span className="header-action">{action}</span>
    </header>
  );
}
export function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="主导航">
      {[
        ["/events", "赛事大厅", Trophy],
        ["/my-events", "我的赛事", Flag],
        ["/players", "球搭子们", Users],
        ["/me", "我的", UserRound],
      ].map(([url, label, Icon]) => {
        const I = Icon as typeof Trophy;
        return (
          <NavLink end key={url as string} to={url as string}>
            <I size={21} />
            <span>{label as string}</span>
          </NavLink>
        );
      })}
    </nav>
  );
}
export function ErrorNotice({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return message ? (
    <div className="error" role="alert">
      {message}
      {retry && (
        <button className="text-button" onClick={retry}>
          <RefreshCw size={15} />
          重新加载
        </button>
      )}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <span />
      正在连接球场…
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <i className="court-mini" />
      <h3>{title}</h3>
      {children}
    </div>
  );
}
export function Sheet({
  title,
  open,
  onClose,
  children,
}: {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (open) ref.current?.showModal();
    else ref.current?.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="sheet"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-content">
        <div className="sheet-handle" />
        <div className="row between">
          <h2>{title}</h2>
          <button className="text-button" onClick={onClose}>
            关闭
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function Confirm({
  title,
  description,
  onConfirm,
  onCancel,
  busy = false,
}: {
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  return (
    <Sheet open title={title} onClose={onCancel}>
      <p>{description}</p>
      <div className="row">
        <button className="secondary grow" onClick={onCancel}>
          取消
        </button>
        <button className="grow" disabled={busy} onClick={onConfirm}>
          {busy ? "处理中…" : "确认"}
        </button>
      </div>
    </Sheet>
  );
}
export function EventCard({
  event: e,
  manage = false,
}: {
  event: Event;
  manage?: boolean;
}) {
  return (
    <Link
      className="event-card"
      to={"/events/" + e.id + (manage ? "/manage" : "")}
    >
      <div className="event-card-stripe" />
      <div className="row between">
        <span className={"badge " + e.status}>{labels[e.status]}</span>
        <small>
          {e.level ? e.level + " · " : ""}
          {labels[e.match_type]}
        </small>
      </div>
      <h3>{e.name}</h3>
      <p className="muted">
        {labels[e.format]} ·{" "}
        {e.best_of === 1
          ? "一盘决胜"
          : e.best_of === 3
            ? "三盘两胜"
            : "五盘三胜"}
      </p>
      <div className="event-meta">
        <span>
          <CalendarDays size={14} />
          {e.event_date || "日期待定"} {e.event_time?.slice(0, 5)}
        </span>
        <span>
          <MapPin size={14} />
          {e.venue || "场地待定"}
        </span>
      </div>
      <div className="card-bottom">
        <span>
          <b>{e.confirmed_count ?? "—"}</b>
          <small>
            {" "}
            / {e.entry_limit || "不限"} {unit(e)}
          </small>
        </span>
        <span className="fee">{feeText(e)}</span>
      </div>
      {!!e.waitlist_count && (
        <small>
          候补 {e.waitlist_count}/2 {unit(e)}
        </small>
      )}
    </Link>
  );
}
