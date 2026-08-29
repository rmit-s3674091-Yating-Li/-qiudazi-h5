from pathlib import Path

p=Path('src/pages/ConnectionsPage.tsx')
s=p.read_text()
old='''    const url = `${window.location.origin}${window.location.pathname}#/connect/${profile.id}`;'''
new='''    const url = `${window.location.origin}${window.location.pathname}?connect=${encodeURIComponent(profile.id)}`;'''
if old not in s: raise SystemExit('connection share url pattern not found')
s=s.replace(old,new,1)
p.write_text(s)

p=Path('src/main.tsx')
s=p.read_text()
old='''        <Route path="/" element={<Navigate to="/events" replace />} />'''
new='''        <Route path="/" element={<HomeRedirect />} />'''
if old not in s: raise SystemExit('root route pattern not found')
s=s.replace(old,new,1)
marker='''function App() {'''
insert='''function HomeRedirect() {\n  const inviterId = new URLSearchParams(window.location.search).get("connect");\n  const validInvite = inviterId && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(inviterId);\n  return <Navigate to={validInvite ? `/connect/${inviterId}` : "/events"} replace />;\n}\n\n'''
if marker not in s: raise SystemExit('App marker not found')
s=s.replace(marker,insert+marker,1)
p.write_text(s)
