from pathlib import Path
p=Path('src/pages/Basics.tsx')
s=p.read_text()
old='''        {mine && <EventInviteInboxLink />}\n        <div className="section-heading">\n          <h2>{mine ? "我的赛场" : "最近的比赛"}</h2>\n          <button\n            className="text-button"\n            onClick={q.refresh}\n            aria-label="刷新赛事"\n          >\n            <RefreshCw size={16} />\n          </button>\n        </div>'''
new='''        {mine && <EventInviteInboxLink />}\n        <div className="section-heading">\n          <h2>{mine ? "我的赛场" : "最近的比赛"}</h2>\n          <div className="row">\n            {mine && scope === "created" && (\n              <Link className="text-button" to="/events/new">\n                <Plus size={16} />\n                创建赛事\n              </Link>\n            )}\n            <button\n              className="text-button"\n              onClick={q.refresh}\n              aria-label="刷新赛事"\n            >\n              <RefreshCw size={16} />\n            </button>\n          </div>\n        </div>'''
if old not in s: raise SystemExit('section heading pattern not found')
s=s.replace(old,new,1)
p.write_text(s)
