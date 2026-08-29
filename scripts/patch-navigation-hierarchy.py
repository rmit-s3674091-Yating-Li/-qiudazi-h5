from pathlib import Path
p=Path('src/pages/Basics.tsx')
s=p.read_text()
old='''        action={\n          mine ? (\n            <Link\n              className="icon-button"\n              aria-label="创建赛事"\n              to="/events/new"\n            >\n              <Plus size={22} />\n            </Link>\n          ) : (\n            <button\n              className="icon-button"\n              aria-label="筛选赛事"\n              onClick={() => setFilter(true)}\n            >\n              <SlidersHorizontal size={20} />\n            </button>\n          )\n        }'''
new='''        action={\n          !mine ? (\n            <button\n              className="icon-button"\n              aria-label="筛选赛事"\n              onClick={() => setFilter(true)}\n            >\n              <SlidersHorizontal size={20} />\n            </button>\n          ) : undefined\n        }'''
if old not in s: raise SystemExit('header action pattern not found')
s=s.replace(old,new,1)
p.write_text(s)
