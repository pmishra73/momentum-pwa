// ─── Momentum PWA — app.js ────────────────────────────────────────────────────
// React 18 via UMD globals
const { useState, useEffect, useCallback, useRef, memo } = React;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
// All users get full cloud features for free
const CATEGORIES  = ["Health","Work","Learning","Mindfulness","Finance","Social","Other"];
const CAT_COLORS  = { Health:"#e07a5f",Work:"#3d405b",Learning:"#81b29a",Mindfulness:"#f2cc8f",Finance:"#a8c5da",Social:"#c9ada7",Other:"#b5b5a9" };
const DAYS        = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const FULL_DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const SCHED_OPTS  = ["Daily","Weekdays","Weekends","Custom"];
const PERIOD_LABELS = { weekly:"Weekly",fortnightly:"Fortnightly",monthly:"Monthly",quarterly:"Quarterly",halfyearly:"Half-yearly",yearly:"Yearly" };
const ADMIN_EMAILS  = ["mishraprasant73@gmail.com"];
const isAdmin       = email => ADMIN_EMAILS.includes((email||"").toLowerCase());

// ─── THEMES ───────────────────────────────────────────────────────────────────
const THEMES = {
  light:    {label:"Light",      emoji:"☀️",  bg:"#faf7f2",card:"#ffffff",border:"#ede8e0",sand:"#e8d9c4",ink:"#3d3530",muted:"#9e8e80",accent:"#c4622d",accentLight:"#f5ede0"},
  dark:     {label:"Dark",       emoji:"🌙",  bg:"#141414",card:"#1e1e1e",border:"#2a2a2a",sand:"#333333",ink:"#f0ebe5",muted:"#888080",accent:"#e07a5f",accentLight:"#2a1814"},
  blue:     {label:"Light Blue", emoji:"🫧",  bg:"#f0f5ff",card:"#ffffff",border:"#d5e0f5",sand:"#c5d3f0",ink:"#1a2a4a",muted:"#5a6a8a",accent:"#3b6fd4",accentLight:"#e5ecff"},
  forest:   {label:"Forest",     emoji:"🌿",  bg:"#f0f7f2",card:"#ffffff",border:"#d0e5d0",sand:"#b5d5b8",ink:"#1a3020",muted:"#5a7a5a",accent:"#2d7a4a",accentLight:"#e0f5e8"},
  lavender: {label:"Lavender",   emoji:"💜",  bg:"#f5f0ff",card:"#ffffff",border:"#ddd0f5",sand:"#c8b8ee",ink:"#2a1a4a",muted:"#7a6a9a",accent:"#7c4fd4",accentLight:"#ede5ff"},
  sunset:   {label:"Sunset",     emoji:"🌅",  bg:"#fff5f0",card:"#ffffff",border:"#f5d5c8",sand:"#f0c0a8",ink:"#3a1a14",muted:"#8a5a50",accent:"#d4504a",accentLight:"#ffe8e5"},
};
function applyTheme(name) {
  const t=THEMES[name]||THEMES.light;
  const s=document.documentElement.style;
  s.setProperty('--bg',          t.bg);
  s.setProperty('--card',        t.card);
  s.setProperty('--border',      t.border);
  s.setProperty('--sand',        t.sand);
  s.setProperty('--ink',         t.ink);
  s.setProperty('--muted',       t.muted);
  s.setProperty('--accent',      t.accent);
  s.setProperty('--accent-light',t.accentLight);
}
applyTheme(localStorage.getItem('mo:theme')||'light');

// ─── STORAGE LAYER ────────────────────────────────────────────────────────────
const idb = (() => {
  let db = null;
  const open = () => new Promise((res,rej) => {
    if (db) return res(db);
    const req = indexedDB.open('momentum-local', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore("kv",{keyPath:"k"});
    req.onsuccess = e => { db=e.target.result; res(db); };
    req.onerror   = () => rej(req.error);
  });
  return {
    async get(k)   { const d=await open(); return new Promise(r=>{ const q=d.transaction("kv").objectStore("kv").get(k); q.onsuccess=()=>r(q.result?.v??null); q.onerror=()=>r(null); }); },
    async set(k,v) { const d=await open(); return new Promise(r=>{ const q=d.transaction("kv","readwrite").objectStore("kv").put({k,v}); q.onsuccess=()=>r(); q.onerror=()=>r(); }); },
    async del(k)   { const d=await open(); return new Promise(r=>{ const q=d.transaction("kv","readwrite").objectStore("kv").delete(k); q.onsuccess=()=>r(); q.onerror=()=>r(); }); },
  };
})();

// ─── localStorage fallback (when Firebase not configured) ─────────────────────
const ls = {
  get: k => { try { const v=localStorage.getItem(k); return Promise.resolve(v?JSON.parse(v):null); } catch { return Promise.resolve(null); } },
  set: (k,v) => { try { localStorage.setItem(k,JSON.stringify(v)); } catch {} return Promise.resolve(); },
  del: k => { try { localStorage.removeItem(k); } catch {} return Promise.resolve(); },
};

// ─── Firestore helpers ─────────────────────────────────────────────────────────
const fsGet    = async (col,id) => { try { const s=await window.__fb.db.collection(col).doc(id).get(); return s.exists?s.data():null; } catch { return null; } };
const fsSet    = async (col,id,data,merge=true) => { try { await window.__fb.db.collection(col).doc(id).set(data,{merge}); return true; } catch(e) { console.error('[FB] write failed:',e); return false; } };
const fsGetAll = async (col) => { try { const s=await window.__fb.db.collection(col).get(); const r={}; s.forEach(d=>{r[d.id]=d.data();}); return r; } catch { return {}; } };

// ─── User habit data ─────────────────────────────────────────────────────────
// Always Firestore + local cache (all users get cloud sync)
const loadUD = async (uid) => {
  if (window.__fb) {
    const d = await fsGet('userdata',uid);
    if (d) { ls.set(`mo:ud:${uid}`,d); return d; }
  }
  return ls.get(`mo:ud:${uid}`);
};
const saveUD = async (uid,d) => {
  await ls.set(`mo:ud:${uid}`,d);
  if (window.__fb) fsSet('userdata',uid,d,false).catch(e=>console.warn('[FB] sync failed:',e));
};

// ─── Auth ──────────────────────────────────────────────────────────────────────
// When Firebase is configured, session is managed by Firebase Auth (onAuthStateChanged).
// loadAuth() is only used as a fallback path when Firebase is not available.
const loadAuth  = () => window.__fb ? Promise.resolve(null) : ls.get('mo:auth');
const saveAuth  = async a => {
  if (window.__fb) {
    const {uid,...p}=a; const {password:_,...safe}=p;
    await ls.set(`mo:prof:${uid}`,safe); // always save locally
    fsSet('users',uid,safe).catch(e=>console.warn('[FB] profile sync failed:',e));
    return;
  }
  return ls.set('mo:auth',a);
};
const clearAuth = async () => {
  if (window.__fb) { await window.__fb.auth.signOut(); return; }
  return ls.del('mo:auth');
};

// ─── User registry (admin panel) ──────────────────────────────────────────────
const loadUsers = async () => {
  if (window.__fb) {
    const all=await fsGetAll('users');
    const byEmail={};
    Object.entries(all).forEach(([uid,p])=>{ byEmail[p.email]={uid,...p}; });
    return byEmail;
  }
  return ls.get('mo:users').then(u=>u||{});
};
const saveUsers = async u => {
  if (window.__fb) {
    await Promise.all(Object.values(u).map(async user=>{
      if (!user.uid) return;
      const {password:_,...safe}=user;
      await fsSet('users',user.uid,safe);
    }));
    return;
  }
  return ls.set('mo:users',u);
};

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const todayStr = () => new Date().toISOString().split("T")[0];
const dateStr  = d  => d.toISOString().split("T")[0];

function habitOn(h, iso) {
  const d=new Date(iso+"T00:00:00"), dow=d.getDay();
  if (h.endDate&&iso>h.endDate) return false;
  if (iso<h.startDate) return false;
  if (h.schedule==="Daily")    return true;
  if (h.schedule==="Weekdays") return dow>=1&&dow<=5;
  if (h.schedule==="Weekends") return dow===0||dow===6;
  if (h.schedule==="Custom")   return h.customDays.includes(dow);
  return false;
}
function weekDates(off=0) {
  const n=new Date(), m=new Date(n);
  m.setDate(n.getDate()-n.getDay()+1+off*7);
  return Array.from({length:7},(_,i)=>{ const d=new Date(m); d.setDate(m.getDate()+i); return dateStr(d); });
}
function compRate(h,logs,dates) {
  const a=dates.filter(d=>habitOn(h,d)); if(!a.length) return null;
  return Math.round(a.filter(d=>logs[h.id]?.dates?.[d]?.done).length/a.length*100);
}
function streak(h,logs) {
  let s=0; const d=new Date();
  while(true){
    const ds=dateStr(d);
    if(!habitOn(h,ds)){d.setDate(d.getDate()-1);if(s>0)break;if(d<new Date(h.startDate))break;continue;}
    if(logs[h.id]?.dates?.[ds]?.done){s++;d.setDate(d.getDate()-1);}
    else break;
    if(d<new Date(h.startDate))break;
  }
  return s;
}
function reportDates(period) {
  const n=new Date(),end=dateStr(n),s=new Date(n);
  if(period==="weekly") s.setDate(n.getDate()-6);
  else if(period==="fortnightly") s.setDate(n.getDate()-13);
  else if(period==="monthly")   s.setMonth(n.getMonth()-1);
  else if(period==="quarterly") s.setMonth(n.getMonth()-3);
  else if(period==="halfyearly")s.setMonth(n.getMonth()-6);
  else s.setFullYear(n.getFullYear()-1);
  const dates=[],c=new Date(s);
  while(dateStr(c)<=end){dates.push(dateStr(c));c.setDate(c.getDate()+1);}
  return dates;
}

// ─── TINY ATOMS ───────────────────────────────────────────────────────────────
const Ring = ({pct,color,size=44}) => {
  if(pct===null) return null;
  const r=(size-6)/2, circ=2*Math.PI*r, dash=(pct/100)*circ;
  return React.createElement('svg',{width:size,height:size,style:{flexShrink:0}},
    React.createElement('circle',{cx:size/2,cy:size/2,r,fill:"none",stroke:"#f0ebe3",strokeWidth:5}),
    React.createElement('circle',{cx:size/2,cy:size/2,r,fill:"none",stroke:color,strokeWidth:5,strokeDasharray:`${dash} ${circ}`,strokeLinecap:"round",transform:`rotate(-90 ${size/2} ${size/2})`}),
    React.createElement('text',{x:size/2,y:size/2+4,textAnchor:"middle",fontSize:"10",fill:"var(--ink)",fontFamily:"'Lora',serif",fontWeight:"600"},`${pct}%`)
  );
};


// ─── MODALS ───────────────────────────────────────────────────────────────────
function ModalWrap({children,onClose}) {
  return React.createElement('div',{
    style:{position:"fixed",inset:0,background:"rgba(61,53,48,.42)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,backdropFilter:"blur(3px)"},
    onClick:e=>e.target===e.currentTarget&&onClose()
  },
    React.createElement('div',{style:{background:"var(--card)",borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"90vh",overflowY:"auto",paddingBottom:"calc(16px + env(safe-area-inset-bottom))"}},
      children
    )
  );
}

function NoteModal({habitId,date,habitName,existing,onClose,onSave}) {
  const [note,setNote]=useState(existing||"");
  return React.createElement(ModalWrap,{onClose},
    React.createElement('div',{style:{padding:"20px 20px 8px"}},
      React.createElement('div',{style:{width:36,height:4,background:"#e8d9c4",borderRadius:2,margin:"0 auto 16px"}}),
      React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:17,fontWeight:700,marginBottom:2}},"Daily Note"),
      React.createElement('div',{style:{fontSize:12,color:"var(--muted)",marginBottom:14}},`${habitName} · ${date}`),
      React.createElement('textarea',{style:{width:"100%",padding:"11px 14px",border:"1.5px solid var(--border)",borderRadius:12,fontSize:14,outline:"none",background:"var(--bg)",color:"var(--ink)",resize:"none",lineHeight:1.6,minHeight:90,fontFamily:"'DM Sans',sans-serif"},placeholder:"How did it go? Any notes…",value:note,onChange:e=>setNote(e.target.value)}),
      React.createElement('div',{style:{display:"flex",gap:8,marginTop:12}},
        existing&&React.createElement('button',{onClick:()=>onSave(""),style:{padding:"11px 16px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent)",fontSize:13,fontWeight:500,border:"none",cursor:"pointer"}},"Clear"),
        React.createElement('button',{onClick:onClose,style:{flex:1,padding:"11px",borderRadius:12,background:"var(--accent-light)",fontSize:14,fontWeight:500,border:"none",cursor:"pointer"}},"Cancel"),
        React.createElement('button',{onClick:()=>onSave(note),style:{flex:1,padding:"11px",borderRadius:12,background:"var(--ink)",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer"}},"Save")
      )
    )
  );
}

// Defined outside HabitModal so their references are stable across renders
// (inline definitions cause React to remount children, losing input focus)
const ModalRow=({label,children})=>React.createElement('div',{style:{marginBottom:16}},
  React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:6}},label),
  children
);
const ModalPills=({items,active,onPick,colorFn})=>React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:6}},
  items.map(i=>React.createElement('button',{key:i,onClick:()=>onPick(i),style:{padding:"7px 13px",borderRadius:20,fontSize:13,border:`1.5px solid ${active===i?(colorFn?colorFn(i):"var(--ink)"):"var(--border)"}`,background:active===i?(colorFn?colorFn(i):"var(--ink)"):"var(--card)",color:active===i?"var(--bg)":(colorFn?colorFn(i):"var(--ink)"),fontWeight:active===i?600:400,transition:"all .15s",fontFamily:"inherit",cursor:"pointer"}},i))
);
const ModalMultiPills=({items,active,onToggle})=>React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:6}},
  items.map((item,i)=>React.createElement('button',{key:i,onClick:()=>onToggle(i),style:{padding:"7px 13px",borderRadius:20,fontSize:13,border:"1.5px solid var(--border)",background:active.includes(i)?"var(--ink)":"var(--card)",color:active.includes(i)?"var(--bg)":"var(--ink)",fontFamily:"inherit",cursor:"pointer"}},item.slice(0,3)))
);

function HabitModal({existing,onClose,onSave}) {
  const [name,setName]=useState(existing?.name||"");
  const [cat,setCat]=useState(existing?.category||"Health");
  const [sched,setSched]=useState(existing?.schedule||"Daily");
  const [cdays,setCdays]=useState(existing?.customDays||[]);
  const [endDate,setEnd]=useState(existing?.endDate||"");
  const [hasEnd,setHasEnd]=useState(!!existing?.endDate);
  const tog=d=>setCdays(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d].sort());
  const save=()=>{
    if(!name.trim()) return;
    onSave({id:existing?.id||`h_${Date.now()}`,name:name.trim(),category:cat,schedule:sched,customDays:sched==="Custom"?cdays:[],startDate:existing?.startDate||todayStr(),endDate:hasEnd?endDate:"",paused:existing?.paused||false});
  };

  return React.createElement(ModalWrap,{onClose},
    React.createElement('div',{style:{padding:"20px 20px 8px"}},
      React.createElement('div',{style:{width:36,height:4,background:"#e8d9c4",borderRadius:2,margin:"0 auto 16px"}}),
      React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:19,fontWeight:700,marginBottom:16}},existing?"Edit Habit":"New Habit"),
      React.createElement(ModalRow,{label:"Name"},
        React.createElement('input',{style:{width:"100%",padding:"11px 14px",border:"1.5px solid var(--border)",borderRadius:12,fontSize:14,outline:"none",background:"var(--bg)",color:"var(--ink)",fontFamily:"inherit"},placeholder:"e.g. Morning run…",value:name,onChange:e=>setName(e.target.value)})
      ),
      React.createElement(ModalRow,{label:"Category"},
        React.createElement(ModalPills,{items:CATEGORIES,active:cat,onPick:setCat,colorFn:c=>CAT_COLORS[c]})
      ),
      React.createElement(ModalRow,{label:"Schedule"},
        React.createElement(ModalPills,{items:SCHED_OPTS,active:sched,onPick:setSched})
      ),
      sched==="Custom"&&React.createElement(ModalRow,{label:"Days"},
        React.createElement(ModalMultiPills,{items:FULL_DAYS,active:cdays,onToggle:tog})
      ),
      React.createElement(ModalRow,{label:"Track Until"},
        React.createElement('div',{style:{display:"flex",gap:6,marginBottom:8}},
          ["Indefinitely","Until a date"].map((l,i)=>React.createElement('button',{key:l,onClick:()=>setHasEnd(i===1),style:{padding:"7px 13px",borderRadius:20,fontSize:13,border:"1.5px solid var(--border)",background:hasEnd===(i===1)?"var(--ink)":"var(--card)",color:hasEnd===(i===1)?"var(--bg)":"var(--ink)",fontFamily:"inherit",cursor:"pointer"}},l))
        ),
        hasEnd&&React.createElement('input',{type:"date",style:{width:"100%",padding:"11px 14px",border:"1.5px solid #e8d9c4",borderRadius:12,fontSize:14,outline:"none",background:"var(--bg)",fontFamily:"inherit"},value:endDate,min:todayStr(),onChange:e=>setEnd(e.target.value)})
      ),
      React.createElement('div',{style:{display:"flex",gap:8,marginTop:4,paddingBottom:8}},
        React.createElement('button',{onClick:onClose,style:{flex:1,padding:"13px",borderRadius:12,background:"var(--accent-light)",fontSize:14,fontWeight:500,border:"none",cursor:"pointer"}},"Cancel"),
        React.createElement('button',{onClick:save,style:{flex:2,padding:"13px",borderRadius:12,background:"var(--accent)",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer",opacity:name.trim()?1:.45}},existing?"Save Changes":"Add Habit")
      )
    )
  );
}

// ─── INSTALL PROMPT BANNER ────────────────────────────────────────────────────
function InstallBanner({onInstall,onDismiss}) {
  return React.createElement('div',{style:{background:"linear-gradient(135deg,#fff5ee,#fde8d8)",border:"1px solid #f5cba7",borderRadius:14,padding:"12px 16px",display:"flex",alignItems:"center",gap:12,margin:"0 0 12px"}},
    React.createElement('div',{style:{fontSize:28}},"◆"),
    React.createElement('div',{style:{flex:1}},
      React.createElement('div',{style:{fontSize:13,fontWeight:700,color:"var(--ink)"}},"Install Momentum"),
      React.createElement('div',{style:{fontSize:11,color:"var(--muted)"}},"Add to home screen for the best experience")
    ),
    React.createElement('button',{onClick:onInstall,style:{padding:"8px 14px",borderRadius:10,background:"var(--accent)",color:"white",fontSize:12,fontWeight:700,border:"none",cursor:"pointer"}},"Install"),
    React.createElement('button',{onClick:onDismiss,style:{fontSize:16,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",lineHeight:1}},"×")
  );
}

// ─── OFFLINE BANNER ───────────────────────────────────────────────────────────
function OfflineBanner() {
  return React.createElement('div',{style:{background:"var(--ink)",color:"white",textAlign:"center",padding:"8px 16px",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:8}},
    React.createElement('span',null,"📡"),
    "You're offline — data saves locally until reconnected"
  );
}

// ─── UPDATE BANNER ────────────────────────────────────────────────────────────
function UpdateBanner({onUpdate}) {
  return React.createElement('div',{style:{background:"#81b29a",color:"white",textAlign:"center",padding:"8px 16px",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:10}},
    "✨ New version available!",
    React.createElement('button',{onClick:onUpdate,style:{background:"var(--card)",color:"#3a8c5c",padding:"3px 12px",borderRadius:8,fontSize:11,fontWeight:700,border:"none",cursor:"pointer"}},"Update")
  );
}

// ─── NOTIFICATION SETTINGS ────────────────────────────────────────────────────
function NotificationSettings({onClose}) {
  const [status,setStatus]=useState("checking");
  const [reminderHour,setHour]=useState(9);
  const [saved,setSaved]=useState(false);

  useEffect(()=>{
    if(window.MomentumPWA) window.MomentumPWA.getPushStatus().then(setStatus);
    else setStatus("unsupported");
  },[]);

  const enable=async()=>{
    const result=await window.MomentumPWA?.subscribeToPush();
    if(result) { setStatus("subscribed"); window.MomentumPWA.scheduleLocalReminder(reminderHour); }
    else setStatus(Notification.permission);
  };
  const disable=async()=>{ await window.MomentumPWA?.unsubscribeFromPush(); setStatus("granted-not-subscribed"); };
  const saveReminder=()=>{ window.MomentumPWA?.scheduleLocalReminder(reminderHour); setSaved(true); setTimeout(()=>setSaved(false),2000); };

  const statusLabel={
    subscribed:"✅ Enabled",
    denied:"🚫 Blocked in browser settings",
    unsupported:"❌ Not supported on this device",
    "granted-not-subscribed":"⚪ Enabled but not subscribed",
    "no-sw":"⏳ Loading…",
    checking:"⏳ Checking…",
    default:"⚪ Not enabled",
  }[status]||status;

  return React.createElement(ModalWrap,{onClose},
    React.createElement('div',{style:{padding:"20px 20px 8px"}},
      React.createElement('div',{style:{width:36,height:4,background:"#e8d9c4",borderRadius:2,margin:"0 auto 16px"}}),
      React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:19,fontWeight:700,marginBottom:4}},"Notifications"),
      React.createElement('div',{style:{fontSize:13,color:"var(--muted)",marginBottom:20}},"Get daily reminders to keep your streak alive."),

      React.createElement('div',{style:{background:"var(--bg)",borderRadius:12,padding:"14px",marginBottom:16}},
        React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:4}},"Status"),
        React.createElement('div',{style:{fontSize:14,fontWeight:600}},statusLabel)
      ),

      React.createElement('div',{style:{marginBottom:16}},
        React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:8}},"Daily Reminder Time"),
        React.createElement('div',{style:{display:"flex",alignItems:"center",gap:10}},
          React.createElement('input',{type:"range",min:5,max:22,value:reminderHour,onChange:e=>setHour(parseInt(e.target.value)),style:{flex:1,accentColor:"var(--accent)"}}),
          React.createElement('div',{style:{fontSize:15,fontWeight:700,minWidth:50,color:"var(--ink)"}},
            `${reminderHour>12?reminderHour-12:reminderHour||12}:00 ${reminderHour>=12?"PM":"AM"}`
          )
        ),
        React.createElement('button',{onClick:saveReminder,style:{marginTop:10,padding:"9px 18px",borderRadius:10,background:"var(--ink)",color:"white",fontSize:13,fontWeight:600,border:"none",cursor:"pointer"}},saved?"✓ Saved!":"Set Reminder")
      ),

      React.createElement('div',{style:{display:"flex",gap:8,marginTop:8,paddingBottom:8}},
        status==="subscribed"
          ? React.createElement('button',{onClick:disable,style:{flex:1,padding:"13px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent)",fontSize:14,fontWeight:600,border:"none",cursor:"pointer"}},"Disable Notifications")
          : status!=="denied"&&status!=="unsupported"
            ? React.createElement('button',{onClick:enable,style:{flex:1,padding:"13px",borderRadius:12,background:"var(--accent)",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer"}},"Enable Notifications")
            : React.createElement('div',{style:{flex:1,padding:"13px",borderRadius:12,background:"#f5f0e8",color:"var(--muted)",fontSize:13,textAlign:"center"}},"Open browser settings to enable"),
        React.createElement('button',{onClick:onClose,style:{flex:1,padding:"13px",borderRadius:12,background:"var(--accent-light)",fontSize:14,fontWeight:500,border:"none",cursor:"pointer"}},"Done")
      )
    )
  );
}

// ─── EXPORT ───────────────────────────────────────────────────────────────────
function exportCSV(habits,logs,rdates,period) {
  const rows=[["Date","Habit","Category","Completed","Note"]];
  rdates.forEach(d=>habits.forEach(h=>{
    if(!habitOn(h,d)) return;
    const e=logs[h.id]?.dates?.[d];
    rows.push([d,h.name,h.category,e?.done?"Yes":"No",e?.note||""]);
  }));
  const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\n");
  const a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv"}));a.download=`momentum-${period}.csv`;a.click();
}
function exportPDF(habits,logs,rdates,period) {
  const lines=habits.map(h=>{
    const app=rdates.filter(d=>habitOn(h,d)),done=app.filter(d=>logs[h.id]?.dates?.[d]?.done);
    const pct=app.length?Math.round(done.length/app.length*100):0,str=streak(h,logs);
    const notes=app.filter(d=>logs[h.id]?.dates?.[d]?.note).map(d=>`<div style="font-size:12px;color:#6b4c35;padding:4px 10px;background:#fef9ee;border-radius:6px;margin:3px 0"><b style="color:#9e8e80">${d}:</b> <i>"${logs[h.id].dates[d].note}"</i></div>`).join("");
    return `<div style="page-break-inside:avoid;border:1px solid #e8d9c4;border-radius:10px;padding:16px;margin-bottom:12px;background:#fff"><div style="display:flex;justify-content:space-between"><div><b>${h.name}</b> <span style="font-size:11px;background:${CAT_COLORS[h.category]}22;color:${CAT_COLORS[h.category]};border:1px solid ${CAT_COLORS[h.category]}55;padding:2px 7px;border-radius:20px">${h.category}</span></div><b style="font-size:20px;color:${CAT_COLORS[h.category]}">${pct}%</b></div><div style="font-size:12px;color:#9e8e80;margin:4px 0">${h.schedule} · ${done.length}/${app.length} days${str>0?` · 🔥 ${str} day streak`:""}</div><div style="background:#e8d9c4;height:6px;border-radius:3px;margin:6px 0"><div style="background:${CAT_COLORS[h.category]};height:6px;border-radius:3px;width:${pct}%"></div></div>${notes?`<div style="margin-top:8px"><div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#9e8e80;margin-bottom:4px">Notes</div>${notes}</div>`:""}</div>`;
  }).join("");
  const tA=habits.reduce((s,h)=>s+rdates.filter(d=>habitOn(h,d)).length,0);
  const tD=habits.reduce((s,h)=>s+rdates.filter(d=>habitOn(h,d)&&logs[h.id]?.dates?.[d]?.done).length,0);
  const w=window.open("","_blank");
  if(w){w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Momentum Report</title><style>body{font-family:Georgia,serif;background:#faf7f2;padding:28px;color:#3d3530;max-width:700px;margin:0 auto}@media print{body{padding:12px}}</style></head><body><h1 style="font-size:24px;margin-bottom:4px">◆ Momentum</h1><p style="color:#9e8e80;font-size:13px;margin-bottom:22px">${PERIOD_LABELS[period]} · ${rdates[0]}–${rdates[rdates.length-1]} · Overall: <b>${tA?Math.round(tD/tA*100):0}%</b></p>${lines}<script>window.onload=()=>window.print()<\/script></body></html>`);w.document.close();}
}

// ─── CONFIRM EMAIL LINK ───────────────────────────────────────────────────────
// Shown when the user opens an email sign-in link on a DIFFERENT device/browser
// than where they originally requested it (no email saved in localStorage).
function ConfirmLinkPage({linkUrl}) {
  const [email,setEmail]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const confirm=async()=>{
    if(!email.trim()) return setErr("Please enter your email.");
    setLoading(true); setErr("");
    try {
      await window.__fb.auth.signInWithEmailLink(email.trim(),linkUrl);
      history.replaceState({},'',location.pathname);
      // onAuthStateChanged in App will handle navigation
    } catch(e) {
      const msgs={'auth/invalid-email':'Invalid email.','auth/invalid-action-code':'This link is invalid or has expired. Please request a new one.','auth/expired-action-code':'Link expired. Please request a new one.','auth/user-disabled':'Account disabled.'};
      setErr(msgs[e.code]||e.message||"Sign-in failed.");
      setLoading(false);
    }
  };
  return React.createElement('div',{style:{minHeight:"100%",background:"var(--bg)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"32px 24px",paddingBottom:"calc(32px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{fontSize:52,marginBottom:16}},"🔗"),
    React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,marginBottom:8,textAlign:"center"}},"Confirm your email"),
    React.createElement('div',{style:{fontSize:14,color:"var(--muted)",textAlign:"center",lineHeight:1.6,marginBottom:28,maxWidth:300}},"You opened a sign-in link. Enter the email address you used to request it."),
    React.createElement('input',{type:"email",placeholder:"you@example.com",value:email,onChange:e=>setEmail(e.target.value),onKeyDown:e=>e.key==="Enter"&&confirm(),style:{width:"100%",maxWidth:320,padding:"13px 15px",border:"1.5px solid var(--sand)",borderRadius:14,fontSize:15,outline:"none",background:"var(--card)",fontFamily:"'DM Sans',sans-serif",marginBottom:err?12:20}}),
    err&&React.createElement('div',{style:{background:"var(--accent-light)",color:"var(--accent)",padding:"11px 14px",borderRadius:10,fontSize:13,marginBottom:16,width:"100%",maxWidth:320}},err),
    React.createElement('button',{onClick:confirm,disabled:loading,style:{width:"100%",maxWidth:320,padding:"15px",borderRadius:14,background:"var(--accent)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",opacity:loading?.7:1}},loading?"Signing in…":"Continue →")
  );
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthPage({mode:im,onAuth,onBack}) {
  const [mode,setMode]=useState(im);
  const [authType,setAuthType]=useState("password"); // "password" | "link"
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [name,setName]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const [linkSent,setLinkSent]=useState(false);

  const handle=async()=>{
    if(!email.trim()) return setErr("Please enter your email.");
    setLoading(true); setErr("");

    // ── Email link (passwordless) ─────────────────────────────────────────────
    if(authType==="link") {
      if(!window.__fb){setErr("Email link requires Firebase — not configured.");setLoading(false);return;}
      try {
        const settings={url:location.href.split('?')[0],handleCodeInApp:true};
        await window.__fb.auth.sendSignInLinkToEmail(email.trim(),settings);
        localStorage.setItem('mo:emailForSignIn',email.trim());
        setLinkSent(true);
      } catch(e) {
        const msgs={'auth/invalid-email':'Invalid email address.','auth/too-many-requests':'Too many requests. Try again later.'};
        setErr(msgs[e.code]||e.message||"Failed to send link.");
      }
      setLoading(false); return;
    }

    // ── Password auth ─────────────────────────────────────────────────────────
    if(!pw.trim()) return (setErr("Please fill in all fields."),setLoading(false));
    if(mode==="signup"&&!name.trim()) return (setErr("Please enter your name."),setLoading(false));
    if(pw.length<6) return (setErr("Password must be 6+ characters."),setLoading(false));

    if(window.__fb) {
      try {
        if(mode==="login") {
          const cred=await window.__fb.auth.signInWithEmailAndPassword(email.trim(),pw);
          const profile=await fsGet('users',cred.user.uid);
          if(!profile){setErr("Account profile not found. Please sign up.");setLoading(false);return;}
          const admin=isAdmin(cred.user.email);
          const finalP=admin?{...profile,plan:"cloud",role:"admin"}:profile;
          if(admin&&profile.plan!=="cloud") await fsSet('users',cred.user.uid,{plan:"cloud",role:"admin"});
          onAuth({uid:cred.user.uid,email:cred.user.email,...finalP});
        } else {
          const cred=await window.__fb.auth.createUserWithEmailAndPassword(email.trim(),pw);
          const admin=isAdmin(email.trim().toLowerCase());
          const profile={email:email.trim().toLowerCase(),name:name.trim(),plan:"cloud",role:admin?"admin":undefined,joinedAt:todayStr()};
          await fsSet('users',cred.user.uid,profile,false);
          onAuth({uid:cred.user.uid,...profile});
        }
      } catch(e) {
        const msgs={'auth/email-already-in-use':'Email already registered.','auth/user-not-found':'No account with that email.','auth/wrong-password':'Incorrect password.','auth/invalid-email':'Invalid email address.','auth/too-many-requests':'Too many attempts. Try again later.','auth/invalid-credential':'Invalid email or password.'};
        setErr(msgs[e.code]||e.message||"Something went wrong.");
      }
      setLoading(false); return;
    }

    // ── localStorage fallback ─────────────────────────────────────────────────
    const users=await loadUsers();
    if(mode==="login"){
      const u=users[email.toLowerCase()];
      if(!u||u.password!==btoa(pw)){setErr("Invalid email or password.");setLoading(false);return;}
      const admin=isAdmin(u.email);
      const finalU=admin?{...u,plan:"cloud",role:"admin"}:u;
      if(admin&&u.plan!=="cloud"){users[email.toLowerCase()]=finalU;await saveUsers(users);}
      await saveAuth({uid:finalU.uid,email:finalU.email,name:finalU.name,plan:finalU.plan,billing:finalU.billing,role:finalU.role});
      onAuth(finalU);
    } else {
      if(users[email.toLowerCase()]){setErr("Email already registered.");setLoading(false);return;}
      const uid=`u_${Date.now()}`;
      const admin=isAdmin(email.toLowerCase());
      const u={uid,email:email.toLowerCase(),name:name.trim(),password:btoa(pw),plan:"cloud",role:admin?"admin":undefined,joinedAt:todayStr()};
      users[email.toLowerCase()]=u; await saveUsers(users);
      if(admin) await saveAuth({uid:u.uid,email:u.email,name:u.name,plan:u.plan,billing:u.billing,role:u.role});
      onAuth(u);
    }
    setLoading(false);
  };

  const inp=extra=>({style:{width:"100%",padding:"13px 15px",border:"1.5px solid var(--border)",borderRadius:14,fontSize:15,outline:"none",background:"var(--bg)",color:"var(--ink)",fontFamily:"'DM Sans',sans-serif",marginTop:5},...extra});
  const tabBtn=(t,label)=>React.createElement('button',{onClick:()=>{setAuthType(t);setErr("");setLinkSent(false);},style:{flex:1,padding:"9px",borderRadius:10,border:"none",background:authType===t?"var(--card)":"transparent",color:authType===t?"var(--ink)":"var(--muted)",fontWeight:authType===t?700:400,fontSize:13,cursor:"pointer",fontFamily:"inherit",boxShadow:authType===t?"0 1px 4px rgba(0,0,0,.08)":"none",transition:"all .15s"}},label);

  return React.createElement('div',{style:{minHeight:"100%",background:"var(--bg)",display:"flex",flexDirection:"column",padding:"0 24px 24px",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{paddingTop:"calc(16px + env(safe-area-inset-top))"}},
      React.createElement('button',{onClick:onBack,style:{fontSize:13,color:"var(--muted)",marginBottom:24,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}},"← Back"),
      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:8,marginBottom:28}},
        React.createElement('span',{style:{fontSize:22,color:"var(--accent)",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
        React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:19}},"Momentum")
      ),
      React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:26,fontWeight:700,marginBottom:6}},mode==="login"?"Welcome back":"Create account"),
      React.createElement('p',{style:{fontSize:14,color:"var(--muted)",marginBottom:20}},mode==="login"?"Sign in to continue.":"Start building better habits today."),

      // Auth type toggle (only show for Firebase)
      window.__fb&&React.createElement('div',{style:{display:"flex",background:"var(--accent-light)",borderRadius:12,padding:3,gap:2,marginBottom:22}},
        tabBtn("password","🔑 Password"),
        tabBtn("link","✉️ Email link")
      ),

      // ── Email link flow ───────────────────────────────────────────────────
      authType==="link"&&linkSent
        ? React.createElement('div',{style:{textAlign:"center",padding:"32px 0"}},
            React.createElement('div',{style:{fontSize:52,marginBottom:12}},"📬"),
            React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:18,fontWeight:700,marginBottom:8}},"Check your email"),
            React.createElement('div',{style:{fontSize:14,color:"var(--muted)",lineHeight:1.6,marginBottom:24}},`We sent a sign-in link to `,React.createElement('b',null,email),`. Tap the link in the email — no password needed.`),
            React.createElement('div',{style:{fontSize:12,color:"var(--muted)",marginBottom:20}},"Didn't get it? Check spam or"),
            React.createElement('button',{onClick:()=>{setLinkSent(false);setErr("");},style:{fontSize:13,color:"var(--accent)",fontWeight:600,background:"none",border:"none",cursor:"pointer",textDecoration:"underline",fontFamily:"inherit"}},"try a different email")
          )
        : authType==="link"
          ? React.createElement(React.Fragment,null,
              React.createElement('div',{style:{marginBottom:14}},
                React.createElement('label',{style:{fontSize:12,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}},"Email"),
                React.createElement('input',inp({type:"email",placeholder:"you@example.com",value:email,onChange:e=>setEmail(e.target.value),onKeyDown:e=>e.key==="Enter"&&handle()}))
              ),
              React.createElement('div',{style:{background:"var(--accent-light)",borderRadius:10,padding:"10px 14px",fontSize:12,color:"var(--muted)",marginBottom:16}},"We'll email you a one-time sign-in link. No password required."),
              err&&React.createElement('div',{style:{background:"var(--accent-light)",color:"var(--accent)",padding:"11px 14px",borderRadius:10,fontSize:13,marginBottom:16}},err),
              React.createElement('button',{onClick:handle,disabled:loading,style:{width:"100%",padding:"15px",borderRadius:14,background:"var(--accent)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",opacity:loading?.7:1}},loading?"Sending…":"Send sign-in link →")
            )

          // ── Password flow ─────────────────────────────────────────────────
          : React.createElement(React.Fragment,null,
              React.createElement('div',{style:{marginBottom:14,display:mode==="signup"?"":"none"}},
                React.createElement('label',{style:{fontSize:12,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}},"Full Name"),
                React.createElement('input',inp({placeholder:"Your name",value:name,onChange:e=>setName(e.target.value)}))
              ),
              React.createElement('div',{style:{marginBottom:14}},
                React.createElement('label',{style:{fontSize:12,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}},"Email"),
                React.createElement('input',inp({type:"email",placeholder:"you@example.com",value:email,onChange:e=>setEmail(e.target.value)}))
              ),
              React.createElement('div',{style:{marginBottom:20}},
                React.createElement('label',{style:{fontSize:12,fontWeight:600,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".06em"}},"Password"),
                React.createElement('input',inp({type:"password",placeholder:"Min 6 characters",value:pw,onChange:e=>setPw(e.target.value),onKeyDown:e=>e.key==="Enter"&&handle()}))
              ),
              err&&React.createElement('div',{style:{background:"var(--accent-light)",color:"var(--accent)",padding:"11px 14px",borderRadius:10,fontSize:13,marginBottom:16}},err),
              React.createElement('button',{onClick:handle,disabled:loading,style:{width:"100%",padding:"15px",borderRadius:14,background:"var(--accent)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",opacity:loading?.7:1}},loading?"Please wait…":mode==="login"?"Log in →":"Create Account →"),
              React.createElement('div',{style:{textAlign:"center",marginTop:20,fontSize:14,color:"var(--muted)"}},
                mode==="login"?"Don't have an account? ":"Already have an account? ",
                React.createElement('button',{onClick:()=>{setMode(m=>m==="login"?"signup":"login");setErr("");},style:{color:"var(--accent)",fontWeight:600,textDecoration:"underline",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}},mode==="login"?"Sign up":"Log in")
              )
            )
    )
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingPage({user,onComplete}) {
  const [name,setName]=useState(user.name||"");
  const [dob,setDob]=useState(user.dob||"");
  const [gender,setGender]=useState(user.gender||"");
  const [err,setErr]=useState("");

  const proceed=async()=>{
    if(!name.trim()){setErr("Please enter your name.");return;}
    const admin=isAdmin(user.email);
    const trimmedName=name.trim();
    const users=await loadUsers();
    const u={...users[user.email],name:trimmedName,dob,gender,plan:"cloud",role:admin?"admin":undefined,joinedAt:users[user.email]?.joinedAt||todayStr()};
    users[user.email]=u; await saveUsers(users);
    const full={...user,name:trimmedName,dob,gender,plan:"cloud",role:u.role};
    await saveAuth(full);
    onComplete(full);
  };

  const GENDERS=["Male","Female","Non-binary","Prefer not to say"];
  const inp={style:{width:"100%",padding:"13px 15px",border:"1.5px solid var(--border)",borderRadius:14,fontSize:15,outline:"none",background:"var(--bg)",color:"var(--ink)",fontFamily:"'DM Sans',sans-serif",marginTop:5}};

  return React.createElement('div',{style:{minHeight:"100%",background:"var(--bg)",display:"flex",flexDirection:"column",padding:"0 24px 24px",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{paddingTop:"calc(20px + env(safe-area-inset-top))"}},
      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:8,marginBottom:32}},
        React.createElement('span',{style:{fontSize:22,color:"var(--accent)",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
        React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:19}},"Momentum")
      ),
      React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:26,fontWeight:700,marginBottom:6}},"Let's set up your profile"),
      React.createElement('p',{style:{fontSize:14,color:"var(--muted)",marginBottom:28,lineHeight:1.6}},"Just a few details to personalise your experience. Your name is required."),

      React.createElement('div',{style:{marginBottom:16}},
        React.createElement('label',{style:{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)"}},"Full Name *"),
        React.createElement('input',{...inp,placeholder:"e.g. Alex Johnson",value:name,onChange:e=>{setName(e.target.value);setErr("");}})
      ),
      React.createElement('div',{style:{marginBottom:16}},
        React.createElement('label',{style:{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)"}},"Date of Birth"),
        React.createElement('input',{...inp,type:"date",value:dob,onChange:e=>setDob(e.target.value),style:{...inp.style,colorScheme:"dark light"}})
      ),
      React.createElement('div',{style:{marginBottom:32}},
        React.createElement('label',{style:{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",display:"block",marginBottom:10}},"Gender"),
        React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:8}},
          GENDERS.map(g=>React.createElement('button',{key:g,onClick:()=>setGender(gender===g?"":g),style:{padding:"9px 18px",borderRadius:22,fontSize:14,border:`1.5px solid ${gender===g?"var(--accent)":"var(--border)"}`,background:gender===g?"var(--accent)":"var(--card)",color:gender===g?"white":"var(--ink)",fontFamily:"inherit",cursor:"pointer",transition:"all .15s"}},g))
        )
      ),
      err&&React.createElement('div',{style:{background:"var(--accent-light)",color:"var(--accent)",padding:"11px 14px",borderRadius:10,fontSize:13,marginBottom:16}},err),
      React.createElement('button',{onClick:proceed,style:{width:"100%",padding:"15px",borderRadius:14,background:"var(--accent)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",opacity:name.trim()?1:.5}},"Get started →")
    )
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({onSignup,onLogin}) {
  const FEATURES=[
    ["🔥","Streak Tracking"],["📊","Weekly Reports"],["✎","Daily Notes"],
    ["☁️","Cross-device Sync"],["☰","Drag to Reorder"],["🔔","Reminders"],
  ];
  return React.createElement('div',{style:{minHeight:"100%",background:"var(--bg)",overflowY:"auto",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    // Nav
    React.createElement('div',{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"calc(14px + env(safe-area-inset-top)) 20px 14px",background:"var(--card)",borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:10}},
      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:8}},
        React.createElement('span',{style:{fontSize:18,color:"var(--accent)",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
        React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:17}},"Momentum")
      ),
      React.createElement('button',{onClick:onLogin,style:{padding:"8px 18px",borderRadius:10,border:"1.5px solid var(--border)",background:"var(--card)",color:"var(--ink)",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"Log in")
    ),
    // Hero
    React.createElement('div',{style:{textAlign:"center",padding:"48px 24px 32px"}},
      React.createElement('div',{style:{display:"inline-block",background:"var(--accent-light)",border:"1px solid var(--border)",borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:700,color:"var(--accent)",marginBottom:16,textTransform:"uppercase",letterSpacing:".06em"}},"100% Free · No credit card"),
      React.createElement('h1',{style:{fontFamily:"'Lora',serif",fontSize:36,fontWeight:700,lineHeight:1.2,marginBottom:14,color:"var(--ink)"}},
        "Build habits that ",React.createElement('em',{style:{color:"var(--accent)"}},"actually stick.")
      ),
      React.createElement('p',{style:{fontSize:15,color:"var(--muted)",lineHeight:1.65,maxWidth:300,margin:"0 auto 32px"}},"Track daily rituals, streaks and progress — free forever, synced across all your devices."),
      React.createElement('button',{onClick:onSignup,style:{width:"100%",maxWidth:320,padding:"16px",borderRadius:14,background:"var(--accent)",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(196,98,45,.3)",display:"block",margin:"0 auto"}},"Get started — it's free →"),
      React.createElement('button',{onClick:onLogin,style:{width:"100%",maxWidth:320,padding:"14px",borderRadius:14,border:"1.5px solid var(--border)",background:"var(--card)",fontSize:15,fontWeight:500,cursor:"pointer",fontFamily:"inherit",marginTop:10,color:"var(--ink)",display:"block",margin:"10px auto 0"}},"I already have an account")
    ),
    // Features grid
    React.createElement('div',{style:{borderTop:"1px solid var(--border)",borderBottom:"1px solid var(--border)",padding:"24px 20px",background:"var(--bg)"}},
      React.createElement('div',{style:{fontSize:12,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",textAlign:"center",marginBottom:16}},"Everything included, free"),
      React.createElement('div',{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}},
        FEATURES.map(([e,t])=>React.createElement('div',{key:t,style:{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:6,padding:"16px 10px",background:"var(--card)",border:"1.5px solid var(--border)",borderRadius:14,textAlign:"center"}},
          React.createElement('span',{style:{fontSize:26,lineHeight:1}},e),
          React.createElement('span',{style:{fontSize:12,fontWeight:600,color:"var(--ink)",lineHeight:1.3}},t)
        ))
      )
    ),
    // Social proof / tagline
    React.createElement('div',{style:{textAlign:"center",padding:"28px 24px"}},
      React.createElement('p',{style:{fontSize:13,color:"var(--muted)",lineHeight:1.7}},"No subscriptions. No paywalls. Just habit tracking that works — on every device you own."),
      React.createElement('button',{onClick:onSignup,style:{marginTop:16,padding:"12px 32px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent)",fontSize:14,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit"}},"Create free account →")
    )
  );
}

// ─── ADMIN PANEL ──────────────────────────────────────────────────────────────
function AdminPanel({onClose}) {
  const [users,setUsers]=useState({});
  useEffect(()=>{ loadUsers().then(u=>setUsers(u||{})); },[]);
  const list=Object.values(users).sort((a,b)=>(b.joinedAt||"").localeCompare(a.joinedAt||""));

  return React.createElement('div',{style:{background:"var(--bg)",minHeight:"100%",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{display:"flex",alignItems:"center",gap:12,padding:"calc(16px + env(safe-area-inset-top)) 18px 16px",background:"var(--card)",borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:10}},
      React.createElement('button',{onClick:onClose,style:{fontSize:22,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",lineHeight:1,marginRight:4}},"←"),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:17}},"Admin Panel"),
        React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},`${list.length} registered user${list.length!==1?"s":""}`)
      ),
      React.createElement('span',{style:{fontSize:18}},"🛡️")
    ),
    React.createElement('div',{style:{padding:"16px"}},
      React.createElement('div',{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:16}},
        [["👥","Total Users",list.length],["📅","Newest",list[0]?.joinedAt||"—"]].map(([e,l,v])=>
          React.createElement('div',{key:l,style:{background:"var(--card)",borderRadius:12,padding:"14px",textAlign:"center",border:"1px solid var(--border)"}},
            React.createElement('div',{style:{fontSize:22,fontWeight:700,color:"var(--accent)",fontFamily:"'Lora',serif"}},typeof v==="number"?v:e),
            React.createElement('div',{style:{fontSize:11,color:"var(--muted)",marginTop:3}},l),
            typeof v!=="number"&&React.createElement('div',{style:{fontSize:12,fontWeight:600,color:"var(--ink)",marginTop:2}},v)
          )
        )
      ),
      list.length===0
        ? React.createElement('div',{style:{textAlign:"center",padding:"32px",color:"var(--muted)",fontSize:14}},"No users yet.")
        : list.map(u=>React.createElement('div',{key:u.uid||u.email,style:{background:"var(--card)",borderRadius:14,padding:"14px 16px",marginBottom:10,border:"1px solid var(--border)"}},
            React.createElement('div',{style:{display:"flex",alignItems:"center",gap:10}},
              React.createElement('div',{style:{width:38,height:38,borderRadius:"50%",background:"var(--accent-light)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,fontWeight:700,color:"var(--accent)",flexShrink:0}},(u.name||u.email||"?").charAt(0).toUpperCase()),
              React.createElement('div',{style:{flex:1,minWidth:0}},
                React.createElement('div',{style:{fontWeight:600,fontSize:14,display:"flex",alignItems:"center",gap:6}},
                  u.name||"—",
                  u.role==="admin"&&React.createElement('span',{style:{fontSize:10,background:"var(--accent)",color:"white",borderRadius:20,padding:"1px 7px",fontWeight:700}},"ADMIN")
                ),
                React.createElement('div',{style:{fontSize:12,color:"var(--muted)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},u.email),
                u.dob&&React.createElement('div',{style:{fontSize:11,color:"var(--muted)"}},`DOB: ${u.dob}`),
                u.gender&&React.createElement('div',{style:{fontSize:11,color:"var(--muted)"}},`Gender: ${u.gender}`)
              ),
              React.createElement('div',{style:{fontSize:11,color:"var(--muted)",flexShrink:0}},u.joinedAt||"—")
            )
          ))
    )
  );
}

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────
function AccountPage({user,onClose,onLogout,onPlanChange,onNotifications,onOpenAdmin}) {
  const [curTheme,setCurTheme]=useState(localStorage.getItem('mo:theme')||'light');
  const [editProfile,setEditProfile]=useState(false);
  const [pName,setPName]=useState(user.name||"");
  const [pDob,setPDob]=useState(user.dob||"");
  const [pHeight,setPHeight]=useState(user.height||"");
  const [pGender,setPGender]=useState(user.gender||"");
  const [profileSaved,setProfileSaved]=useState(false);
  const changeTheme=name=>{setCurTheme(name);applyTheme(name);localStorage.setItem('mo:theme',name);};
  const saveProfile=async()=>{
    if(!pName.trim()) return;
    const updated={...user,name:pName.trim(),dob:pDob,height:pHeight,gender:pGender};
    await saveAuth(updated);
    onPlanChange(updated);
    setEditProfile(false);
    setProfileSaved(true); setTimeout(()=>setProfileSaved(false),2000);
  };
  const GENDERS=["Male","Female","Non-binary","Prefer not to say"];
  const inp={style:{width:"100%",padding:"10px 13px",border:"1.5px solid var(--border)",borderRadius:10,fontSize:14,outline:"none",background:"var(--bg)",color:"var(--ink)",fontFamily:"inherit",boxSizing:"border-box",marginBottom:10}};

  const Section=({title,children})=>React.createElement('div',{style:{background:"var(--card)",borderRadius:16,padding:"18px 18px",marginBottom:12}},
    React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:12}},title),
    children
  );

  return React.createElement('div',{style:{background:"var(--bg)",minHeight:"100%",overflowY:"auto",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{display:"flex",alignItems:"center",gap:12,padding:"calc(16px + env(safe-area-inset-top)) 18px 16px",background:"var(--card)",borderBottom:"1px solid var(--border)",position:"sticky",top:0,zIndex:10}},
      React.createElement('button',{onClick:onClose,style:{fontSize:22,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",lineHeight:1,marginRight:4}},"←"),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:17}},"Account"),
        React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},[user.name,user.email].filter(Boolean).join(" · "))
      )
    ),
    React.createElement('div',{style:{padding:"16px 16px 0"}},
      React.createElement(Section,{title:"Profile"},
        editProfile
          ? React.createElement('div',null,
              React.createElement('label',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",display:"block",marginBottom:4}},"Full Name *"),
              React.createElement('input',{...inp,placeholder:"Your name",value:pName,onChange:e=>setPName(e.target.value)}),
              React.createElement('label',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",display:"block",marginBottom:4}},"Date of Birth"),
              React.createElement('input',{...inp,type:"date",value:pDob,onChange:e=>setPDob(e.target.value),style:{...inp.style,colorScheme:"dark light"}}),
              React.createElement('label',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",display:"block",marginBottom:4}},"Height"),
              React.createElement('input',{...inp,placeholder:"e.g. 5'10\" or 178 cm",value:pHeight,onChange:e=>setPHeight(e.target.value)}),
              React.createElement('label',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",display:"block",marginBottom:8}},"Gender"),
              React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}},
                GENDERS.map(g=>React.createElement('button',{key:g,onClick:()=>setPGender(pGender===g?"":g),style:{padding:"6px 13px",borderRadius:20,fontSize:12,border:`1.5px solid ${pGender===g?"var(--accent)":"var(--border)"}`,background:pGender===g?"var(--accent)":"var(--card)",color:pGender===g?"white":"var(--ink)",fontFamily:"inherit",cursor:"pointer"}},g))
              ),
              React.createElement('div',{style:{display:"flex",gap:8}},
                React.createElement('button',{onClick:()=>setEditProfile(false),style:{flex:1,padding:"10px",borderRadius:10,background:"var(--border)",color:"var(--ink)",fontSize:13,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}},"Cancel"),
                React.createElement('button',{onClick:saveProfile,disabled:!pName.trim(),style:{flex:2,padding:"10px",borderRadius:10,background:"var(--accent)",color:"white",fontSize:13,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",opacity:pName.trim()?1:.5}},"Save Profile")
              )
            )
          : React.createElement('div',null,
              React.createElement('div',{style:{display:"flex",justifyContent:"space-between",alignItems:"center"}},
                React.createElement('div',null,
                  React.createElement('div',{style:{fontWeight:600,fontSize:15,marginBottom:2}},user.name||React.createElement('span',{style:{color:"var(--muted)",fontStyle:"italic"}},"No name set")),
                  user.dob&&React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},`DOB: ${user.dob}`),
                  user.height&&React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},`Height: ${user.height}`),
                  user.gender&&React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},`Gender: ${user.gender}`)
                ),
                React.createElement('button',{onClick:()=>setEditProfile(true),style:{padding:"6px 14px",borderRadius:10,background:"var(--accent-light)",color:"var(--accent)",fontSize:12,fontWeight:600,border:"none",cursor:"pointer",fontFamily:"inherit"}},"Edit")
              ),
              profileSaved&&React.createElement('div',{style:{fontSize:12,color:"var(--accent)",fontWeight:600,marginTop:6}},"✓ Profile saved!")
            )
      ),
      React.createElement(Section,{title:"Notifications"},
        React.createElement('button',{onClick:onNotifications,style:{width:"100%",padding:"11px",borderRadius:12,background:"var(--accent-light)",fontSize:14,fontWeight:600,border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}},
          React.createElement('span',null,"🔔 Manage Notifications"),
          React.createElement('span',{style:{color:"var(--muted)"}},"›")
        )
      ),
      React.createElement(Section,{title:"Appearance"},
        React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:8}},
          Object.entries(THEMES).map(([k,t])=>React.createElement('button',{key:k,onClick:()=>changeTheme(k),style:{display:"flex",flexDirection:"column",alignItems:"center",gap:4,padding:"10px 12px",borderRadius:14,border:`2px solid ${curTheme===k?t.accent:"transparent"}`,background:t.bg,cursor:"pointer",minWidth:66,transition:"all .15s",outline:"none"}},
            React.createElement('div',{style:{fontSize:22}},t.emoji),
            React.createElement('div',{style:{fontSize:10,fontWeight:600,color:t.ink,whiteSpace:"nowrap"}},t.label)
          ))
        )
      ),
      isAdmin(user.email)&&React.createElement(Section,{title:"Admin"},
        React.createElement('button',{onClick:onOpenAdmin,style:{width:"100%",padding:"11px",borderRadius:12,background:"var(--accent-light)",fontSize:14,fontWeight:600,border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}},
          React.createElement('span',null,"🛡️ Admin Panel"),
          React.createElement('span',{style:{color:"var(--muted)"}},"›")
        )
      ),
      React.createElement(Section,{title:"Account Actions"},
        React.createElement('button',{onClick:onLogout,style:{width:"100%",padding:"13px",borderRadius:12,background:"var(--accent-light)",color:"var(--accent)",fontSize:14,fontWeight:700,border:"1px solid #f5c6bb",cursor:"pointer",fontFamily:"inherit"}},"Log out")
      )
    )
  );
}

// ─── MAIN HABIT APP ───────────────────────────────────────────────────────────
function HabitApp({user,onLogout,onOpenAccount,onPlanChange}) {
  const [habits,setHabits]=useState([]);
  const [logs,setLogs]=useState({});
  const [view,setView]=useState("today");
  const [wOff,setWOff]=useState(0);
  const [rPeriod,setRPeriod]=useState("weekly");
  const [showAdd,setShowAdd]=useState(false);
  const [editH,setEditH]=useState(null);
  const [noteM,setNoteM]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [saveInd,setSaveInd]=useState(false);
  const [installable,setInstallable]=useState(false);
  const [offline,setOffline]=useState(!navigator.onLine);
  const [updateReady,setUpdateReady]=useState(false);
  const [showNotif,setShowNotif]=useState(false);
  const dragIdx=useRef(null),dragOvr=useRef(null);
  const [dragOverState,setDOS]=useState(null);

  useEffect(()=>{
    loadUD(user.uid).then(d=>{
      if(d){
        // Migrate old format
        const ml={};
        Object.entries(d.logs||{}).forEach(([hid,val])=>{
          if(val?.dates) ml[hid]=val;
          else if(val&&typeof val==="object"){const dates={};Object.entries(val).forEach(([dt,v])=>{dates[dt]=typeof v==="boolean"?{done:v,note:""}:v;});ml[hid]={dates};}
        });
        setHabits(d.habits||[]); setLogs(ml);
      }
      setLoaded(true);
    });
    // Expose setView for SW navigation messages
    window.__momentumSetView = setView;
    // PWA events
    const onInstallable=()=>setInstallable(true);
    const onInstalled=()=>setInstallable(false);
    const onNetwork=e=>setOffline(!e.detail.online);
    const onUpdate=()=>setUpdateReady(true);
    window.addEventListener('pwa-installable',onInstallable);
    window.addEventListener('pwa-installed',onInstalled);
    window.addEventListener('pwa-network',onNetwork);
    window.addEventListener('pwa-update-available',onUpdate);
    return ()=>{
      window.removeEventListener('pwa-installable',onInstallable);
      window.removeEventListener('pwa-installed',onInstalled);
      window.removeEventListener('pwa-network',onNetwork);
      window.removeEventListener('pwa-update-available',onUpdate);
    };
  },[user.uid]);

  const persist=useCallback(async(h,l)=>{
    await saveUD(user.uid,{habits:h,logs:l});
    setSaveInd(true); setTimeout(()=>setSaveInd(false),1400);
  },[user.uid]);

  const updH=h=>{setHabits(h);persist(h,logs);};
  const updL=l=>{setLogs(l);persist(habits,l);};
  const toggle=(hid,iso)=>{
    const prev=logs[hid]?.dates?.[iso];
    updL({...logs,[hid]:{dates:{...(logs[hid]?.dates||{}),[iso]:{done:!prev?.done,note:prev?.note||""}}}});
  };
  const saveNote=(hid,iso,note)=>{
    const prev=logs[hid]?.dates?.[iso];
    updL({...logs,[hid]:{dates:{...(logs[hid]?.dates||{}),[iso]:{done:prev?.done||false,note}}}});
    setNoteM(null);
  };
  const delHabit=id=>{const nh=habits.filter(h=>h.id!==id),nl={...logs};delete nl[id];setHabits(nh);setLogs(nl);persist(nh,nl);};

  const onDS=i=>{dragIdx.current=i;};
  const onDE=i=>{dragOvr.current=i;setDOS(i);};
  const onDEnd=()=>{
    setDOS(null);
    if(dragIdx.current!==null&&dragOvr.current!==null&&dragIdx.current!==dragOvr.current){
      const r=[...habits],[m]=r.splice(dragIdx.current,1);r.splice(dragOvr.current,0,m);updH(r);
    }
    dragIdx.current=null;dragOvr.current=null;
  };

  const today=todayStr(), wDates=weekDates(wOff), rDates=reportDates(rPeriod);
  const todayH=habits.filter(h=>!h.paused&&habitOn(h,today));
  const doneT=todayH.filter(h=>logs[h.id]?.dates?.[today]?.done).length;
  const bestStr=habits.length?Math.max(...habits.map(h=>streak(h,logs)),0):0;

  if(!loaded) return React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--bg)",fontFamily:"'Lora',serif",color:"var(--muted)",fontSize:16}},"◆ Loading…");

  // Bottom nav items
  const NAV=[
    {key:"today",  icon:"☀️", label:"Today"},
    {key:"weekly", icon:"📅", label:"Weekly"},
    {key:"reports",icon:"📊", label:"Reports"},
    {key:"manage", icon:"⚙️", label:"Manage"},
  ];

  return React.createElement('div',{style:{height:"100%",display:"flex",flexDirection:"column",overflow:"hidden"}},
    // Status bars
    offline&&React.createElement(OfflineBanner),
    updateReady&&React.createElement(UpdateBanner,{onUpdate:()=>window.MomentumPWA?.applyUpdate()}),

    // Top header
    React.createElement('div',{style:{background:"var(--card)",borderBottom:"1px solid var(--border)",paddingTop:"env(safe-area-inset-top)",flexShrink:0}},
      React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",gap:8}},
        React.createElement('div',{style:{display:"flex",alignItems:"center",gap:7}},
          React.createElement('span',{style:{fontSize:17,color:"var(--accent)",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
          React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:16}},"Momentum"),
          saveInd&&React.createElement('span',{style:{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#81b29a",animation:"fd 1.4s forwards"}})
        ),
        React.createElement('div',{style:{display:"flex",gap:8,alignItems:"center"}},
          React.createElement('button',{onClick:onOpenAccount,style:{width:30,height:30,borderRadius:"50%",background:"var(--accent-light)",border:"1.5px solid #e8d9c4",fontSize:12,fontWeight:700,color:"var(--ink)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}},user.name.charAt(0).toUpperCase()),
          React.createElement('button',{onClick:()=>{setEditH(null);setShowAdd(true);},style:{padding:"7px 14px",borderRadius:9,background:"var(--accent)",color:"white",fontSize:12,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit"}},"+ Add")
        )
      )
    ),

    // Scrollable content
    React.createElement('div',{style:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}},
      React.createElement('div',{style:{padding:"14px 14px 0"}},

        // Install banner
        installable&&React.createElement(InstallBanner,{
          onInstall:()=>window.MomentumPWA?.triggerInstallPrompt().then(()=>setInstallable(false)),
          onDismiss:()=>setInstallable(false)
        }),

        // Summary cards
        React.createElement('div',{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}},
          [{label:"Today",value:`${doneT}/${todayH.length}`,sub:"done",accent:"var(--accent)"},
           {label:"Rate",value:todayH.length?`${Math.round(doneT/todayH.length*100)}%`:"—",sub:"today",accent:"#81b29a"},
           {label:"Streak",value:`${bestStr}d`,sub:"best 🔥",accent:"#f2cc8f"},
           {label:"Active",value:habits.filter(h=>!h.paused).length,sub:"habits",accent:"#a8c5da"},
          ].map(c=>React.createElement('div',{key:c.label,style:{background:"var(--card)",borderRadius:12,padding:"12px 14px",boxShadow:"0 1px 4px rgba(61,53,48,.06)",borderLeft:`4px solid ${c.accent}`}},
            React.createElement('div',{style:{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:2}},c.label),
            React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,lineHeight:1}},c.value),
            React.createElement('div',{style:{fontSize:10,color:"var(--muted)",marginTop:2}},c.sub)
          ))
        ),

        // ── TODAY ──
        view==="today"&&React.createElement('div',null,
          React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700,marginBottom:4}},
            new Date().toLocaleDateString("en-US",{weekday:"long",month:"short",day:"numeric"})
          ),
          React.createElement('div',{style:{fontSize:11,color:"var(--muted)",marginBottom:10}},"☰ drag to reorder · ✎ tap to add a note"),
          todayH.length===0
            ? React.createElement('div',{style:{textAlign:"center",padding:"40px 20px",color:"var(--muted)"}},
                React.createElement('div',{style:{fontSize:36,marginBottom:10}},"🌿"),
                React.createElement('p',{style:{fontSize:14,fontWeight:500}},"No habits today"),
                React.createElement('p',{style:{fontSize:12,marginTop:4}},"Tap '+ Add' to get started.")
              )
            : todayH.map((h,ti)=>{
                const gi=habits.indexOf(h),done=logs[h.id]?.dates?.[today]?.done,note=logs[h.id]?.dates?.[today]?.note,str=streak(h,logs),wr=compRate(h,logs,weekDates(0));
                return React.createElement('div',{key:h.id},
                  React.createElement('div',{
                    className:`h-row${dragOverState===gi?" dov":""}`,
                    style:{background:"var(--card)",borderRadius:12,padding:"12px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 4px rgba(61,53,48,.06)",border:`2px solid ${dragOverState===gi?"#c4a882":"transparent"}`,opacity:done?.62:1,transition:"border .15s"},
                    draggable:true,onDragStart:()=>onDS(gi),onDragEnter:()=>onDE(gi),onDragEnd:onDEnd,onDragOver:e=>e.preventDefault()
                  },
                    React.createElement('span',{style:{cursor:"grab",color:"var(--border)",fontSize:14,flexShrink:0,userSelect:"none"}},"☰"),
                    React.createElement('div',{
                      style:{width:24,height:24,borderRadius:7,border:`2px solid ${done?"var(--accent)":"var(--sand)"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,background:done?"var(--accent)":"var(--card)",transition:"all .18s"},
                      onClick:()=>toggle(h.id,today)
                    },done&&React.createElement('svg',{width:"11",height:"9",viewBox:"0 0 11 9"},React.createElement('polyline',{points:"1,4.5 4,7.5 10,1",stroke:"white",strokeWidth:"2.2",fill:"none",strokeLinecap:"round",strokeLinejoin:"round"}))),
                    React.createElement('div',{style:{flex:1,minWidth:0}},
                      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}},
                        React.createElement('span',{style:{fontSize:14,fontWeight:500,textDecoration:done?"line-through":"none",color:done?"var(--muted)":"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"calc(100% - 80px)"}},h.name),
                        str>0&&React.createElement('span',{style:{display:"inline-flex",alignItems:"center",gap:2,background:"var(--accent-light)",border:"1.5px solid var(--border)",borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700,color:"var(--accent)",flexShrink:0}},"🔥",str)
                      ),
                      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
                        React.createElement('span',{style:{fontSize:10,color:"var(--muted)"}},[h.category,h.schedule].join(" · ")),
                        React.createElement('button',{
                          onClick:()=>setNoteM({habitId:h.id,date:today,habitName:h.name}),
                          style:{fontSize:10,padding:"2px 7px",borderRadius:7,border:`1px solid ${note?"var(--accent)":"var(--border)"}`,color:note?"var(--accent)":"var(--muted)",background:note?"var(--accent-light)":"var(--card)",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}
                        },note?"✎ Note ✓":"✎ Note")
                      )
                    ),
                    React.createElement(Ring,{pct:wr,color:CAT_COLORS[h.category],size:38})
                  )
                );
              })
        ),

        // ── WEEKLY ──
        view==="weekly"&&React.createElement('div',null,
          React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}},
            React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700}},"Weekly View"),
            React.createElement('div',{style:{display:"flex",gap:6,alignItems:"center"}},
              React.createElement('button',{onClick:()=>setWOff(o=>o-1),style:{padding:"5px 10px",borderRadius:10,border:"1.5px solid #e8d9c4",fontSize:12,background:"var(--card)",cursor:"pointer",fontFamily:"inherit"}},"←"),
              wOff!==0&&React.createElement('button',{onClick:()=>setWOff(0),style:{padding:"5px 10px",borderRadius:10,border:"1.5px solid var(--ink)",fontSize:11,background:"var(--ink)",color:"white",cursor:"pointer",fontFamily:"inherit"}},"Today"),
              React.createElement('button',{onClick:()=>setWOff(o=>o+1),disabled:wOff>=0,style:{padding:"5px 10px",borderRadius:10,border:"1.5px solid #e8d9c4",fontSize:12,background:"var(--card)",cursor:"pointer",fontFamily:"inherit",opacity:wOff>=0?.35:1}},"→")
            )
          ),
          React.createElement('div',{style:{overflowX:"auto",WebkitOverflowScrolling:"touch"}},
            React.createElement('table',{style:{borderCollapse:"separate",borderSpacing:"0 6px",width:"100%",minWidth:380}},
              React.createElement('thead',null,React.createElement('tr',null,
                React.createElement('th',{style:{textAlign:"left",fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"var(--muted)",padding:"4px 8px",paddingLeft:10}},"Habit"),
                wDates.map(d=>{const dt=new Date(d+"T00:00:00"),isT=d===today;return React.createElement('th',{key:d,style:{textAlign:"center",minWidth:34,fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".05em",color:"var(--muted)",padding:"4px 3px"}},
                  React.createElement('div',{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:1}},
                    React.createElement('span',{style:{fontSize:9}},DAYS[dt.getDay()]),
                    React.createElement('span',{style:{width:20,height:20,borderRadius:6,display:"flex",alignItems:"center",justifyContent:"center",background:isT?"var(--ink)":"transparent",color:isT?"white":"inherit",fontSize:11,fontWeight:isT?700:400}},dt.getDate())
                  )
                );}),
                React.createElement('th',{style:{textAlign:"center",fontSize:10,color:"var(--muted)",padding:"4px 6px"}},"Rate")
              )),
              React.createElement('tbody',null,
                habits.filter(h=>!h.paused).map(h=>React.createElement('tr',{key:h.id},
                  React.createElement('td',{style:{background:"var(--card)",padding:"8px 8px 8px 10px",borderRadius:"10px 0 0 10px"}},
                    React.createElement('div',{style:{display:"flex",alignItems:"center",gap:5}},
                      React.createElement('span',{style:{width:7,height:7,borderRadius:"50%",background:CAT_COLORS[h.category],flexShrink:0}}),
                      React.createElement('span',{style:{fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:80}},h.name)
                    )
                  ),
                  wDates.map(d=>{const ap=habitOn(h,d),done=logs[h.id]?.dates?.[d]?.done,hn=!!logs[h.id]?.dates?.[d]?.note,fut=d>today;return React.createElement('td',{key:d,style:{background:"var(--card)",padding:"8px 3px",textAlign:"center"}},
                    ap
                      ? React.createElement('div',{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:2}},
                          React.createElement('div',{style:{width:20,height:20,borderRadius:5,border:`2px solid ${done?"var(--accent)":"var(--sand)"}`,display:"flex",alignItems:"center",justifyContent:"center",background:done?"var(--accent)":"var(--card)",cursor:fut?"default":"pointer",opacity:fut?.35:1},onClick:()=>!fut&&toggle(h.id,d)},
                            done&&React.createElement('svg',{width:"9",height:"7",viewBox:"0 0 9 7"},React.createElement('polyline',{points:"1,3.5 3.5,6 8,1",stroke:"white",strokeWidth:"2",fill:"none",strokeLinecap:"round",strokeLinejoin:"round"}))
                          ),
                          !fut&&React.createElement('span',{style:{fontSize:8,color:hn?"#8a6c2a":"#d4c9ba",cursor:"pointer"},onClick:()=>setNoteM({habitId:h.id,date:d,habitName:h.name})},hn?"📝":"✎")
                        )
                      : React.createElement('span',{style:{color:"var(--border)",fontSize:10}},"–")
                  );}),
                  React.createElement('td',{style:{background:"var(--card)",padding:"8px 6px",borderRadius:"0 10px 10px 0",textAlign:"center"}},React.createElement(Ring,{pct:compRate(h,logs,wDates),color:CAT_COLORS[h.category],size:34}))
                ))
              )
            )
          )
        ),

        // ── REPORTS ──
        view==="reports"&&React.createElement('div',null,
          React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}},
            React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700}},"Reports"),
            React.createElement('div',{style:{display:"flex",gap:6}},
              React.createElement('button',{onClick:()=>exportCSV(habits,logs,rDates,rPeriod),style:{padding:"6px 12px",borderRadius:9,border:"1.5px solid #e8d9c4",background:"var(--card)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"↓ CSV"),
              React.createElement('button',{onClick:()=>exportPDF(habits,logs,rDates,rPeriod),style:{padding:"6px 12px",borderRadius:9,border:"1.5px solid #e8d9c4",background:"var(--card)",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"↓ PDF")
            )
          ),
          React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}},
            Object.entries(PERIOD_LABELS).map(([p,l])=>React.createElement('button',{key:p,onClick:()=>setRPeriod(p),style:{padding:"5px 11px",borderRadius:20,fontSize:11,border:"1.5px solid var(--border)",background:rPeriod===p?"var(--ink)":"var(--card)",color:rPeriod===p?"var(--bg)":"var(--ink)",fontFamily:"inherit",cursor:"pointer",fontWeight:rPeriod===p?600:400}},l))
          ),
          habits.length===0
            ? React.createElement('div',{style:{textAlign:"center",padding:"40px",color:"var(--muted)"}},React.createElement('div',{style:{fontSize:32,marginBottom:8}},"📊"),React.createElement('p',null,"Add habits to see reports."))
            : React.createElement('div',null,
                // Overall
                (()=>{const tA=habits.reduce((s,h)=>s+rDates.filter(d=>habitOn(h,d)).length,0),tD=habits.reduce((s,h)=>s+rDates.filter(d=>habitOn(h,d)&&logs[h.id]?.dates?.[d]?.done).length,0),pct=tA?Math.round(tD/tA*100):0;
                return React.createElement('div',{style:{background:"linear-gradient(135deg,var(--bg),var(--accent-light))",borderRadius:14,padding:"16px",marginBottom:12,boxShadow:"0 1px 4px rgba(61,53,48,.06)"}},
                  React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,marginBottom:8}},"Overall — "+PERIOD_LABELS[rPeriod]),
                  React.createElement('div',{style:{display:"flex",alignItems:"center",gap:12}},
                    React.createElement(Ring,{pct,color:"var(--accent)",size:50}),
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontSize:13,fontWeight:600}},[tD,"of",tA,"habit-days"].join(" ")),
                      React.createElement('div',{style:{fontSize:11,color:"var(--muted)",marginTop:2}},rDates[0]+" → "+rDates[rDates.length-1])
                    )
                  )
                );})(),
                // Per habit
                habits.map(h=>{const app=rDates.filter(d=>habitOn(h,d)),done=app.filter(d=>logs[h.id]?.dates?.[d]?.done),pct=app.length?Math.round(done.length/app.length*100):null,str=streak(h,logs),nd=app.filter(d=>logs[h.id]?.dates?.[d]?.note);
                return React.createElement('div',{key:h.id,style:{background:"var(--card)",borderRadius:12,padding:"14px",marginBottom:8,boxShadow:"0 1px 4px rgba(61,53,48,.06)"}},
                  React.createElement('div',{style:{display:"flex",alignItems:"center",gap:10}},
                    React.createElement(Ring,{pct,color:CAT_COLORS[h.category],size:40}),
                    React.createElement('div',{style:{flex:1,minWidth:0}},
                      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}},
                        React.createElement('span',{style:{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}},h.name),
                        str>0&&React.createElement('span',{style:{fontSize:11,color:"var(--accent)",fontWeight:700}},"🔥"+str)
                      ),
                      React.createElement('div',{style:{height:6,borderRadius:3,background:"var(--border)",overflow:"hidden"}},React.createElement('div',{style:{height:6,borderRadius:3,background:CAT_COLORS[h.category],width:`${pct||0}%`,transition:"width .5s"}})),
                      React.createElement('div',{style:{fontSize:10,color:"var(--muted)",marginTop:3}},[done.length+"/"+app.length+" days",h.schedule].join(" · ")),
                      nd.length>0&&nd.slice(-2).map(d=>React.createElement('div',{key:d,style:{display:"flex",gap:6,marginTop:5,background:"var(--accent-light)",borderRadius:7,padding:"5px 9px",fontSize:11}},
                        React.createElement('span',{style:{color:"var(--muted)",flexShrink:0}},new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),
                        React.createElement('span',{style:{color:"var(--ink)",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},'"'+logs[h.id].dates[d].note+'"')
                      ))
                    )
                  )
                );})
              )
        ),

        // ── MANAGE ──
        view==="manage"&&React.createElement('div',null,
          React.createElement('div',{style:{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}},
            React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700}},"Manage Habits"),
            React.createElement('span',{style:{fontSize:10,color:"var(--muted)"}},"☰ drag to reorder")
          ),
          habits.length===0
            ? React.createElement('div',{style:{textAlign:"center",padding:"40px",color:"var(--muted)"}},React.createElement('div',{style:{fontSize:32,marginBottom:8}},"🌱"),React.createElement('p',null,"No habits yet."))
            : habits.map((h,i)=>React.createElement('div',{key:h.id,
                style:{background:"var(--card)",borderRadius:12,padding:"11px 13px",marginBottom:7,display:"flex",alignItems:"center",gap:9,boxShadow:"0 1px 4px rgba(61,53,48,.06)",border:`2px solid ${dragOverState===i?"#c4a882":"transparent"}`,transition:"border .15s"},
                draggable:true,onDragStart:()=>onDS(i),onDragEnter:()=>onDE(i),onDragEnd:onDEnd,onDragOver:e=>e.preventDefault()
              },
                React.createElement('span',{style:{cursor:"grab",color:"var(--border)",fontSize:14,flexShrink:0,userSelect:"none"}},"☰"),
                React.createElement('span',{style:{width:9,height:9,borderRadius:"50%",background:CAT_COLORS[h.category],flexShrink:0}}),
                React.createElement('div',{style:{flex:1,minWidth:0}},
                  React.createElement('div',{style:{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},h.name),
                  React.createElement('div',{style:{fontSize:10,color:"var(--muted)",marginTop:1}},[h.category,h.schedule].join(" · "))
                ),
                h.paused&&React.createElement('span',{style:{fontSize:10,background:"var(--border)",color:"var(--muted)",padding:"2px 7px",borderRadius:8,flexShrink:0}},"Paused"),
                React.createElement('button',{onClick:()=>{const nh=habits.map(x=>x.id===h.id?{...x,paused:!x.paused}:x);updH(nh);},style:{padding:"5px 9px",borderRadius:8,border:"1.5px solid var(--border)",fontSize:10,fontWeight:600,background:"var(--card)",cursor:"pointer",fontFamily:"inherit",flexShrink:0}},h.paused?"Resume":"Pause"),
                React.createElement('button',{onClick:()=>{setEditH(h);setShowAdd(true);},style:{padding:"5px 9px",borderRadius:8,border:"1.5px solid var(--border)",fontSize:10,fontWeight:600,background:"var(--card)",cursor:"pointer",fontFamily:"inherit",flexShrink:0}},"Edit"),
                React.createElement('button',{onClick:()=>delHabit(h.id),style:{padding:"5px 9px",borderRadius:8,border:"1.5px solid var(--border)",fontSize:10,fontWeight:600,background:"var(--accent-light)",color:"var(--accent)",cursor:"pointer",fontFamily:"inherit",flexShrink:0}},"Del")
              ))
        )
      )
    ),

    // Bottom navigation
    React.createElement('div',{style:{background:"var(--card)",borderTop:"1px solid var(--border)",display:"flex",paddingBottom:"env(safe-area-inset-bottom)",flexShrink:0}},
      NAV.map(n=>React.createElement('button',{key:n.key,onClick:()=>setView(n.key),style:{flex:1,padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}},
        React.createElement('span',{style:{fontSize:18,filter:view===n.key?"none":"grayscale(100%) opacity(50%)",transition:"filter .2s"}},n.icon),
        React.createElement('span',{style:{fontSize:10,fontWeight:view===n.key?700:400,color:view===n.key?"var(--accent)":"var(--muted)",transition:"color .2s"}},n.label)
      ))
    ),

    // Modals
    showAdd&&React.createElement(HabitModal,{existing:editH,onClose:()=>{setShowAdd(false);setEditH(null);},onSave:h=>{const nh=editH?habits.map(x=>x.id===h.id?h:x):[...habits,h];updH(nh);setShowAdd(false);setEditH(null);}}),
    noteM&&React.createElement(NoteModal,{...noteM,existing:logs[noteM.habitId]?.dates?.[noteM.date]?.note||"",onClose:()=>setNoteM(null),onSave:n=>saveNote(noteM.habitId,noteM.date,n)}),
    showNotif&&React.createElement(NotificationSettings,{onClose:()=>setShowNotif(false)})
  );
}

// ─── ROOT ─────────────────────────────────────────────────────────────────────
function App() {
  const [screen,setScreen]=useState("loading");
  const [authMode,setAuthMode]=useState("signup");
  const [user,setUser]=useState(null);
  const [showNotif,setShowNotif]=useState(false);

  useEffect(()=>{
    if(!window.__fb) {
      // Fallback: localStorage (Firebase not configured)
      loadAuth().then(auth=>{
        if(auth?.uid&&auth?.name){setUser(auth);setScreen("app");}
        else if(auth?.uid){setUser(auth);setScreen("onboarding");}
        else setScreen("landing");
      });
      return;
    }

    // Detect email sign-in link in current URL
    if(window.__fb.auth.isSignInWithEmailLink(location.href)) {
      const savedEmail=localStorage.getItem('mo:emailForSignIn');
      if(savedEmail) {
        // Same device: auto-complete sign-in silently
        window.__fb.auth.signInWithEmailLink(savedEmail,location.href)
          .then(()=>{ localStorage.removeItem('mo:emailForSignIn'); history.replaceState({},'',location.pathname); })
          .catch(e=>console.error('[Auth] Email link error:',e));
        // Fall through — onAuthStateChanged below will fire on success
      } else {
        // Different device: need user to re-enter email
        window.__pendingLinkUrl=location.href;
        history.replaceState({},'',location.pathname); // clean URL immediately
        setScreen("confirmlink");
        // Still set up listener — it fires after signInWithEmailLink in ConfirmLinkPage
      }
    }

    const unsub=window.__fb.auth.onAuthStateChanged(async fbUser=>{
      if(fbUser) {
        // Try Firestore first; fall back to locally-cached profile if Firestore is unreachable
        let profile=await fsGet('users',fbUser.uid);
        if(!profile) profile=await ls.get(`mo:prof:${fbUser.uid}`);
        if(profile) {
          // Keep local cache fresh
          ls.set(`mo:prof:${fbUser.uid}`,profile);
          const auth={uid:fbUser.uid,email:fbUser.email,...profile};
          setUser(auth);
          setScreen(auth.name?"app":"onboarding");
        } else {
          setUser({uid:fbUser.uid,email:fbUser.email,name:""});
          setScreen("onboarding");
        }
      } else {
        setScreen(s=>s==="confirmlink"?s:"landing");
      }
    });
    return ()=>unsub();
  },[]);

  useEffect(()=>{
    if(screen!=="loading"&&typeof window.__hideSplash==="function"){
      window.__hideSplash();
    }
  },[screen]);

  if(screen==="loading") return React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"var(--accent)",color:"white",fontFamily:"'Lora',serif",fontSize:18,gap:8}},
    React.createElement('span',null,"◆"),React.createElement('span',null,"Momentum")
  );
  if(screen==="landing") return React.createElement(LandingPage,{onSignup:()=>{setAuthMode("signup");setScreen("auth");},onLogin:()=>{setAuthMode("login");setScreen("auth");}});
  if(screen==="auth")    return React.createElement(AuthPage,{mode:authMode,onAuth:u=>{setUser(u);setScreen(u.name?"app":"onboarding");},onBack:()=>setScreen("landing")});
  if(screen==="confirmlink") return React.createElement(ConfirmLinkPage,{linkUrl:window.__pendingLinkUrl||location.href});
  if(screen==="onboarding") return React.createElement(OnboardingPage,{user,onComplete:u=>{setUser(u);setScreen("app");}});
  // HabitApp stays mounted for "app", "account", and "admin" screens so its
  // state (habits, logs, loaded) is never lost when opening overlaid screens.
  const overlay = {position:"fixed",inset:0,zIndex:100,background:"var(--bg)",overflowY:"auto",paddingBottom:"env(safe-area-inset-bottom)"};
  if(screen==="app"||screen==="account"||screen==="admin") return React.createElement('div',{style:{height:"100%"}},
    React.createElement(HabitApp,{user,onLogout:async()=>{await clearAuth();setUser(null);setScreen("landing");},onOpenAccount:()=>setScreen("account"),onPlanChange:u=>setUser(u)}),
    screen==="account"&&React.createElement('div',{style:overlay},
      React.createElement(AccountPage,{user,onClose:()=>setScreen("app"),onLogout:async()=>{await clearAuth();setUser(null);setScreen("landing");},onPlanChange:u=>{setUser(u);setScreen("app");},onNotifications:()=>setShowNotif(true),onOpenAdmin:()=>setScreen("admin")}),
      showNotif&&React.createElement(NotificationSettings,{onClose:()=>setShowNotif(false)})
    ),
    screen==="admin"&&React.createElement('div',{style:overlay},
      React.createElement(AdminPanel,{onClose:()=>setScreen("account")})
    )
  );
  return null;
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
