// ─── Momentum PWA — app.js ────────────────────────────────────────────────────
// React 18 via UMD globals
const { useState, useEffect, useCallback, useRef, memo } = React;

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const PRICING = {
  local: { monthly:3, yearly:29, label:"Local Pro" },
  cloud: { monthly:4, yearly:35, label:"Cloud Pro" },
  free:  { monthly:0, yearly:0,  label:"Free" },
};
const CATEGORIES  = ["Health","Work","Learning","Mindfulness","Finance","Social","Other"];
const CAT_COLORS  = { Health:"#e07a5f",Work:"#3d405b",Learning:"#81b29a",Mindfulness:"#f2cc8f",Finance:"#a8c5da",Social:"#c9ada7",Other:"#b5b5a9" };
const DAYS        = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const FULL_DAYS   = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
const SCHED_OPTS  = ["Daily","Weekdays","Weekends","Custom"];
const PERIOD_LABELS = { weekly:"Weekly",fortnightly:"Fortnightly",monthly:"Monthly",quarterly:"Quarterly",halfyearly:"Half-yearly",yearly:"Yearly" };

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

const serverStore = {
  async get(k)   { try{ const r=await window.storage.get(k); return r?JSON.parse(r.value):null; }catch{return null;} },
  async set(k,v) { try{ await window.storage.set(k,JSON.stringify(v)); }catch{} },
  async del(k)   { try{ await window.storage.delete(k); }catch{} },
};
const getStore   = plan => plan==="local" ? idb : serverStore;
const loadUD     = (uid,plan) => getStore(plan).get(`mo:${uid}:data`);
const saveUD     = (uid,plan,d) => getStore(plan).set(`mo:${uid}:data`,d);
const loadAuth   = () => serverStore.get('mo:auth');
const saveAuth   = a => serverStore.set('mo:auth',a);
const clearAuth  = () => serverStore.del('mo:auth');
const loadUsers  = () => serverStore.get('mo:users').then(u=>u||{});
const saveUsers  = u => serverStore.set('mo:users',u);

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
    React.createElement('text',{x:size/2,y:size/2+4,textAnchor:"middle",fontSize:"10",fill:"#3d3530",fontFamily:"'Lora',serif",fontWeight:"600"},`${pct}%`)
  );
};

// ─── AD COMPONENTS ────────────────────────────────────────────────────────────
const AD_COPY = [
  {tag:"Wellness",headline:"Better Sleep Starts Tonight",body:"SleepCycle tracks rest like you track habits.",cta:"Try Free",color:"#a8c5da"},
  {tag:"Fitness", headline:"Level Up Your Runs",         body:"Strava Premium — deeper stats for athletes.",  cta:"Explore",  color:"#81b29a"},
  {tag:"Finance", headline:"Save Without Thinking",      body:"Oportun auto-saves spare change daily.",        cta:"Open",     color:"#f2cc8f"},
];

function AdBanner({onDismiss}) {
  const ad=AD_COPY[0];
  return React.createElement('div',{style:{background:`linear-gradient(135deg,${ad.color}22,${ad.color}44)`,border:`1px solid ${ad.color}88`,borderRadius:12,padding:"10px 14px",display:"flex",alignItems:"center",gap:10,marginBottom:10,position:"relative"}},
    React.createElement('div',{style:{fontSize:20}},"\uD83D\uDCE2"),
    React.createElement('div',{style:{flex:1,minWidth:0}},
      React.createElement('div',{style:{fontSize:9,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)"}},`Sponsored · ${ad.tag}`),
      React.createElement('div',{style:{fontSize:12,fontWeight:600,color:"var(--ink)",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},ad.headline),
    ),
    React.createElement('button',{style:{padding:"5px 10px",borderRadius:7,background:"var(--ink)",color:"white",fontSize:11,fontWeight:600,flexShrink:0}},ad.cta),
    React.createElement('button',{onClick:onDismiss,style:{position:"absolute",top:6,right:8,fontSize:14,color:"var(--muted)",background:"none",border:"none",lineHeight:1,cursor:"pointer"}},"×")
  );
}
function AdInline() {
  const ad=AD_COPY[2];
  return React.createElement('div',{style:{background:"white",border:"1px dashed #e8d9c4",borderRadius:10,padding:"9px 13px",margin:"6px 0",display:"flex",alignItems:"center",gap:10}},
    React.createElement('span',{style:{fontSize:14}},"💡"),
    React.createElement('div',{style:{flex:1,fontSize:12,color:"var(--ink)"}},
      React.createElement('span',{style:{color:"var(--muted)",fontSize:10}},"Ad · "),
      ad.headline," — ",
      React.createElement('span',{style:{color:"#c4622d",fontWeight:600}},ad.cta)
    )
  );
}

// ─── MODALS ───────────────────────────────────────────────────────────────────
function ModalWrap({children,onClose}) {
  return React.createElement('div',{
    style:{position:"fixed",inset:0,background:"rgba(61,53,48,.42)",display:"flex",alignItems:"flex-end",justifyContent:"center",zIndex:200,backdropFilter:"blur(3px)"},
    onClick:e=>e.target===e.currentTarget&&onClose()
  },
    React.createElement('div',{style:{background:"white",borderRadius:"20px 20px 0 0",width:"100%",maxHeight:"90vh",overflowY:"auto",paddingBottom:"calc(16px + env(safe-area-inset-bottom))"}},
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
      React.createElement('textarea',{style:{width:"100%",padding:"11px 14px",border:"1.5px solid #e8d9c4",borderRadius:12,fontSize:14,outline:"none",background:"#faf7f2",resize:"none",lineHeight:1.6,minHeight:90,fontFamily:"'DM Sans',sans-serif"},placeholder:"How did it go? Any notes…",value:note,onChange:e=>setNote(e.target.value)}),
      React.createElement('div',{style:{display:"flex",gap:8,marginTop:12}},
        existing&&React.createElement('button',{onClick:()=>onSave(""),style:{padding:"11px 16px",borderRadius:12,background:"#fdf0ed",color:"#c0392b",fontSize:13,fontWeight:500,border:"none",cursor:"pointer"}},"Clear"),
        React.createElement('button',{onClick:onClose,style:{flex:1,padding:"11px",borderRadius:12,background:"#f5ede0",fontSize:14,fontWeight:500,border:"none",cursor:"pointer"}},"Cancel"),
        React.createElement('button',{onClick:()=>onSave(note),style:{flex:1,padding:"11px",borderRadius:12,background:"#3d3530",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer"}},"Save")
      )
    )
  );
}

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
  const Row=({label,children})=>React.createElement('div',{style:{marginBottom:16}},
    React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:6}},label),
    children
  );
  const Pills=({items,active,onPick,colorFn})=>React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:6}},
    items.map(i=>React.createElement('button',{key:i,onClick:()=>onPick(i),style:{padding:"7px 13px",borderRadius:20,fontSize:13,border:`1.5px solid ${active===i?(colorFn?colorFn(i):"var(--ink)"):"var(--sand)"}`,background:active===i?(colorFn?colorFn(i):"var(--ink)"):"white",color:active===i?"white":(colorFn?colorFn(i):"var(--ink)"),fontWeight:active===i?600:400,transition:"all .15s",fontFamily:"inherit",cursor:"pointer"}},i))
  );
  const MultiPills=({items,active,onToggle})=>React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:6}},
    items.map((item,i)=>React.createElement('button',{key:i,onClick:()=>onToggle(i),style:{padding:"7px 13px",borderRadius:20,fontSize:13,border:"1.5px solid var(--sand)",background:active.includes(i)?"var(--ink)":"white",color:active.includes(i)?"white":"var(--ink)",fontFamily:"inherit",cursor:"pointer"}},item.slice(0,3)))
  );

  return React.createElement(ModalWrap,{onClose},
    React.createElement('div',{style:{padding:"20px 20px 8px"}},
      React.createElement('div',{style:{width:36,height:4,background:"#e8d9c4",borderRadius:2,margin:"0 auto 16px"}}),
      React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:19,fontWeight:700,marginBottom:16}},existing?"Edit Habit":"New Habit"),
      React.createElement(Row,{label:"Name"},
        React.createElement('input',{style:{width:"100%",padding:"11px 14px",border:"1.5px solid #e8d9c4",borderRadius:12,fontSize:14,outline:"none",background:"#faf7f2",fontFamily:"inherit"},placeholder:"e.g. Morning run…",value:name,onChange:e=>setName(e.target.value)})
      ),
      React.createElement(Row,{label:"Category"},
        React.createElement(Pills,{items:CATEGORIES,active:cat,onPick:setCat,colorFn:c=>CAT_COLORS[c]})
      ),
      React.createElement(Row,{label:"Schedule"},
        React.createElement(Pills,{items:SCHED_OPTS,active:sched,onPick:setSched})
      ),
      sched==="Custom"&&React.createElement(Row,{label:"Days"},
        React.createElement(MultiPills,{items:FULL_DAYS,active:cdays,onToggle:tog})
      ),
      React.createElement(Row,{label:"Track Until"},
        React.createElement('div',{style:{display:"flex",gap:6,marginBottom:8}},
          ["Indefinitely","Until a date"].map((l,i)=>React.createElement('button',{key:l,onClick:()=>setHasEnd(i===1),style:{padding:"7px 13px",borderRadius:20,fontSize:13,border:"1.5px solid var(--sand)",background:hasEnd===(i===1)?"var(--ink)":"white",color:hasEnd===(i===1)?"white":"var(--ink)",fontFamily:"inherit",cursor:"pointer"}},l))
        ),
        hasEnd&&React.createElement('input',{type:"date",style:{width:"100%",padding:"11px 14px",border:"1.5px solid #e8d9c4",borderRadius:12,fontSize:14,outline:"none",background:"#faf7f2",fontFamily:"inherit"},value:endDate,min:todayStr(),onChange:e=>setEnd(e.target.value)})
      ),
      React.createElement('div',{style:{display:"flex",gap:8,marginTop:4,paddingBottom:8}},
        React.createElement('button',{onClick:onClose,style:{flex:1,padding:"13px",borderRadius:12,background:"#f5ede0",fontSize:14,fontWeight:500,border:"none",cursor:"pointer"}},"Cancel"),
        React.createElement('button',{onClick:save,style:{flex:2,padding:"13px",borderRadius:12,background:"#c4622d",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer",opacity:name.trim()?1:.45}},existing?"Save Changes":"Add Habit")
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
    React.createElement('button',{onClick:onInstall,style:{padding:"8px 14px",borderRadius:10,background:"#c4622d",color:"white",fontSize:12,fontWeight:700,border:"none",cursor:"pointer"}},"Install"),
    React.createElement('button',{onClick:onDismiss,style:{fontSize:16,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",lineHeight:1}},"×")
  );
}

// ─── OFFLINE BANNER ───────────────────────────────────────────────────────────
function OfflineBanner() {
  return React.createElement('div',{style:{background:"#3d3530",color:"white",textAlign:"center",padding:"8px 16px",fontSize:12,fontWeight:500,display:"flex",alignItems:"center",justifyContent:"center",gap:8}},
    React.createElement('span',null,"📡"),
    "You're offline — data saves locally until reconnected"
  );
}

// ─── UPDATE BANNER ────────────────────────────────────────────────────────────
function UpdateBanner({onUpdate}) {
  return React.createElement('div',{style:{background:"#81b29a",color:"white",textAlign:"center",padding:"8px 16px",fontSize:12,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:10}},
    "✨ New version available!",
    React.createElement('button',{onClick:onUpdate,style:{background:"white",color:"#3a8c5c",padding:"3px 12px",borderRadius:8,fontSize:11,fontWeight:700,border:"none",cursor:"pointer"}},"Update")
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

      React.createElement('div',{style:{background:"#faf7f2",borderRadius:12,padding:"14px",marginBottom:16}},
        React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:4}},"Status"),
        React.createElement('div',{style:{fontSize:14,fontWeight:600}},statusLabel)
      ),

      React.createElement('div',{style:{marginBottom:16}},
        React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:8}},"Daily Reminder Time"),
        React.createElement('div',{style:{display:"flex",alignItems:"center",gap:10}},
          React.createElement('input',{type:"range",min:5,max:22,value:reminderHour,onChange:e=>setHour(parseInt(e.target.value)),style:{flex:1,accentColor:"#c4622d"}}),
          React.createElement('div',{style:{fontSize:15,fontWeight:700,minWidth:50,color:"var(--ink)"}},
            `${reminderHour>12?reminderHour-12:reminderHour||12}:00 ${reminderHour>=12?"PM":"AM"}`
          )
        ),
        React.createElement('button',{onClick:saveReminder,style:{marginTop:10,padding:"9px 18px",borderRadius:10,background:"var(--ink)",color:"white",fontSize:13,fontWeight:600,border:"none",cursor:"pointer"}},saved?"✓ Saved!":"Set Reminder")
      ),

      React.createElement('div',{style:{display:"flex",gap:8,marginTop:8,paddingBottom:8}},
        status==="subscribed"
          ? React.createElement('button',{onClick:disable,style:{flex:1,padding:"13px",borderRadius:12,background:"#fdf0ed",color:"#c0392b",fontSize:14,fontWeight:600,border:"none",cursor:"pointer"}},"Disable Notifications")
          : status!=="denied"&&status!=="unsupported"
            ? React.createElement('button',{onClick:enable,style:{flex:1,padding:"13px",borderRadius:12,background:"#c4622d",color:"white",fontSize:14,fontWeight:700,border:"none",cursor:"pointer"}},"Enable Notifications")
            : React.createElement('div',{style:{flex:1,padding:"13px",borderRadius:12,background:"#f5f0e8",color:"var(--muted)",fontSize:13,textAlign:"center"}},"Open browser settings to enable"),
        React.createElement('button',{onClick:onClose,style:{flex:1,padding:"13px",borderRadius:12,background:"#f5ede0",fontSize:14,fontWeight:500,border:"none",cursor:"pointer"}},"Done")
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

// ─── AUTH ─────────────────────────────────────────────────────────────────────
function AuthPage({mode:im,onAuth,onBack}) {
  const [mode,setMode]=useState(im);
  const [email,setEmail]=useState("");
  const [pw,setPw]=useState("");
  const [name,setName]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const handle=async()=>{
    if(!email.trim()||!pw.trim()) return setErr("Please fill in all fields.");
    if(mode==="signup"&&!name.trim()) return setErr("Please enter your name.");
    if(pw.length<6) return setErr("Password must be 6+ characters.");
    setLoading(true); setErr("");
    const users=await loadUsers();
    if(mode==="login"){
      const u=users[email.toLowerCase()];
      if(!u||u.password!==btoa(pw)){setErr("Invalid email or password.");setLoading(false);return;}
      await saveAuth({uid:u.uid,email:u.email,name:u.name,plan:u.plan,billing:u.billing});
      onAuth(u);
    } else {
      if(users[email.toLowerCase()]){setErr("Email already registered.");setLoading(false);return;}
      const uid=`u_${Date.now()}`;
      const u={uid,email:email.toLowerCase(),name:name.trim(),password:btoa(pw),plan:null,billing:"monthly"};
      users[email.toLowerCase()]=u; await saveUsers(users); onAuth(u);
    }
    setLoading(false);
  };
  const inp=extra=>({style:{width:"100%",padding:"13px 15px",border:"1.5px solid #e8d9c4",borderRadius:14,fontSize:15,outline:"none",background:"#faf7f2",fontFamily:"'DM Sans',sans-serif",marginTop:5},...extra});
  return React.createElement('div',{style:{minHeight:"100%",background:"#faf7f2",display:"flex",flexDirection:"column",padding:"0 24px 24px",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{paddingTop:"calc(16px + env(safe-area-inset-top))"}},
      React.createElement('button',{onClick:onBack,style:{fontSize:13,color:"var(--muted)",marginBottom:24,background:"none",border:"none",cursor:"pointer",display:"flex",alignItems:"center",gap:4}},"← Back"),
      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:8,marginBottom:28}},
        React.createElement('span',{style:{fontSize:22,color:"#c4622d",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
        React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:19}},"Momentum")
      ),
      React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:26,fontWeight:700,marginBottom:6}},mode==="login"?"Welcome back":"Create account"),
      React.createElement('p',{style:{fontSize:14,color:"var(--muted)",marginBottom:28}},mode==="login"?"Sign in to continue.":"Start building better habits today."),
      mode==="signup"&&React.createElement('div',{style:{marginBottom:14}},
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
      err&&React.createElement('div',{style:{background:"#fdf0ed",color:"#c0392b",padding:"11px 14px",borderRadius:10,fontSize:13,marginBottom:16}},err),
      React.createElement('button',{onClick:handle,disabled:loading,style:{width:"100%",padding:"15px",borderRadius:14,background:"#c4622d",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",opacity:loading?.7:1}},loading?"Please wait…":mode==="login"?"Log in →":"Create Account →"),
      React.createElement('div',{style:{textAlign:"center",marginTop:20,fontSize:14,color:"var(--muted)"}},
        mode==="login"?"Don't have an account? ":"Already have an account? ",
        React.createElement('button',{onClick:()=>{setMode(m=>m==="login"?"signup":"login");setErr("");},style:{color:"#c4622d",fontWeight:600,textDecoration:"underline",background:"none",border:"none",cursor:"pointer",fontFamily:"inherit"}},mode==="login"?"Sign up":"Log in")
      )
    )
  );
}

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
function OnboardingPage({user,onComplete}) {
  const [plan,setPlan]=useState("cloud");
  const [billing,setBilling]=useState("monthly");
  const [dc,setDc]=useState(false);
  const [ac,setAc]=useState(false);
  const proceed=async()=>{
    if(plan==="free"&&(!dc||!ac)) return;
    const users=await loadUsers();
    const u={...users[user.email],plan,billing};
    users[user.email]=u; await saveUsers(users); await saveAuth({...user,plan,billing});
    onComplete({...user,plan,billing});
  };
  const pl=(p)=>{ const P=PRICING[p]; return p==="free"?"Free forever":billing==="monthly"?`$${P.monthly}/mo`:`$${P.yearly}/yr`; };
  const PLANS=[
    {key:"free",emoji:"🌱",label:"Free",sub:"Ads · data shared to fund the product",color:"#81b29a"},
    {key:"local",emoji:"💾",label:"Local Pro",sub:"On this device · no ads · offline",color:"#c4a882"},
    {key:"cloud",emoji:"☁️",label:"Cloud Pro",sub:"Private cloud · no ads · multi-device",color:"#c4622d"},
  ];
  return React.createElement('div',{style:{minHeight:"100%",background:"#faf7f2",padding:"calc(20px + env(safe-area-inset-top)) 20px calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{display:"flex",alignItems:"center",gap:8,marginBottom:24}},
      React.createElement('span',{style:{fontSize:20,color:"#c4622d",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
      React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:18}},"Momentum")
    ),
    React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:22,fontWeight:700,marginBottom:4}},`Welcome, ${user.name}! 👋`),
    React.createElement('p',{style:{fontSize:13,color:"var(--muted)",marginBottom:20}},"Choose how your data is stored. You can change this anytime."),
    React.createElement('div',{style:{display:"inline-flex",background:"#f5ede0",border:"1px solid #e8d9c4",borderRadius:30,padding:3,gap:2,marginBottom:16}},
      ["monthly","yearly"].map(b=>React.createElement('button',{key:b,onClick:()=>setBilling(b),style:{padding:"7px 16px",borderRadius:26,fontSize:12,fontWeight:600,background:billing===b?"var(--ink)":"transparent",color:billing===b?"white":"var(--muted)",border:"none",cursor:"pointer",fontFamily:"inherit"}},b.charAt(0).toUpperCase()+b.slice(1)))
    ),
    PLANS.map(p=>React.createElement('div',{key:p.key,onClick:()=>setPlan(p.key),style:{border:`2px solid ${plan===p.key?p.color:"#e8d9c4"}`,borderRadius:14,padding:"13px 15px",cursor:"pointer",background:plan===p.key?`${p.color}08`:"white",transition:"all .15s",display:"flex",alignItems:"center",gap:12,marginBottom:8}},
      React.createElement('span',{style:{fontSize:22}},p.emoji),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontWeight:600,fontSize:14}},p.label),
        React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},p.sub)
      ),
      React.createElement('div',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:14,color:p.color}},pl(p.key)),
      React.createElement('div',{style:{width:18,height:18,borderRadius:"50%",border:`2px solid ${plan===p.key?p.color:"#e8d9c4"}`,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}},
        plan===p.key&&React.createElement('div',{style:{width:8,height:8,borderRadius:"50%",background:p.color}})
      )
    )),
    plan==="free"&&React.createElement('div',{style:{background:"#fef9ee",border:"1px solid #f2cc8f",borderRadius:12,padding:"14px",margin:"12px 0"}},
      React.createElement('div',{style:{fontSize:13,fontWeight:700,marginBottom:8,color:"#3d3530"}},"⚠️ Before you continue"),
      React.createElement('label',{style:{display:"flex",gap:10,alignItems:"flex-start",fontSize:12,marginBottom:8,cursor:"pointer"}},
        React.createElement('input',{type:"checkbox",checked:dc,onChange:e=>setDc(e.target.checked),style:{marginTop:2,flexShrink:0}}),
        React.createElement('span',null,"I agree my habit data may be used for product improvement and targeted marketing.")
      ),
      React.createElement('label',{style:{display:"flex",gap:10,alignItems:"flex-start",fontSize:12,cursor:"pointer"}},
        React.createElement('input',{type:"checkbox",checked:ac,onChange:e=>setAc(e.target.checked),style:{marginTop:2,flexShrink:0}}),
        React.createElement('span',null,"I agree to see personalized ads within Momentum.")
      )
    ),
    React.createElement('button',{onClick:proceed,disabled:plan==="free"&&(!dc||!ac),style:{width:"100%",marginTop:16,padding:"15px",borderRadius:14,background:plan==="free"?"#81b29a":plan==="local"?"#c4a882":"#c4622d",color:"white",fontSize:15,fontWeight:700,border:"none",cursor:"pointer",opacity:(plan==="free"&&(!dc||!ac))?.4:1}},`Start with ${PRICING[plan].label} →`)
  );
}

// ─── LANDING PAGE ─────────────────────────────────────────────────────────────
function LandingPage({onSignup,onLogin}) {
  const [billing,setBilling]=useState("monthly");
  const PLANS=[
    {key:"free",emoji:"🌱",name:"Free",price:"$0",sub:"Ad-supported",color:"#81b29a",features:["All habit features","Ads + data sharing","Server storage"]},
    {key:"local",emoji:"💾",name:"Local Pro",price:billing==="monthly"?"$3/mo":"$29/yr",sub:billing==="yearly"?"Save $7":"Most private",color:"#c4a882",features:["On-device storage","No ads ever","Offline support"]},
    {key:"cloud",emoji:"☁️",name:"Cloud Pro",price:billing==="monthly"?"$4/mo":"$35/yr",sub:billing==="yearly"?"Save $13":"Most popular",color:"#c4622d",features:["Private cloud","No ads ever","Multi-device sync"],badge:true},
  ];
  return React.createElement('div',{style:{minHeight:"100%",background:"#faf7f2",overflowY:"auto",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    // Nav
    React.createElement('div',{style:{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"calc(14px + env(safe-area-inset-top)) 20px 14px",background:"white",borderBottom:"1px solid #ede8e0",position:"sticky",top:0,zIndex:10}},
      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:8}},
        React.createElement('span',{style:{fontSize:18,color:"#c4622d",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
        React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:17}},"Momentum")
      ),
      React.createElement('button',{onClick:onLogin,style:{padding:"8px 18px",borderRadius:10,border:"1.5px solid #e8d9c4",background:"white",fontSize:13,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"Log in")
    ),
    // Hero
    React.createElement('div',{style:{textAlign:"center",padding:"40px 24px 28px"}},
      React.createElement('div',{style:{display:"inline-block",background:"#f5ede0",border:"1px solid #e8d9c4",borderRadius:20,padding:"4px 14px",fontSize:11,fontWeight:700,color:"#c4622d",marginBottom:16,textTransform:"uppercase",letterSpacing:".06em"}},"Daily Habit Tracker"),
      React.createElement('h1',{style:{fontFamily:"'Lora',serif",fontSize:36,fontWeight:700,lineHeight:1.2,marginBottom:14,color:"#3d3530"}},
        "Build habits that ",React.createElement('em',{style:{color:"#c4622d"}},"actually stick.")
      ),
      React.createElement('p',{style:{fontSize:15,color:"#9e8e80",lineHeight:1.65,marginBottom:28,maxWidth:320,margin:"0 auto 28px"}},"Track daily rituals, streaks, and progress — with full control over where your data lives."),
      React.createElement('button',{onClick:onSignup,style:{width:"100%",maxWidth:320,padding:"16px",borderRadius:14,background:"#c4622d",color:"white",fontSize:16,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 20px rgba(196,98,45,.3)"}},"Start for free →"),
      React.createElement('button',{onClick:onLogin,style:{width:"100%",maxWidth:320,padding:"14px",borderRadius:14,border:"1.5px solid #e8d9c4",background:"white",fontSize:15,fontWeight:500,cursor:"pointer",fontFamily:"inherit",marginTop:10,color:"#3d3530"}},"I have an account")
    ),
    // Features
    React.createElement('div',{style:{background:"#f5ede0",borderTop:"1px solid #e8d9c4",borderBottom:"1px solid #e8d9c4",padding:"16px 24px"}},
      React.createElement('div',{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}},
        [["🔥","Streak Tracking"],["📊","6 Report Periods"],["✎","Daily Notes"],["📁","Export CSV & PDF"],["☰","Drag to Reorder"],["🔒","Your Data, Your Rules"]].map(([e,t])=>
          React.createElement('div',{key:t,style:{display:"flex",alignItems:"center",gap:7,fontSize:13,fontWeight:500}},
            React.createElement('span',null,e),React.createElement('span',null,t)
          )
        )
      )
    ),
    // Pricing
    React.createElement('div',{style:{padding:"32px 20px"}},
      React.createElement('h2',{style:{fontFamily:"'Lora',serif",fontSize:24,fontWeight:700,textAlign:"center",marginBottom:6}},"Simple pricing"),
      React.createElement('p',{style:{fontSize:13,color:"#9e8e80",textAlign:"center",marginBottom:20}},"No hidden fees. Cancel anytime."),
      React.createElement('div',{style:{display:"flex",justifyContent:"center",marginBottom:20}},
        React.createElement('div',{style:{display:"inline-flex",background:"#f5ede0",border:"1px solid #e8d9c4",borderRadius:30,padding:3,gap:2}},
          ["monthly","yearly"].map(b=>React.createElement('button',{key:b,onClick:()=>setBilling(b),style:{padding:"7px 16px",borderRadius:26,fontSize:12,fontWeight:600,background:billing===b?"#3d3530":"transparent",color:billing===b?"white":"#9e8e80",border:"none",cursor:"pointer",fontFamily:"inherit"}},b.charAt(0).toUpperCase()+b.slice(1)))
        )
      ),
      PLANS.map(p=>React.createElement('div',{key:p.key,style:{background:"white",borderRadius:16,padding:"20px",marginBottom:12,border:`2px solid ${p.badge?"#c4622d":"#e8d9c4"}`,position:"relative",boxShadow:p.badge?"0 4px 20px rgba(196,98,45,.10)":"none"}},
        p.badge&&React.createElement('div',{style:{position:"absolute",top:-11,right:16,background:"#c4622d",color:"white",fontSize:10,fontWeight:700,padding:"3px 12px",borderRadius:20,textTransform:"uppercase"}},"Popular"),
        React.createElement('div',{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12}},
          React.createElement('div',null,
            React.createElement('div',{style:{fontSize:22,marginBottom:4}},p.emoji),
            React.createElement('div',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:16}},p.name),
            React.createElement('div',{style:{fontSize:11,color:p.color,fontWeight:600}},p.sub)
          ),
          React.createElement('div',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:22,color:p.color}},p.price)
        ),
        p.features.map(f=>React.createElement('div',{key:f,style:{display:"flex",alignItems:"center",gap:7,fontSize:13,marginBottom:5}},
          React.createElement('span',{style:{color:p.color,fontWeight:700}},"✓"),f
        )),
        React.createElement('button',{onClick:onSignup,style:{width:"100%",padding:"12px",borderRadius:12,marginTop:14,background:p.badge?"#c4622d":"#f5ede0",color:p.badge?"white":"#3d3530",fontSize:14,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit"}},"Get started")
      ))
    )
  );
}

// ─── ACCOUNT PAGE ─────────────────────────────────────────────────────────────
function AccountPage({user,onClose,onLogout,onPlanChange,onNotifications}) {
  const [billing,setBilling]=useState(user.billing||"monthly");
  const [saved,setSaved]=useState(false);
  const PC={free:"#81b29a",local:"#c4a882",cloud:"#c4622d"};
  const PE={free:"🌱",local:"💾",cloud:"☁️"};
  const switchPlan=async(p)=>{
    const users=await loadUsers();
    const u={...users[user.email],plan:p,billing};
    users[user.email]=u; await saveUsers(users); await saveAuth({...user,plan:p,billing});
    onPlanChange({...user,plan:p,billing}); setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  const Section=({title,children})=>React.createElement('div',{style:{background:"white",borderRadius:16,padding:"18px 18px",marginBottom:12}},
    React.createElement('div',{style:{fontSize:11,fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",color:"var(--muted)",marginBottom:12}},title),
    children
  );

  return React.createElement('div',{style:{background:"#faf7f2",minHeight:"100%",overflowY:"auto",paddingBottom:"calc(24px + env(safe-area-inset-bottom))"}},
    React.createElement('div',{style:{display:"flex",alignItems:"center",gap:12,padding:"calc(16px + env(safe-area-inset-top)) 18px 16px",background:"white",borderBottom:"1px solid #ede8e0",position:"sticky",top:0,zIndex:10}},
      React.createElement('button',{onClick:onClose,style:{fontSize:22,color:"var(--muted)",background:"none",border:"none",cursor:"pointer",lineHeight:1,marginRight:4}},"←"),
      React.createElement('div',{style:{flex:1}},
        React.createElement('div',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:17}},"Account"),
        React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},[user.name,user.email].filter(Boolean).join(" · "))
      )
    ),
    React.createElement('div',{style:{padding:"16px 16px 0"}},
      React.createElement(Section,{title:"Current Plan"},
        React.createElement('div',{style:{display:"flex",alignItems:"center",gap:12}},
          React.createElement('span',{style:{fontSize:28}},PE[user.plan]),
          React.createElement('div',null,
            React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:16,fontWeight:700,color:PC[user.plan]}},PRICING[user.plan].label),
            React.createElement('div',{style:{fontSize:12,color:"var(--muted)"}},user.plan==="free"?"$0 — ad-supported":user.billing==="monthly"?`$${PRICING[user.plan].monthly}/month`:`$${PRICING[user.plan].yearly}/year`)
          )
        )
      ),
      React.createElement(Section,{title:"Notifications"},
        React.createElement('button',{onClick:onNotifications,style:{width:"100%",padding:"11px",borderRadius:12,background:"#f5ede0",fontSize:14,fontWeight:600,border:"none",cursor:"pointer",textAlign:"left",fontFamily:"inherit",display:"flex",justifyContent:"space-between",alignItems:"center"}},
          React.createElement('span',null,"🔔 Manage Notifications"),
          React.createElement('span',{style:{color:"var(--muted)"}},"›")
        )
      ),
      React.createElement(Section,{title:"Change Plan"},
        React.createElement('div',{style:{display:"flex",gap:6,marginBottom:12}},
          ["monthly","yearly"].map(b=>React.createElement('button',{key:b,onClick:()=>setBilling(b),style:{padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,background:billing===b?"var(--ink)":"#f5ede0",color:billing===b?"white":"var(--muted)",border:"none",cursor:"pointer",fontFamily:"inherit"}},b.charAt(0).toUpperCase()+b.slice(1)))
        ),
        [
          {key:"free",emoji:"🌱",label:"Free",price:"$0",sub:"Ads · data sharing"},
          {key:"local",emoji:"💾",label:"Local Pro",price:billing==="monthly"?`$${PRICING.local.monthly}/mo`:`$${PRICING.local.yearly}/yr`,sub:"Device only · no ads"},
          {key:"cloud",emoji:"☁️",label:"Cloud Pro",price:billing==="monthly"?`$${PRICING.cloud.monthly}/mo`:`$${PRICING.cloud.yearly}/yr`,sub:"Private cloud · no ads"},
        ].map(p=>React.createElement('div',{key:p.key,style:{display:"flex",alignItems:"center",gap:10,padding:"11px 12px",border:`1.5px solid ${user.plan===p.key?PC[p.key]:"#e8d9c4"}`,borderRadius:12,marginBottom:7,background:user.plan===p.key?`${PC[p.key]}08`:"white"}},
          React.createElement('span',null,p.emoji),
          React.createElement('div',{style:{flex:1}},
            React.createElement('div',{style:{fontSize:13,fontWeight:600}},p.label),
            React.createElement('div',{style:{fontSize:11,color:"var(--muted)"}},p.sub)
          ),
          React.createElement('div',{style:{fontWeight:700,fontSize:13,color:PC[p.key]}},p.price),
          user.plan!==p.key
            ? React.createElement('button',{onClick:()=>switchPlan(p.key),style:{padding:"5px 12px",borderRadius:8,background:"#f5ede0",border:"none",fontSize:12,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"Switch")
            : React.createElement('span',{style:{fontSize:11,color:PC[p.key],fontWeight:700}},"✓")
        )),
        saved&&React.createElement('div',{style:{fontSize:13,color:"#3a8c5c",fontWeight:600,marginTop:6}},"✓ Plan updated!")
      ),
      user.plan==="free"&&React.createElement(Section,{title:"Data We Collect"},
        React.createElement('div',{style:{background:"#fef9ee",border:"1px solid #f2cc8f",borderRadius:10,padding:"12px 14px"}},
          React.createElement('ul',{style:{fontSize:12,color:"var(--muted)",paddingLeft:16,lineHeight:1.8}},
            ["Habit names, categories & completion patterns","Usage frequency","Ad interaction data"].map(i=>React.createElement('li',{key:i},i))
          )
        )
      ),
      React.createElement(Section,{title:"Account Actions"},
        React.createElement('button',{onClick:onLogout,style:{width:"100%",padding:"13px",borderRadius:12,background:"#fdf0ed",color:"#c0392b",fontSize:14,fontWeight:700,border:"1px solid #f5c6bb",cursor:"pointer",fontFamily:"inherit"}},"Log out")
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
  const [bannerDismissed,setBD]=useState(false);
  const [installable,setInstallable]=useState(false);
  const [offline,setOffline]=useState(!navigator.onLine);
  const [updateReady,setUpdateReady]=useState(false);
  const [showNotif,setShowNotif]=useState(false);
  const dragIdx=useRef(null),dragOvr=useRef(null);
  const [dragOverState,setDOS]=useState(null);

  const isFree=user.plan==="free";

  useEffect(()=>{
    loadUD(user.uid,user.plan).then(d=>{
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
  },[user.uid,user.plan]);

  const persist=useCallback(async(h,l)=>{
    await saveUD(user.uid,user.plan,{habits:h,logs:l});
    setSaveInd(true); setTimeout(()=>setSaveInd(false),1400);
  },[user.uid,user.plan]);

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

  const PC={free:"#81b29a",local:"#c4a882",cloud:"#c4622d"};

  if(!loaded) return React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#faf7f2",fontFamily:"'Lora',serif",color:"#9e8e80",fontSize:16}},"◆ Loading…");

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
    React.createElement('div',{style:{background:"white",borderBottom:"1px solid #ede8e0",paddingTop:"env(safe-area-inset-top)",flexShrink:0}},
      React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"12px 16px",gap:8}},
        React.createElement('div',{style:{display:"flex",alignItems:"center",gap:7}},
          React.createElement('span',{style:{fontSize:17,color:"#c4622d",fontFamily:"'Lora',serif",fontWeight:700}},"◆"),
          React.createElement('span',{style:{fontFamily:"'Lora',serif",fontWeight:700,fontSize:16}},"Momentum"),
          saveInd&&React.createElement('span',{style:{display:"inline-block",width:6,height:6,borderRadius:"50%",background:"#81b29a",animation:"fd 1.4s forwards"}}),
          React.createElement('span',{style:{fontSize:9,fontWeight:700,padding:"2px 7px",borderRadius:8,background:PC[user.plan]+"22",color:PC[user.plan],border:`1px solid ${PC[user.plan]}44`}},PRICING[user.plan].label)
        ),
        React.createElement('div',{style:{display:"flex",gap:8,alignItems:"center"}},
          React.createElement('button',{onClick:onOpenAccount,style:{width:30,height:30,borderRadius:"50%",background:"#f5ede0",border:"1.5px solid #e8d9c4",fontSize:12,fontWeight:700,color:"var(--ink)",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer"}},user.name.charAt(0).toUpperCase()),
          React.createElement('button',{onClick:()=>{setEditH(null);setShowAdd(true);},style:{padding:"7px 14px",borderRadius:9,background:"#c4622d",color:"white",fontSize:12,fontWeight:700,border:"none",cursor:"pointer",fontFamily:"inherit"}},"+ Add")
        )
      )
    ),

    // Scrollable content
    React.createElement('div',{style:{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch"}},
      React.createElement('div',{style:{padding:"14px 14px 0"}},

        // Install banner
        installable&&!bannerDismissed&&React.createElement(InstallBanner,{
          onInstall:()=>window.MomentumPWA?.triggerInstallPrompt().then(()=>setInstallable(false)),
          onDismiss:()=>setBD(true)
        }),

        // Summary cards
        React.createElement('div',{style:{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:14}},
          [{label:"Today",value:`${doneT}/${todayH.length}`,sub:"done",accent:"#c4622d"},
           {label:"Rate",value:todayH.length?`${Math.round(doneT/todayH.length*100)}%`:"—",sub:"today",accent:"#81b29a"},
           {label:"Streak",value:`${bestStr}d`,sub:"best 🔥",accent:"#f2cc8f"},
           {label:"Active",value:habits.filter(h=>!h.paused).length,sub:"habits",accent:"#a8c5da"},
          ].map(c=>React.createElement('div',{key:c.label,style:{background:"white",borderRadius:12,padding:"12px 14px",boxShadow:"0 1px 4px rgba(61,53,48,.06)",borderLeft:`4px solid ${c.accent}`}},
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
          isFree&&React.createElement(AdBanner,{onDismiss:()=>{}}),
          todayH.length===0
            ? React.createElement('div',{style:{textAlign:"center",padding:"40px 20px",color:"var(--muted)"}},
                React.createElement('div',{style:{fontSize:36,marginBottom:10}},"🌿"),
                React.createElement('p',{style:{fontSize:14,fontWeight:500}},"No habits today"),
                React.createElement('p',{style:{fontSize:12,marginTop:4}},"Tap '+ Add' to get started.")
              )
            : todayH.map((h,ti)=>{
                const gi=habits.indexOf(h),done=logs[h.id]?.dates?.[today]?.done,note=logs[h.id]?.dates?.[today]?.note,str=streak(h,logs),wr=compRate(h,logs,weekDates(0));
                return React.createElement('div',{key:h.id},
                  isFree&&ti>0&&ti%3===0&&React.createElement(AdInline),
                  React.createElement('div',{
                    className:`h-row${dragOverState===gi?" dov":""}`,
                    style:{background:"white",borderRadius:12,padding:"12px 13px",marginBottom:8,display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 4px rgba(61,53,48,.06)",border:`2px solid ${dragOverState===gi?"#c4a882":"transparent"}`,opacity:done?.62:1,transition:"border .15s"},
                    draggable:true,onDragStart:()=>onDS(gi),onDragEnter:()=>onDE(gi),onDragEnd:onDEnd,onDragOver:e=>e.preventDefault()
                  },
                    React.createElement('span',{style:{cursor:"grab",color:"#e8d9c4",fontSize:14,flexShrink:0,userSelect:"none"}},"☰"),
                    React.createElement('div',{
                      style:{width:24,height:24,borderRadius:7,border:`2px solid ${done?"#c4622d":"#e8d9c4"}`,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,background:done?"#c4622d":"white",transition:"all .18s"},
                      onClick:()=>toggle(h.id,today)
                    },done&&React.createElement('svg',{width:"11",height:"9",viewBox:"0 0 11 9"},React.createElement('polyline',{points:"1,4.5 4,7.5 10,1",stroke:"white",strokeWidth:"2.2",fill:"none",strokeLinecap:"round",strokeLinejoin:"round"}))),
                    React.createElement('div',{style:{flex:1,minWidth:0}},
                      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}},
                        React.createElement('span',{style:{fontSize:14,fontWeight:500,textDecoration:done?"line-through":"none",color:done?"var(--muted)":"var(--ink)",-overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"calc(100% - 80px)"}},h.name),
                        str>0&&React.createElement('span',{style:{display:"inline-flex",alignItems:"center",gap:2,background:"#fff5ee",border:"1.5px solid #f5cba7",borderRadius:20,padding:"1px 7px",fontSize:11,fontWeight:700,color:"#c4622d",flexShrink:0}},"🔥",str)
                      ),
                      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}},
                        React.createElement('span',{style:{fontSize:10,color:"var(--muted)"}},[h.category,h.schedule].join(" · ")),
                        React.createElement('button',{
                          onClick:()=>setNoteM({habitId:h.id,date:today,habitName:h.name}),
                          style:{fontSize:10,padding:"2px 7px",borderRadius:7,border:`1px solid ${note?"#f2cc8f":"#e8d9c4"}`,color:note?"#8a6c2a":"var(--muted)",background:note?"#fef9ee":"white",cursor:"pointer",fontFamily:"inherit",whiteSpace:"nowrap"}
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
              React.createElement('button',{onClick:()=>setWOff(o=>o-1),style:{padding:"5px 10px",borderRadius:10,border:"1.5px solid #e8d9c4",fontSize:12,background:"white",cursor:"pointer",fontFamily:"inherit"}},"←"),
              wOff!==0&&React.createElement('button',{onClick:()=>setWOff(0),style:{padding:"5px 10px",borderRadius:10,border:"1.5px solid var(--ink)",fontSize:11,background:"var(--ink)",color:"white",cursor:"pointer",fontFamily:"inherit"}},"Today"),
              React.createElement('button',{onClick:()=>setWOff(o=>o+1),disabled:wOff>=0,style:{padding:"5px 10px",borderRadius:10,border:"1.5px solid #e8d9c4",fontSize:12,background:"white",cursor:"pointer",fontFamily:"inherit",opacity:wOff>=0?.35:1}},"→")
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
                  React.createElement('td',{style:{background:"white",padding:"8px 8px 8px 10px",borderRadius:"10px 0 0 10px"}},
                    React.createElement('div',{style:{display:"flex",alignItems:"center",gap:5}},
                      React.createElement('span',{style:{width:7,height:7,borderRadius:"50%",background:CAT_COLORS[h.category],flexShrink:0}}),
                      React.createElement('span',{style:{fontSize:11,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:80}},h.name)
                    )
                  ),
                  wDates.map(d=>{const ap=habitOn(h,d),done=logs[h.id]?.dates?.[d]?.done,hn=!!logs[h.id]?.dates?.[d]?.note,fut=d>today;return React.createElement('td',{key:d,style:{background:"white",padding:"8px 3px",textAlign:"center"}},
                    ap
                      ? React.createElement('div',{style:{display:"flex",flexDirection:"column",alignItems:"center",gap:2}},
                          React.createElement('div',{style:{width:20,height:20,borderRadius:5,border:`2px solid ${done?"#c4622d":"#e8d9c4"}`,display:"flex",alignItems:"center",justifyContent:"center",background:done?"#c4622d":"white",cursor:fut?"default":"pointer",opacity:fut?.35:1},onClick:()=>!fut&&toggle(h.id,d)},
                            done&&React.createElement('svg',{width:"9",height:"7",viewBox:"0 0 9 7"},React.createElement('polyline',{points:"1,3.5 3.5,6 8,1",stroke:"white",strokeWidth:"2",fill:"none",strokeLinecap:"round",strokeLinejoin:"round"}))
                          ),
                          !fut&&React.createElement('span',{style:{fontSize:8,color:hn?"#8a6c2a":"#d4c9ba",cursor:"pointer"},onClick:()=>setNoteM({habitId:h.id,date:d,habitName:h.name})},hn?"📝":"✎")
                        )
                      : React.createElement('span',{style:{color:"#e0d5c5",fontSize:10}},"–")
                  );}),
                  React.createElement('td',{style:{background:"white",padding:"8px 6px",borderRadius:"0 10px 10px 0",textAlign:"center"}},React.createElement(Ring,{pct:compRate(h,logs,wDates),color:CAT_COLORS[h.category],size:34}))
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
              React.createElement('button',{onClick:()=>exportCSV(habits,logs,rDates,rPeriod),style:{padding:"6px 12px",borderRadius:9,border:"1.5px solid #e8d9c4",background:"white",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"↓ CSV"),
              React.createElement('button',{onClick:()=>exportPDF(habits,logs,rDates,rPeriod),style:{padding:"6px 12px",borderRadius:9,border:"1.5px solid #e8d9c4",background:"white",fontSize:11,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}},"↓ PDF")
            )
          ),
          React.createElement('div',{style:{display:"flex",flexWrap:"wrap",gap:5,marginBottom:12}},
            Object.entries(PERIOD_LABELS).map(([p,l])=>React.createElement('button',{key:p,onClick:()=>setRPeriod(p),style:{padding:"5px 11px",borderRadius:20,fontSize:11,border:"1.5px solid #e8d9c4",background:rPeriod===p?"var(--ink)":"white",color:rPeriod===p?"white":"var(--ink)",fontFamily:"inherit",cursor:"pointer",fontWeight:rPeriod===p?600:400}},l))
          ),
          habits.length===0
            ? React.createElement('div',{style:{textAlign:"center",padding:"40px",color:"var(--muted)"}},React.createElement('div',{style:{fontSize:32,marginBottom:8}},"📊"),React.createElement('p',null,"Add habits to see reports."))
            : React.createElement('div',null,
                // Overall
                (()=>{const tA=habits.reduce((s,h)=>s+rDates.filter(d=>habitOn(h,d)).length,0),tD=habits.reduce((s,h)=>s+rDates.filter(d=>habitOn(h,d)&&logs[h.id]?.dates?.[d]?.done).length,0),pct=tA?Math.round(tD/tA*100):0;
                return React.createElement('div',{style:{background:"linear-gradient(135deg,#fdf6ee,#f5ede0)",borderRadius:14,padding:"16px",marginBottom:12,boxShadow:"0 1px 4px rgba(61,53,48,.06)"}},
                  React.createElement('div',{style:{fontFamily:"'Lora',serif",fontSize:13,fontWeight:700,marginBottom:8}},"Overall — "+PERIOD_LABELS[rPeriod]),
                  React.createElement('div',{style:{display:"flex",alignItems:"center",gap:12}},
                    React.createElement(Ring,{pct,color:"#c4622d",size:50}),
                    React.createElement('div',null,
                      React.createElement('div',{style:{fontSize:13,fontWeight:600}},[tD,"of",tA,"habit-days"].join(" ")),
                      React.createElement('div',{style:{fontSize:11,color:"var(--muted)",marginTop:2}},rDates[0]+" → "+rDates[rDates.length-1])
                    )
                  )
                );})(),
                // Per habit
                habits.map(h=>{const app=rDates.filter(d=>habitOn(h,d)),done=app.filter(d=>logs[h.id]?.dates?.[d]?.done),pct=app.length?Math.round(done.length/app.length*100):null,str=streak(h,logs),nd=app.filter(d=>logs[h.id]?.dates?.[d]?.note);
                return React.createElement('div',{key:h.id,style:{background:"white",borderRadius:12,padding:"14px",marginBottom:8,boxShadow:"0 1px 4px rgba(61,53,48,.06)"}},
                  React.createElement('div',{style:{display:"flex",alignItems:"center",gap:10}},
                    React.createElement(Ring,{pct,color:CAT_COLORS[h.category],size:40}),
                    React.createElement('div',{style:{flex:1,minWidth:0}},
                      React.createElement('div',{style:{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap",marginBottom:3}},
                        React.createElement('span',{style:{fontWeight:600,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:160}},h.name),
                        str>0&&React.createElement('span',{style:{fontSize:11,color:"#c4622d",fontWeight:700}},"🔥"+str)
                      ),
                      React.createElement('div',{style:{height:6,borderRadius:3,background:"#e8d9c4",overflow:"hidden"}},React.createElement('div',{style:{height:6,borderRadius:3,background:CAT_COLORS[h.category],width:`${pct||0}%`,transition:"width .5s"}})),
                      React.createElement('div',{style:{fontSize:10,color:"var(--muted)",marginTop:3}},[done.length+"/"+app.length+" days",h.schedule].join(" · ")),
                      nd.length>0&&nd.slice(-2).map(d=>React.createElement('div',{key:d,style:{display:"flex",gap:6,marginTop:5,background:"#fef9ee",borderRadius:7,padding:"5px 9px",fontSize:11}},
                        React.createElement('span',{style:{color:"var(--muted)",flexShrink:0}},new Date(d+"T00:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})),
                        React.createElement('span',{style:{color:"#6b4c35",fontStyle:"italic",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},'"'+logs[h.id].dates[d].note+'"')
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
                style:{background:"white",borderRadius:12,padding:"11px 13px",marginBottom:7,display:"flex",alignItems:"center",gap:9,boxShadow:"0 1px 4px rgba(61,53,48,.06)",border:`2px solid ${dragOverState===i?"#c4a882":"transparent"}`,transition:"border .15s"},
                draggable:true,onDragStart:()=>onDS(i),onDragEnter:()=>onDE(i),onDragEnd:onDEnd,onDragOver:e=>e.preventDefault()
              },
                React.createElement('span',{style:{cursor:"grab",color:"#e8d9c4",fontSize:14,flexShrink:0,userSelect:"none"}},"☰"),
                React.createElement('span',{style:{width:9,height:9,borderRadius:"50%",background:CAT_COLORS[h.category],flexShrink:0}}),
                React.createElement('div',{style:{flex:1,minWidth:0}},
                  React.createElement('div',{style:{fontSize:13,fontWeight:500,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}},h.name),
                  React.createElement('div',{style:{fontSize:10,color:"var(--muted)",marginTop:1}},[h.category,h.schedule].join(" · "))
                ),
                h.paused&&React.createElement('span',{style:{fontSize:10,background:"#f5f0e8",color:"#9e8e80",padding:"2px 7px",borderRadius:8,flexShrink:0}},"Paused"),
                React.createElement('button',{onClick:()=>{const nh=habits.map(x=>x.id===h.id?{...x,paused:!x.paused}:x);updH(nh);},style:{padding:"5px 9px",borderRadius:8,border:"1.5px solid #e8d9c4",fontSize:10,fontWeight:600,background:"white",cursor:"pointer",fontFamily:"inherit",flexShrink:0}},h.paused?"Resume":"Pause"),
                React.createElement('button',{onClick:()=>{setEditH(h);setShowAdd(true);},style:{padding:"5px 9px",borderRadius:8,border:"1.5px solid #e8d9c4",fontSize:10,fontWeight:600,background:"white",cursor:"pointer",fontFamily:"inherit",flexShrink:0}},"Edit"),
                React.createElement('button',{onClick:()=>delHabit(h.id),style:{padding:"5px 9px",borderRadius:8,border:"1.5px solid #f5c6bb",fontSize:10,fontWeight:600,background:"#fdf0ed",color:"#c0392b",cursor:"pointer",fontFamily:"inherit",flexShrink:0}},"Del")
              ))
        )
      )
    ),

    // Bottom navigation
    React.createElement('div',{style:{background:"white",borderTop:"1px solid #ede8e0",display:"flex",paddingBottom:"env(safe-area-inset-bottom)",flexShrink:0}},
      NAV.map(n=>React.createElement('button',{key:n.key,onClick:()=>setView(n.key),style:{flex:1,padding:"10px 4px 8px",display:"flex",flexDirection:"column",alignItems:"center",gap:3,background:"none",border:"none",cursor:"pointer",fontFamily:"inherit",transition:"all .15s"}},
        React.createElement('span',{style:{fontSize:18,filter:view===n.key?"none":"grayscale(100%) opacity(50%)",transition:"filter .2s"}},n.icon),
        React.createElement('span',{style:{fontSize:10,fontWeight:view===n.key?700:400,color:view===n.key?"#c4622d":"#9e8e80",transition:"color .2s"}},n.label)
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
    loadAuth().then(auth=>{
      if(auth?.uid&&auth?.plan){setUser(auth);setScreen("app");}
      else if(auth?.uid){setUser(auth);setScreen("onboarding");}
      else setScreen("landing");
    });
  },[]);

  if(screen==="loading") return React.createElement('div',{style:{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#c4622d",color:"white",fontFamily:"'Lora',serif",fontSize:18,gap:8}},
    React.createElement('span',null,"◆"),React.createElement('span',null,"Momentum")
  );
  if(screen==="landing") return React.createElement(LandingPage,{onSignup:()=>{setAuthMode("signup");setScreen("auth");},onLogin:()=>{setAuthMode("login");setScreen("auth");}});
  if(screen==="auth")    return React.createElement(AuthPage,{mode:authMode,onAuth:u=>{setUser(u);setScreen(u.plan?"app":"onboarding");},onBack:()=>setScreen("landing")});
  if(screen==="onboarding") return React.createElement(OnboardingPage,{user,onComplete:u=>{setUser(u);setScreen("app");}});
  if(screen==="account") return React.createElement('div',{style:{height:"100%",overflowY:"auto"}},
    React.createElement(AccountPage,{user,onClose:()=>setScreen("app"),onLogout:async()=>{await clearAuth();setUser(null);setScreen("landing");},onPlanChange:u=>{setUser(u);setScreen("app");},onNotifications:()=>setShowNotif(true)}),
    showNotif&&React.createElement(NotificationSettings,{onClose:()=>setShowNotif(false)})
  );
  if(screen==="app") return React.createElement(HabitApp,{user,onLogout:async()=>{await clearAuth();setUser(null);setScreen("landing");},onOpenAccount:()=>setScreen("account"),onPlanChange:u=>setUser(u)});
  return null;
}

// Mount
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
