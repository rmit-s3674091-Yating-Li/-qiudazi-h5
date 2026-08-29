import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
export type Language="zh-CN"|"en";
const KEY="qiudazi-language";
const dictionaries={
  "zh-CN":{
    hall:"赛事大厅",myEvents:"我的赛事",partners:"球搭子们",me:"我的",settings:"设置与隐私",language:"语言",privacy:"隐私",profileVisibility:"个人档案字段可见性",invites:"邀请设置",save:"保存设置",saved:"设置已保存",avatar:"头像",level:"水平级别",city:"常打城市",playTimes:"约球时间",playPreference:"单双打偏好",eventInvites:"允许球搭子向我发送赛事邀请",doublesInvites:"允许球搭子向我发送双打组队邀请",visibleHint:"这些设置控制球搭子浏览你的个人档案时能看到什么，不会隐藏赛事名单、比分和赛果等共同赛事事实。",testPrivacy:"当前仍为受控测试版。正式对外运营前会另行补充完整隐私政策、运营者信息和个人权利请求渠道。",
    signup:"报名中",locked:"已锁定",ongoing:"进行中",finished:"已结束",singles:"单打",doubles:"双打",roundRobin:"单循环",knockout:"单淘汰",groupKnockout:"小组 + 淘汰",unlimited:"不限水平",privateEvent:"私有赛事",registrationEnded:"报名已结束",registrationClosed:"报名已截止",registrationClosing:"报名即将截止",registrationDeadline:"报名截止",organizer:"组织者",free:"免费"
  },
  en:{
    hall:"Events",myEvents:"My Events",partners:"Partners",me:"Me",settings:"Settings & Privacy",language:"Language",privacy:"Privacy",profileVisibility:"Profile field visibility",invites:"Invitation settings",save:"Save settings",saved:"Settings saved",avatar:"Avatar",level:"Playing level",city:"Playing city",playTimes:"Preferred times",playPreference:"Singles / doubles preference",eventInvites:"Allow tennis partners to send me event invitations",doublesInvites:"Allow tennis partners to send me doubles team invitations",visibleHint:"These controls affect what partners can browse on your personal profile. They do not hide shared event facts such as rosters, scores or results.",testPrivacy:"This is still a controlled test build. A full privacy policy, operator information and rights-request channel will be added before public operation.",
    signup:"Registration open",locked:"Roster locked",ongoing:"In progress",finished:"Finished",singles:"Singles",doubles:"Doubles",roundRobin:"Round robin",knockout:"Knockout",groupKnockout:"Groups + knockout",unlimited:"Any level",privateEvent:"Private event",registrationEnded:"Registration ended",registrationClosed:"Registration closed",registrationClosing:"Registration closing soon",registrationDeadline:"Registration deadline",organizer:"Organizer",free:"Free"
  }
} as const;
type Key=keyof typeof dictionaries["zh-CN"];
const Ctx=createContext<{language:Language;setLanguage:(l:Language)=>void;t:(k:Key)=>string}>({language:"zh-CN",setLanguage:()=>{},t:k=>dictionaries["zh-CN"][k]});
export function LanguageProvider({children}:{children:ReactNode}){const[language,setState]=useState<Language>(()=>localStorage.getItem(KEY)==="en"?"en":"zh-CN");const value=useMemo(()=>({language,setLanguage:(l:Language)=>{localStorage.setItem(KEY,l);setState(l);},t:(k:Key)=>dictionaries[language][k]}),[language]);return <Ctx.Provider value={value}>{children}</Ctx.Provider>;}
export function useLanguage(){return useContext(Ctx);}
