from pathlib import Path
p=Path('src/pages/Basics.tsx')
s=p.read_text()
old='''        {mine && <EventInviteInboxLink />}\n        <div className="section-heading">'''
new='''        <div className="section-heading">'''
if old not in s: raise SystemExit('top invite link pattern not found')
s=s.replace(old,new,1)
old2='''        {mine && (\n          <div className="chips">\n            <button\n              className={scope === "created" ? "active" : ""}\n              onClick={() => setScope("created")}\n            >\n              我创建的\n            </button>\n            <button\n              className={scope === "joined" ? "active" : ""}\n              onClick={() => setScope("joined")}\n            >\n              我参与的\n            </button>\n          </div>\n        )}\n        <div className="chips">'''
new2='''        {mine && (\n          <div className="chips">\n            <button\n              className={scope === "created" ? "active" : ""}\n              onClick={() => setScope("created")}\n            >\n              我创建的\n            </button>\n            <button\n              className={scope === "joined" ? "active" : ""}\n              onClick={() => setScope("joined")}\n            >\n              我参与的\n            </button>\n          </div>\n        )}\n        {mine && scope === "joined" && <EventInviteInboxLink />}\n        <div className="chips">'''
if old2 not in s: raise SystemExit('scope chips pattern not found')
s=s.replace(old2,new2,1)
p.write_text(s)
