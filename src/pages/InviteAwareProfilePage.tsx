import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Camera, ShieldCheck } from "lucide-react";
import { Avatar, Brand, ErrorNotice, Header } from "../components/UI";
import { useAuth, safeNext } from "../hooks/Auth";
import { repository, explainError, uploadAsset, supabase } from "../repositories/supabase";
import { imageBlob } from "../utils/images";
import { useLanguage } from "../i18n";

export function InviteAwareProfilePage() {
  const auth = useAuth(), navigate = useNavigate(), [params] = useSearchParams();
  const {language}=useLanguage();const en=language==="en";
  const next = safeNext(params.get("next"));
  const claimInvite = next.startsWith("/claim-player/");
  const connectionInvite = next.startsWith("/connect/");
  const [name, setName] = useState(""), [file, setFile] = useState<File | null>(null), [preview, setPreview] = useState(""), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");

  useEffect(() => { if (!file) { setPreview(""); return; } const url = URL.createObjectURL(file); setPreview(url); return () => URL.revokeObjectURL(url); }, [file]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setError(en?"Please enter a nickname":"请填写昵称"); return; }
    setBusy(true); setError("");
    try {
      await auth.start();
      let avatar = null;
      if (file) {
        const blob = await imageBlob(file, 512);
        const { data } = await supabase!.auth.getSession();
        avatar = await uploadAsset(blob, "avatars", data.session!.user.id + "/" + crypto.randomUUID() + ".jpg");
      }
      await repository.completeProfile(name.trim(), avatar);
      await auth.refresh();
      navigate(next, { replace: true });
    } catch (e) { setError(explainError(e)); }
    finally { setBusy(false); }
  }

  const headerTitle = claimInvite || connectionInvite ? (en?"Join Qiu Dazi":"加入球搭子") : (en?"Create my tennis profile":"创建我的打球档案");
  const eyebrow = claimInvite ? (en?"YOUR TENNIS HISTORY":"你的打球历史") : connectionInvite ? (en?"LET'S PLAY TOGETHER":"一起打球") : (en?"MEET YOUR TENNIS SELF":"认识你的打球档案");
  const title = claimInvite ? (en?<>See your previous<br />match history</>:<>来球搭子看看你的<br />比赛记录吧</>) : connectionInvite ? (en?<>Tell us who you are,<br />then you can play together.</>:<>先认识一下你，<br />马上就能一起打球。</>) : (en?<>Every match starts<br />with knowing you.</>:<>每一场球，<br />都从认识你开始。</>);
  const description = claimInvite ? (en?"Tell us what to call you first. You will return to the history invitation and confirm whether the records are yours.":"先告诉我们怎么称呼你。完成后会回到刚才的历史记录，由你确认是不是自己的。") : connectionInvite ? (en?"Add a nickname first. You will return directly to your friend's invitation without another confirmation step.":"先留下昵称。完成后会直接回到朋友的邀请，不再增加额外确认步骤。") : (en?"Your nickname appears in registration, rosters, scores and shared results. The avatar is optional; no phone number, email or password is required.":"昵称用于报名、名单、比分与赛果分享。头像可跳过，不需要手机号、邮箱或密码。");
  const submitLabel = claimInvite ? (en?"Continue to history":"继续查看记录") : connectionInvite ? (en?"Continue to join":"继续加入球搭子") : (en?"Start playing":"开始打球");

  return <><Header title={headerTitle} home={false}/><main className="page profile-page"><Brand/><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p className="muted">{description}</p><form onSubmit={save}><label className="avatar-picker">{preview?<img src={preview} alt={en?"Avatar preview":"头像预览"}/>:<Avatar size={92}/>}<span><Camera size={17}/></span><input aria-label={en?"Choose avatar, optional":"选择头像，可选"} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e)=>setFile(e.target.files?.[0]||null)}/></label><p className="center muted small">{en?"Choose avatar · optional":"选择头像 · 可选"}</p>{file&&<button type="button" className="text-button center" onClick={()=>setFile(null)}>{en?"Skip avatar and use the default":"跳过头像，使用默认头像"}</button>}<label>{en?"Nickname *":"昵称 *"}<input autoComplete="nickname" value={name} onChange={(e)=>setName(e.target.value)} maxLength={40} placeholder={en?"What should we call you?":"怎么称呼你？"} required/></label><label className="check"><input type="checkbox" checked={consent} onChange={(e)=>setConsent(e.target.checked)} required/><span>{en?<>I understand that my nickname and match results appear on event pages, and I have read the <Link to="/privacy-notice">usage & privacy notice</Link>.</>:<>我了解昵称及比赛结果会在赛事页面展示，并已阅读<Link to="/privacy-notice">使用与隐私说明</Link>。</>}</span></label><ErrorNotice message={error||auth.error}/><button className="full" disabled={busy||!consent}>{busy?(en?"Creating…":"正在创建…"):submitLabel}<ArrowRight size={18}/></button></form><p className="identity-note"><ShieldCheck size={16}/>{en?"Controlled test build only: nicknames are used directly as test identities. Entering an existing nickname opens that test profile; do not use this for real identity verification.":"当前仅为受控测试版：昵称直接作为测试身份识别。输入已有昵称会进入对应测试档案，请不要用于真实身份验证。"}</p></main></>;
}
