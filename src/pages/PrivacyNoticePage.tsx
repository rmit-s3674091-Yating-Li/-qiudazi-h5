import { Header } from "../components/UI";
import { useLanguage } from "../i18n";

export function PrivacyNoticePage(){
  const{language}=useLanguage();const en=language==="en";
  return <><Header title={en?"Usage & privacy notice":"使用与隐私说明"}/><main className="page">
    <span className="eyebrow">{en?"CONTROLLED TEST BUILD":"受控测试版"}</span>
    <h1>{en?"Usage & privacy notice":"使用与隐私说明（测试版）"}</h1>
    <p className="muted">{en?"Qiu Dazi is currently a controlled test build, not a public commercial service. This page explains how test data is used before you sign in or create a test profile.":"球搭子当前仍为受控测试版，并非正式对外运营服务。本页面用于在登录或创建测试档案前说明测试数据的基本使用方式。"}</p>
    <section className="settings-section"><h2>{en?"What we process":"我们会处理什么"}</h2><p>{en?"Depending on the features you use, test data may include your nickname, optional avatar, tennis profile, event registration and roster information, match scores and results, partner relationships and invitations, event photos or personal event-album copies, privacy preferences, and technical session identifiers needed to keep you signed in.":"根据你使用的功能，测试数据可能包括昵称、可选头像、打球档案、赛事报名与名单、比分和赛果、球搭子关系与邀请、赛事照片或个人参赛相册副本、隐私偏好，以及维持登录状态所需的技术会话标识。"}</p></section>
    <section className="settings-section"><h2>{en?"Why we use it":"为什么处理这些数据"}</h2><p>{en?"The data is used to provide test identity recovery, event creation and participation, scoring and results, partner features, photo features, and your saved privacy preferences.":"这些数据用于提供测试身份恢复、赛事创建与参与、记分与赛果、球搭子关系、照片功能以及保存你的隐私偏好。"}</p></section>
    <section className="settings-section"><h2>{en?"What other players may see":"其他用户可能看到什么"}</h2><p>{en?"Event rosters, scores and results may be visible according to the event's visibility and participation rules. Profile visibility settings control selected personal profile fields, but do not erase shared event facts such as rosters, scores or results. Personal event-album visibility is controlled separately.":"赛事名单、比分和赛果会按照赛事可见性与参与规则展示。个人档案可见性设置只控制相应档案字段，不会抹去共同赛事事实，例如赛事名单、比分或赛果；个人参赛相册的可见范围另行控制。"}</p></section>
    <section className="settings-section"><h2>{en?"Test environment":"测试环境说明"}</h2><p>{en?"The current build uses a shared online test environment. Please do not enter unnecessary real-world sensitive information. Formal operator information, a complete public privacy policy and a dedicated rights-request channel will be added before any public operation.":"当前版本使用共享在线测试环境。请不要填写与测试无关的真实敏感信息。正式对外运营前，将另行补充完整的运营者信息、正式隐私政策和个人权利请求渠道。"}</p></section>
    <p className="notice">{en?"You can return to the previous page without signing in.":"你可以直接返回上一页，无需先登录。"}</p>
  </main></>;
}
