import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Camera, ShieldCheck } from "lucide-react";
import { Avatar, Brand, ErrorNotice, Header } from "../components/UI";
import { useAuth, safeNext } from "../hooks/Auth";
import {
  repository,
  explainError,
  uploadAsset,
  supabase,
} from "../repositories/supabase";
import { imageBlob } from "../utils/images";

export function InviteAwareProfilePage() {
  const auth = useAuth(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const claimInvite = next.startsWith("/claim-player/");
  const connectionInvite = next.startsWith("/connect/");
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
      navigate(next, { replace: true });
    } catch (e) {
      setError(explainError(e));
    } finally {
      setBusy(false);
    }
  }

  const headerTitle = claimInvite || connectionInvite ? "加入球搭子" : "创建我的打球档案";
  const eyebrow = claimInvite
    ? "YOUR TENNIS HISTORY"
    : connectionInvite
      ? "LET'S PLAY TOGETHER"
      : "MEET YOUR TENNIS SELF";
  const title = claimInvite
    ? <>来球搭子看看你的<br />比赛记录吧</>
    : connectionInvite
      ? <>先认识一下你，<br />马上就能一起打球。</>
      : <>每一场球，<br />都从认识你开始。</>;
  const description = claimInvite
    ? "先告诉我们怎么称呼你。完成后会回到刚才的历史记录，由你确认是不是自己的。"
    : connectionInvite
      ? "先留下昵称。完成后会直接回到朋友的邀请，不再增加额外确认步骤。"
      : "昵称用于报名、名单、比分与赛果分享。头像可跳过，不需要手机号、邮箱或密码。";
  const submitLabel = claimInvite
    ? "继续查看记录"
    : connectionInvite
      ? "继续加入球搭子"
      : "开始打球";

  return (
    <>
      <Header title={headerTitle} />
      <main className="page profile-page">
        <Brand />
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
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
            {busy ? "正在创建…" : submitLabel}
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
