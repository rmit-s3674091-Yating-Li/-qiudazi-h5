// Retired compatibility probe kept only so older test clients receive a deterministic response.
Deno.serve(()=>new Response(JSON.stringify({ok:true,retired:true}),{headers:{"content-type":"application/json","cache-control":"no-store"}}));
