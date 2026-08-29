import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  Plus,
  SlidersHorizontal,
  Camera,
  ShieldCheck,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import type { EventConfig, Player } from "../domain/types";
import { validateEvent } from "../domain/EventRules";
import {
  repository,
  explainError,
  uploadAsset,
  supabase,
} from "../repositories/supabase";
import { useAuth, safeNext } from "../hooks/Auth";
import { useQuery } from "../hooks/useQuery";
import {
  Header,
  Brand,
  Avatar,
  Sheet,
  ErrorNotice,
  Loading,
  Empty,
  EventCard,
  labels,
  Confirm,
} from "../components/UI";
import { imageBlob } from "../utils/images";
import { EventInviteInboxLink } from "../components/EventInviteUI";

export function Hall({ mine = false }: { mine?: boolean }) {
  const [scope, setScope] = useState("created");
  const [type, setType] = useState(""),
    [level, setLevel] = useState(""),
    [date, setDate] = useState(""),
    [status, setStatus] = useState(""),
    [filter, setFilter] = useState(false);
  const q = useQuery(
    "events" + JSON.stringify({ mine, scope, type, level, date, status }),
    () =>
      repository.events({
        mine,
        scope,
        match_type: type,
        level,
        event_date: date,
        status,
      }),
    15000,
  );
  return (
    <>
      <Header
        title={mine ? "我的赛事" : "球搭子"}
        back={false}
        action={
          mine ? (
            <Link
              className="icon-button"
              aria-label="创建赛事"
              to="/events/new"
            >
              <Plus size={22} />
            </Link>
          ) : (
            <button
              className="icon-button"
              aria-label="筛选赛事"
              onClick={() => setFilter(true)}
            >
              <SlidersHorizontal size={20} />
            </button>
          )
        }
      />
      <main className="page">
        {!mine && (
          <div className="hall-hero">
            <div className="court-lines" />
            <div>
              <span className="eyebrow">GAME. SET. CONNECT.</span>
              <h1>
                下一场球，
                <br />
                从这里开场。
              </h1>
              <p>和球搭子，一起认真打场好球。</p>
            </div>
          </div>
        )}
        {mine && <EventInviteInboxLink />}
        <div className="section-heading">
          <h2>{mine ? "我的赛场" : "最近的比赛"}</h2>
          <button
            className="text-button"
            onClick={q.refresh}
            aria-label="刷新赛事"
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {mine && (
          <div className="chips">
            <button
              className={scope === "created" ? "active" : ""}
              onClick={() => setScope("created")}
            >
              我创建的
            </button>
            <button
              className={scope === "joined" ? "active" : ""}
              onClick={() => setScope("joined")}
            >
              我参与的
            </button>
          </div>
        )}
        <div className="chips">
          {(mine
            ? [
                ["", "全部"],
                ["signup", "报名中"],
                ["locked", "已锁定"],
                ["ongoing", "进行中"],
                ["finished", "已结束"],
              ]
            : [
                ["", "全部"],
                ["singles", "单打"],
                ["doubles", "双打"],
              ]
          ).map(([value, label]) => (
            <button
              className={(mine ? status : type) === value ? "active" : ""}
              key={value}
              onClick={() => (mine ? setStatus(value) : setType(value))}
            >
              {label}
            </button>
          ))}
        </div>
        <ErrorNotice message={q.error} retry={q.refresh} />
        {q.loading && !q.data ? (
          <Loading />
        ) : q.data?.length ? (
          q.data.map((e) => (
            <EventCard
              event={e}
              key={e.id}
              manage={mine && scope === "created"}
            />
          ))
        ) : (
          !q.error && (
            <Empty title={mine ? "还没有创建赛事" : "最近还没有符合条件的比赛"}>
              <p>
                {mine
                  ? "召集搭子，开始一场自己的比赛。"
                  : "调整筛选，或发起一场新的比赛。"}
              </p>
              <Link className="button" to="/events/new">
                创建赛事
              </Link>
            </Empty>
          )
        )}
      </main>
      <Sheet open={filter} title="筛选赛事" onClose={() => setFilter(false)}>
        <label>
          赛事级别
          <select value={level} onChange={(e) => setLevel(e.target.value)}>
            <option value="">全部级别</option>
            {["2.0", "2.5", "3.0", "3.5", "4.0", "5.0"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          比赛日期
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className="row">
          <button
            className="secondary grow"
            onClick={() => {
              setLevel("");
              setDate("");
              setType("");
            }}
          >
            重置
          </button>
          <button className="grow" onClick={() => setFilter(false)}>
            查看赛事
          </button>
        </div>
      </Sheet>
    </>
  );
}
export function ProfilePage() {
  const auth = useAuth(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const [name, setName] = useState(""),
    [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!file) {
      setPreview("");
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setError("请填写昵称");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await auth.start();
      let avatar = null;
      if (file) {
        const blob = await imageBlob(file, 512);
        const { data } = await supabase!.auth.getSession();
        avatar = await uploadAsset(
          blob,
          "avatars",
          data.session!.user.id + "/" + crypto.randomUUID() + ".jpg",
        );
      }
      await repository.completeProfile(name.trim(), avatar);
      await auth.refresh();
      navigate(safeNext(params.get("next")), { replace: true });
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <Header title="创建我的打球档案" />
      <main className="page profile-page">
        <Brand />
        <span className="eyebrow">MEET YOUR TENNIS SELF</span>
        <h1>
          每一场球，
          <br />
          都从认识你开始。
        </h1>
        <p className="muted">
          昵称用于报名、名单、比分与赛果分享。头像可跳过，不需要手机号、邮箱或密码。
        </p>
        <form onSubmit={save}>
          <label className="avatar-picker">
            {preview ? (
              <img src={preview} alt="头像预览" />
            ) : (
              <Avatar size={92} />
            )}
            <span>
              <Camera size={17} />
            </span>
            <input
              aria-label="选择头像，可选"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
          </label>
          <p className="center muted small">选择头像 · 可选</p>
          {file && (
            <button
              type="button"
              className="text-button center"
              onClick={() => setFile(null)}
            >
              跳过头像，使用默认头像
            </button>
          )}
          <label>
            昵称 *
            <input
              autoComplete="nickname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="怎么称呼你？"
              required
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              required
            />
            <span>
              我了解昵称及比赛结果会在赛事页面展示，并已阅读
              <Link to="/privacy">使用与隐私说明</Link>。
            </span>
          </label>
          <ErrorNotice message={error || auth.error} />
          <button className="full" disabled={busy || !consent}>
            {busy ? "正在创建…" : "开始打球"}
            <ArrowRight size={18} />
          </button>
        </form>
        <p className="identity-note">
          <ShieldCheck size={16} />
          临时账号保存在当前浏览器。清除数据或换设备会建立新账号，原赛事管理权不会自动迁移。
        </p>
      </main>
    </>
  );
}
export function PlayersPage() {
  const q = useQuery("players", () => repository.players());
  return (
    <>
      <Header
        title="球搭子们"
        back={false}
        action={
          <Link
            to="/players/new"
            className="icon-button"
            aria-label="录入临时参赛者"
          >
            <Plus />
          </Link>
        }
      />
      <main className="page">
        <span className="eyebrow">YOUR TENNIS PEOPLE</span>
        <h1>球搭子们</h1>
        <ErrorNotice message={q.error} retry={q.refresh} />
        {q.loading && !q.data ? (
          <Loading />
        ) : (
          <>
            <h2>我的球搭子</h2>
            <Empty title="还没有建立球搭子关系">
              <p>
                之后可以通过球搭子码或邀请链接互相添加。临时参赛者不会显示在这里。
              </p>
            </Empty>
            <div className="section-heading">
              <h2>临时参赛者</h2>
              <Link to="/players/new" className="text-button">
                录入
              </Link>
            </div>
            {q.data
              ?.filter((p) => p.player_type === "manual")
              .map((p) => (
                <PlayerCard key={p.id} p={p} />
              ))}
            {!q.data?.some((p) => p.player_type === "manual") && (
              <Empty title="还没有临时参赛者">
                <p>代他人报名或组织赛事时，可以先录入姓名或昵称。</p>
                <Link className="button" to="/players/new">
                  录入临时参赛者
                </Link>
              </Empty>
            )}
          </>
        )}
      </main>
    </>
  );
}
function PlayerCard({ p }: { p: Player }) {
  return (
    <Link className="card row" to={"/players/" + p.id + "/edit"}>
      <Avatar path={p.avatar_url} name={p.name} />
      <strong className="grow">{p.name}</strong>
      <span className="badge">临时参赛者</span>
    </Link>
  );
}
export function PlayerForm() {
  const { id } = useParams(),
    navigate = useNavigate();
  const auth = useAuth();
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [name, setName] = useState(""),
    [player, setPlayer] = useState<Player | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (id)
      repository
        .players()
        .then((ps) => {
          const p = ps.find((p) => p.id === id);
          if (!p) throw new Error("参赛者不存在");
          setPlayer(p);
          setName(p.name);
        })
        .catch((e) => setError(explainError(e)));
  }, [id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      let avatar = player?.avatar_url || null;
      if (avatarFile) {
        const blob = await imageBlob(avatarFile, 512);
        const { data } = await supabase!.auth.getSession();
        avatar = await uploadAsset(
          blob,
          "avatars",
          data.session!.user.id + "/" + crypto.randomUUID() + ".jpg",
        );
      }
      await repository.savePlayer(id || null, name, avatar, player?.version);
      await auth.refresh();
      navigate("/players");
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    try {
      await repository.deletePlayer(id!);
      navigate("/players");
    } catch (e) {
      setError(explainError(e));
      setConfirm(false);
    }
  }
  return (
    <>
      <Header
        title={
          player?.player_type === "self"
            ? "我的打球档案"
            : id
              ? "编辑临时参赛者"
              : "录入临时参赛者"
        }
      />
      <main className="page">
        <h1>
          {player?.player_type === "self"
            ? "我的打球档案"
            : id
              ? "临时参赛者资料"
              : "录入临时参赛者"}
        </h1>
        <p className="muted">
          {player?.player_type === "self"
            ? "这是你在报名、名单和赛果中展示的参赛资料。"
            : "用于代他人报名或组织赛事。录入前请取得本人许可。"}
        </p>
        <form onSubmit={save}>
          <label>
            姓名 / 昵称 *
            <input
              required
              maxLength={40}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            头像（可选）
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => setAvatarFile(e.target.files?.[0] || null)}
            />
          </label>
          <ErrorNotice message={error} />
          <button className="full" disabled={busy}>
            保存资料
          </button>
        </form>
        {player?.player_type === "manual" && (
          <button className="danger full" onClick={() => setConfirm(true)}>
            删除临时参赛者
          </button>
        )}
        {player?.player_type === "self" && (
          <p className="muted small">我的打球档案不可删除。</p>
        )}
      </main>
      {confirm && (
        <Confirm
          title="删除临时参赛者？"
          description="仅未参与过赛事的临时参赛者可以删除。"
          onConfirm={remove}
          onCancel={() => setConfirm(false)}
        />
      )}
    </>
  );
}
export function MePage() {
  const { profile } = useAuth();
  return (
    <>
      <Header title="我的" back={false} />
      <main className="page">
        <div className="profile-banner">
          <Avatar
            path={profile?.avatar_url}
            name={profile?.nickname || ""}
            size={64}
          />
          <div>
            <span className="eyebrow">OFF THE COURT</span>
            <h1>{profile?.nickname}</h1>
            <p>每一场球，都值得认真对待。</p>
          </div>
        </div>
        <div className="card row between">
          <span>我的打球档案</span>
          <span className="badge">已创建</span>
        </div>
        <Link className="card row between" to="/my-events">
          我的战绩 <ArrowRight size={18} />
        </Link>
        <div className="card row between" aria-disabled="true">
          <span>我的球搭子码</span>
          <span className="badge">即将开放</span>
        </div>
        <Link className="card row between" to="/privacy">
          设置与隐私 <ArrowRight size={18} />
        </Link>
        <div className="notice">
          <ShieldCheck size={20} />
          <p>
            当前使用临时账号。请保留这个浏览器的登录数据；换手机、无痕模式或清除网站数据，会产生新账号。
          </p>
        </div>
      </main>
    </>
  );
}
export function PrivacyPage() {
  return (
    <>
      <Header title="使用与隐私说明" />
      <main className="page prose">
        <h1>一起打球，也尊重彼此</h1>
        <p>
          这是球搭子在线测试版。临时账号用于识别报名与管理权限；昵称、可选头像用于参赛者识别。赛事名单、比分、排名和合影会向能打开赛事的人展示。
        </p>
        <p>
          公开赛事出现在大厅；仅链接赛事不会在大厅列出，但持有赛事URL的人可以查看。URL不赋予管理权。
        </p>
        <p>
          数据保存在配置的Supabase项目，不是只保存在本机。清除浏览器登录数据会失去当前临时账号的访问能力，但不会自动删除已经提交的赛事记录。
        </p>
        <p>
          录入临时参赛者、上传含他人影像的合影前，请取得相关人员许可。费用只展示，不在本产品内支付。
        </p>
        <div className="notice">
          正式对外运营前，项目运营者必须补充名称、联系渠道、保存期限及权利请求处理方式。当前仅限受邀测试。
        </div>
      </main>
    </>
  );
}
const initial: EventConfig = {
  name: "",
  visibility: "public",
  link_signup_enabled: false,
  match_type: "singles",
  format: "round_robin",
  best_of: 1,
  scoring_type: "games_6",
  custom_games_target: null,
  tiebreak_trigger: 6,
  level: null,
  entry_limit: 8,
  event_date: null,
  event_time: null,
  venue: null,
  fee_type: "free",
  venue_fee_total: null,
  ball_fee_total: null,
  other_fee_total: null,
  fixed_fee_per_entry: null,
  group_count: 2,
  qualifiers_per_group: 2,
};
export function EventForm() {
  const { id } = useParams(),
    navigate = useNavigate();
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [form, setForm] = useState<EventConfig>(initial),
    [version, setVersion] = useState<number>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [section, setSection] = useState(0);
  useEffect(() => {
    if (id)
      repository
        .event(id)
        .then((s) => {
          const c = { ...initial };
          Object.keys(c).forEach((k) => ((c as any)[k] = (s.event as any)[k]));
          setForm(c);
          setVersion(s.event.version);
        })
        .catch((e) => setError(explainError(e)));
  }, [id]);
  function set(k: keyof EventConfig, v: unknown) {
    setForm((f) => ({
      ...f,
      [k]: v,
      ...(k === "scoring_type"
        ? { tiebreak_trigger: v === "games_4" ? 4 : v === "games_6" ? 6 : null }
        : {}),
    }));
  }
  function field(
    k: keyof EventConfig,
    label: string,
    type = "text",
    options?: [string, string][],
  ) {
    return (
      <label key={k}>
        {label}
        {options ? (
          <select
            value={String(form[k] ?? "")}
            onChange={(e) =>
              set(
                k,
                k === "best_of"
                  ? Number(e.target.value)
                  : e.target.value || null,
              )
            }
          >
            {options.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <input
            type={type}
            value={String(form[k] ?? "")}
            onChange={(e) =>
              set(
                k,
                type === "number"
                  ? e.target.value === ""
                    ? null
                    : Number(e.target.value)
                  : e.target.value || null,
              )
            }
            step={type === "number" ? "any" : undefined}
            maxLength={k === "name" ? 80 : 120}
          />
        )}
      </label>
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const config = validateEvent({ ...form, name: form.name || "" });
      const result = await repository.saveEvent(id || null, config, version);
      navigate("/events/" + result.id + "/manage", { replace: true });
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }
  const sections = [
    {
      title: "赛事基础",
      body: (
        <>
          {field("name", "赛事名称 *")}
          {field("visibility", "谁可以看到", "text", [
            ["public", "公开赛事"],
            ["link_only", "仅链接可见"],
          ])}
          {field("match_type", "比赛类型", "text", [
            ["singles", "单打"],
            ["doubles", "双打"],
          ])}
          {field("format", "赛制", "text", [
            ["round_robin", "单循环"],
            ["knockout", "单淘汰"],
            ["group_knockout", "小组 + 淘汰"],
          ])}
          {form.visibility === "link_only" && (
            <label className="check">
              <input
                type="checkbox"
                checked={form.link_signup_enabled}
                onChange={(e) => set("link_signup_enabled", e.target.checked)}
              />
              允许通过分享入口自主报名
            </label>
          )}
        </>
      ),
    },
    {
      title: "比赛规则",
      body: (
        <>
          {field("best_of", "盘数", "text", [
            ["1", "一盘决胜"],
            ["3", "三盘两胜"],
            ["5", "五盘三胜"],
          ])}
          {field(
            "scoring_type",
            "每盘计分",
            "text",
            Object.entries(labels).filter(([k]) =>
              [
                "games_4",
                "games_6",
                "tiebreak_7",
                "points_11",
                "points_15",
                "custom_games",
              ].includes(k),
            ),
          )}
          {["games_4", "games_6"].includes(form.scoring_type) && (
            <label>
              抢七触发
              <select
                value={form.tiebreak_trigger || ""}
                onChange={(e) =>
                  set("tiebreak_trigger", Number(e.target.value))
                }
              >
                {(form.scoring_type === "games_4" ? [3, 4] : [5, 6]).map(
                  (n) => (
                    <option value={n} key={n}>
                      {n}:{n} 后抢七
                    </option>
                  ),
                )}
              </select>
            </label>
          )}
          {form.scoring_type === "custom_games" &&
            field("custom_games_target", "目标局数 ≥1", "number")}
          <p className="muted small">传统占先制。抢七和连续抢分均需领先2分。</p>
          {form.format === "group_knockout" && (
            <>
              {field("group_count", "小组数量", "number")}
              {field("qualifiers_per_group", "每组晋级名额", "number")}
            </>
          )}
        </>
      ),
    },
    {
      title: "时间与场地",
      body: (
        <>
          {field("level", "赛事级别（可选）", "text", [
            ["", "不限定"],
            ...["2.0", "2.5", "3.0", "3.5", "4.0", "5.0"].map(
              (x) => [x, x] as [string, string],
            ),
          ])}
          {field(
            "entry_limit",
            "名额上限（" + (form.match_type === "doubles" ? "队" : "人") + "）",
            "number",
          )}
          {field("event_date", "比赛日期（可选）", "date")}
          {field("event_time", "比赛时间（可选）", "time")}
          {field("venue", "比赛场地（可选）")}
        </>
      ),
    },
    {
      title: "费用说明",
      body: (
        <>
          {field("fee_type", "费用类型", "text", [
            ["free", "免费"],
            ["aa", "AA制"],
            ["fixed", "固定费用"],
          ])}
          {form.fee_type === "aa" && (
            <>
              {field("venue_fee_total", "场地总费用（元）", "number")}
              {field("ball_fee_total", "用球总费用（元）", "number")}
              {field("other_fee_total", "其他总费用（元）", "number")}
              <div className="notice">
                预计总费用 ¥
                {(form.venue_fee_total || 0) +
                  (form.ball_fee_total || 0) +
                  (form.other_fee_total || 0)}
                <br />
                按实际正式参赛{form.match_type === "doubles" ? "队伍" : "人数"}
                均摊。
              </div>
            </>
          )}
          {form.fee_type === "fixed" &&
            field(
              "fixed_fee_per_entry",
              "每" +
                (form.match_type === "doubles" ? "队" : "人") +
                "费用（元）",
              "number",
            )}
          <p className="muted small">费用仅展示，不提供在线支付和退款。</p>
        </>
      ),
    },
  ];
  return (
    <>
      <Header title={id ? "编辑赛事" : "创建赛事"} />
      <main className="page has-action">
        <span className="eyebrow">YOUR NEXT MATCH</span>
        <h1>{id ? "调整比赛安排" : "发起一场好球"}</h1>
        <p className="muted">先集结球搭子，再锁定名单生成对阵。</p>
        <form onSubmit={save}>
          {sections.map((s, i) => (
            <section className="form-section" key={s.title}>
              <button
                type="button"
                className="section-toggle"
                onClick={() => setSection(i)}
              >
                <span className="section-number">0{i + 1}</span>
                <strong>{s.title}</strong>
                <span>{section === i ? "−" : "＋"}</span>
              </button>
              {section === i && (
                <div className="section-body">
                  {s.body}
                  {i < 3 && (
                    <button
                      type="button"
                      className="secondary full"
                      onClick={() => setSection(i + 1)}
                    >
                      继续设置
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
          <ErrorNotice message={error} />
          {id && (
            <button
              type="button"
              className="danger full"
              disabled={busy}
              onClick={() => setDeleteConfirm(true)}
            >
              删除空赛事
            </button>
          )}
          <div className="action-bar">
            <button className="full" disabled={busy}>
              {busy ? "保存中…" : id ? "保存修改" : "创建赛事"}
            </button>
          </div>
        </form>
      </main>
      {deleteConfirm && (
        <Confirm
          title="删除这场赛事？"
          description="仅报名中且没有任何报名历史的空赛事可删除，已有报名记录的赛事将被保护。"
          busy={busy}
          onCancel={() => setDeleteConfirm(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await repository.deleteEvent(id!, version!);
              navigate("/my-events");
            } catch (e) {
              setError(explainError(e));
              setDeleteConfirm(false);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </>
  );
}
