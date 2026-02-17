import { useState, useEffect, useCallback, useRef } from "react";
import { db, ref, onValue, set } from "./firebase";

// ── FIXED TRIP METADATA ──────────────────────────────────────────
const TRIP = {
  tripName:    "VIAJE RIVER sweet 30's",
  destination: "Malasia",
  dates:       "03/07 - 16/07",
  groupName:   "RIVERLAND",
};

const C = {
  sand: "#F5EFE0", clay: "#C8A87A", bark: "#5C3D2E", moss: "#3D6B4F",
  sky: "#4A7FA5", sunset: "#D4704A", cream: "#FAF7F0", ink: "#1A1208",
  light: "#EDE8DC", amber: "#E8B84B",
};

const CAT = {
  comida:      { bg: "#FFF0D5", color: "#B06020", emoji: "🍽" },
  transporte:  { bg: "#E8F5FF", color: "#2060A0", emoji: "🚗" },
  alojamiento: { bg: "#F0FFF0", color: "#206020", emoji: "🏠" },
  ocio:        { bg: "#FFF0FF", color: "#8020A0", emoji: "🎉" },
  otro:        { bg: "#F5F5F5", color: "#606060", emoji: "📦" },
};

const IDEA_COLORS = {
  yellow: { bg: "#FFFBE6", border: "#F0D060", label: "💡 Idea" },
  green:  { bg: "#F0FAF2", border: "#80C890", label: "🍴 Restaurante" },
  blue:   { bg: "#EEF5FB", border: "#80AED0", label: "📍 Lugar" },
  pink:   { bg: "#FDF0F5", border: "#E8A0C0", label: "🎉 Plan" },
  orange: { bg: "#FFF4EE", border: "#E8A870", label: "🏨 Alojamiento" },
};

const AVATAR_BG = ["#4A7FA5","#3D6B4F","#D4704A","#8B5E8A","#C8A87A","#4A8A7A","#A05050","#507050"];

const DEFAULT_DATA = {
  members: [],
  days: [
    { id: 1, title: "Llegada", activities: [
      { id: 1, time: "10:00", text: "Llegada al aeropuerto", color: C.sky },
      { id: 2, time: "15:00", text: "Check-in alojamiento", color: C.moss },
      { id: 3, time: "20:00", text: "Cena de bienvenida 🥂", color: C.sunset },
    ]},
  ],
  ideas: [],
  expenses: [],
  checklist: [
    { id: 1, text: "Pasaporte / DNI", done: false },
    { id: 2, text: "Tarjeta de crédito", done: false },
    { id: 3, text: "Cargador", done: false },
    { id: 4, text: "Adaptador de enchufe", done: false },
    { id: 5, text: "Protector solar", done: false },
  ],
  preList: [
    { id: 1, text: "Reservar alojamiento", done: false },
    { id: 2, text: "Comprar seguro de viaje", done: false },
    { id: 3, text: "Cambiar divisas (Ringgit)", done: false },
    { id: 4, text: "Visado (comprobar requisitos)", done: false },
  ],
};

let nextId = 1000;
const uid = () => ++nextId;

// ── DEBT SETTLEMENT ──────────────────────────────────────────────
function calcSettlement(members, expenses) {
  const balance = {};
  members.forEach(m => { balance[m] = 0; });
  expenses.forEach(exp => {
    const amount = parseFloat(exp.amount) || 0;
    const payer = exp.paidBy;
    const splitters = exp.splitWith && exp.splitWith.length > 0 ? exp.splitWith : members;
    const share = amount / splitters.length;
    if (payer in balance) balance[payer] += amount;
    splitters.forEach(m => { if (m in balance) balance[m] -= share; });
  });
  const creditors = [], debtors = [];
  Object.entries(balance).forEach(([name, bal]) => {
    if (bal > 0.01) creditors.push({ name, amount: bal });
    else if (bal < -0.01) debtors.push({ name, amount: -bal });
  });
  creditors.sort((a,b) => b.amount - a.amount);
  debtors.sort((a,b) => b.amount - a.amount);
  const transactions = [];
  let ci = 0, di = 0;
  const cC = creditors.map(x=>({...x})), dC = debtors.map(x=>({...x}));
  while (ci < cC.length && di < dC.length) {
    const c = cC[ci], d = dC[di];
    const amount = Math.min(c.amount, d.amount);
    if (amount > 0.01) transactions.push({ from: d.name, to: c.name, amount });
    c.amount -= amount; d.amount -= amount;
    if (c.amount < 0.01) ci++;
    if (d.amount < 0.01) di++;
  }
  return { balance, transactions };
}

// ── APP ──────────────────────────────────────────────────────────
export default function App() {
  const [data, setData]               = useState(null);
  const [tab, setTab]                 = useState("itinerario");
  const [toast, setToast]             = useState("");
  const [openDays, setOpenDays]       = useState({});
  const [saving, setSaving]           = useState(false);
  const [userName, setUserName]       = useState("");
  const [nameInput, setNameInput]     = useState("");
  const [nameSet, setNameSet]         = useState(false);
  const [editingExpense, setEditExp]  = useState(null);
  const isSaving                      = useRef(false);
  const dbRef                         = useRef(ref(db, "viaje"));

  // ── Firebase realtime listener ──
  useEffect(() => {
    const stored = localStorage.getItem("vg_riverland_name");
    if (stored) { setUserName(stored); setNameSet(true); }

    const unsub = onValue(dbRef.current, (snapshot) => {
      const val = snapshot.val();
      if (val) {
        setData(val);
      } else {
        // First time: write defaults
        set(dbRef.current, DEFAULT_DATA);
        setData(DEFAULT_DATA);
      }
    });
    return () => unsub();
  }, []);

  // ── Auto-register member when name is known and data loads ──
  useEffect(() => {
    if (!data || !userName || !nameSet) return;
    if (!data.members) return;
    if (!data.members.includes(userName)) {
      const updated = { ...data, members: [...data.members, userName] };
      set(dbRef.current, updated);
    }
  }, [data?.members?.length, userName, nameSet]); // eslint-disable-line

  const saveToFirebase = useCallback((newData) => {
    if (isSaving.current) return;
    isSaving.current = true;
    setSaving(true);
    set(dbRef.current, newData).finally(() => {
      isSaving.current = false;
      setSaving(false);
    });
  }, []);

  const update = useCallback((fn) => {
    setData(prev => {
      const next = fn(structuredClone(prev));
      saveToFirebase(next);
      return next;
    });
  }, [saveToFirebase]);

  const showToast = (msg = "✓ Guardado") => {
    setToast(msg); setTimeout(() => setToast(""), 2200);
  };

  const handleSetName = () => {
    const name = nameInput.trim();
    if (!name) return;
    localStorage.setItem("vg_riverland_name", name);
    setUserName(name);
    setNameSet(true);
  };

  // ── NAME GATE ──
  if (!nameSet) return (
    <div style={{minHeight:"100vh",background:C.bark,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
      <div style={{background:C.cream,borderRadius:24,padding:"40px 28px",maxWidth:360,width:"100%",textAlign:"center",boxShadow:"0 20px 60px rgba(0,0,0,0.35)"}}>
        <div style={{fontSize:52,marginBottom:12}}>🌴</div>
        <div style={{fontFamily:"Georgia,serif",fontSize:"1.8rem",fontWeight:700,color:C.bark,marginBottom:6}}>¡Hola, RIVERLAND!</div>
        <div style={{fontSize:"0.88rem",color:"#8A7050",marginBottom:26,lineHeight:1.6}}>¿Cómo te llamas?<br/>Los demás verán quién anotó cada cosa.</div>
        <input value={nameInput} onChange={e=>setNameInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleSetName()}
          placeholder="Tu nombre..." autoFocus
          style={{width:"100%",padding:"13px 16px",borderRadius:12,border:`2px solid ${C.light}`,fontSize:"1rem",outline:"none",marginBottom:13,background:C.sand,color:C.ink,boxSizing:"border-box"}}/>
        <button onClick={handleSetName}
          style={{width:"100%",padding:13,borderRadius:12,background:C.bark,color:C.sand,border:"none",fontSize:"1rem",fontWeight:600,cursor:"pointer"}}>
          Entrar al viaje →
        </button>
      </div>
    </div>
  );

  if (!data) return (
    <div style={{minHeight:"100vh",background:C.cream,display:"flex",alignItems:"center",justifyContent:"center",flexDirection:"column",gap:16}}>
      <div style={{fontSize:40}}>🌀</div>
      <div style={{color:C.clay}}>Cargando...</div>
    </div>
  );

  const totalExp = (data.expenses||[]).reduce((s,e)=>s+(parseFloat(e.amount)||0),0);
  const { balance, transactions } = calcSettlement(data.members||[], data.expenses||[]);

  const TABS = [
    {id:"itinerario", label:"📅 Itinerario"},
    {id:"ideas",      label:"💡 Ideas"},
    {id:"gastos",     label:"💸 Gastos"},
    {id:"checklist",  label:"✅ Lista"},
  ];

  const AddBtn = ({onClick, children, style={}}) => (
    <button onClick={onClick} style={{display:"flex",alignItems:"center",gap:7,padding:"8px 16px",borderRadius:100,border:`1.5px dashed ${C.clay}`,background:"transparent",color:C.clay,fontSize:"0.82rem",fontWeight:500,cursor:"pointer",...style}}>
      {children}
    </button>
  );

  return (
    <div style={{minHeight:"100vh",background:C.cream,color:C.ink}}>
      <style>{`
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:'DM Sans',sans-serif}
        input,textarea,select{font-family:'DM Sans',sans-serif}
        input:focus,textarea:focus,select:focus{outline:none}
        ::-webkit-scrollbar{height:4px;width:4px}
        ::-webkit-scrollbar-thumb{background:#C8A87A;border-radius:4px}
        .row-hov:hover{background:#F8F4EC;cursor:pointer}
        .tab-btn:hover{background:#EDE8DC!important;color:#5C3D2E!important}
        .add-btn:hover{border-color:#5C3D2E!important;color:#5C3D2E!important;background:#F5EFE0!important}
        .idea-card{transition:transform 0.15s,box-shadow 0.15s}
        .idea-card:hover{transform:translateY(-3px);box-shadow:0 8px 24px rgba(0,0,0,0.1)}
        @keyframes slideUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        .toast-anim{animation:slideUp 0.25s ease}
        .pulse{animation:pulse 1.5s ease-in-out infinite}
        .modal-bg{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:200;display:flex;align-items:flex-end;justify-content:center}
        @media(min-width:600px){.modal-bg{align-items:center}}
        .modal-box{background:#FAF7F0;border-radius:24px 24px 0 0;width:100%;max-width:540px;max-height:92vh;overflow-y:auto;padding:26px 20px 44px;animation:slideUp 0.3s ease}
        @media(min-width:600px){.modal-box{border-radius:24px}}
      `}</style>

      {/* ── HERO ── */}
      <div style={{position:"relative",padding:"44px 20px 32px",textAlign:"center",overflow:"hidden",minHeight:210,
        background:"linear-gradient(180deg,#0D4F6B 0%,#1A7A8A 25%,#2AA5A0 45%,#48C4A8 58%,#C8A96A 72%,#D4956A 82%,#8B5E3C 100%)"}}>
        <div style={{position:"absolute",inset:0,background:"radial-gradient(ellipse at 30% 40%,rgba(255,220,100,0.15) 0%,transparent 60%),radial-gradient(ellipse at 70% 60%,rgba(0,120,140,0.2) 0%,transparent 50%)"}}/>
        <div style={{position:"absolute",top:"54%",left:0,right:0,height:3,background:"rgba(255,255,255,0.18)",filter:"blur(2px)"}}/>
        <div style={{position:"absolute",bottom:0,left:0,right:0,height:50,background:"linear-gradient(transparent,rgba(80,130,80,0.4))"}}/>
        <div style={{position:"relative",zIndex:1}}>
          <div style={{color:"#fff",fontFamily:"Georgia,serif",fontSize:"clamp(1.5rem,6vw,2.6rem)",fontWeight:700,letterSpacing:"0.04em",textShadow:"0 2px 12px rgba(0,0,0,0.5)",textTransform:"uppercase",marginBottom:14}}>
            {TRIP.tripName}
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"center",flexWrap:"nowrap",overflowX:"auto"}}>
            {[["📍",TRIP.destination],["📅",TRIP.dates],["👥",TRIP.groupName]].map(([emoji,val])=>(
              <span key={val} style={{background:"rgba(255,255,255,0.18)",border:"1px solid rgba(255,255,255,0.35)",color:"#fff",padding:"6px 14px",borderRadius:100,fontSize:"0.8rem",whiteSpace:"nowrap",backdropFilter:"blur(8px)",textShadow:"0 1px 4px rgba(0,0,0,0.3)"}}>
                {emoji} {val}
              </span>
            ))}
          </div>
          <div style={{marginTop:12,fontSize:"0.7rem",color:"rgba(255,255,255,0.65)",display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
            {saving
              ? <><span className="pulse" style={{width:6,height:6,borderRadius:"50%",background:C.amber,display:"inline-block"}}/>Guardando...</>
              : <><span style={{width:6,height:6,borderRadius:"50%",background:"#80C890",display:"inline-block"}}/>Sincronizado · {userName}</>}
          </div>
        </div>
      </div>

      {/* ── TABS ── */}
      <div style={{display:"flex",gap:2,padding:"10px 12px 0",background:C.sand,borderBottom:`2px solid ${C.light}`,overflowX:"auto"}}>
        {TABS.map(t=>(
          <button key={t.id} className="tab-btn" onClick={()=>setTab(t.id)}
            style={{padding:"8px 14px",borderRadius:"10px 10px 0 0",fontSize:"0.82rem",fontWeight:500,cursor:"pointer",whiteSpace:"nowrap",border:`2px solid ${tab===t.id?C.light:"transparent"}`,borderBottom:tab===t.id?`2px solid ${C.cream}`:"2px solid transparent",background:tab===t.id?C.cream:"transparent",color:tab===t.id?C.bark:"#8B7355",marginBottom:tab===t.id?-2:0}}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── CONTENT ── */}
      <div style={{maxWidth:820,margin:"0 auto",padding:"22px 13px 80px"}}>

        {/* ITINERARIO */}
        {tab==="itinerario" && (
          <div>
            {(data.days||[]).map((day,di)=>{
              const open = openDays[day.id]!==false;
              return (
                <div key={day.id} style={{background:"white",borderRadius:16,border:`1.5px solid ${C.light}`,marginBottom:11,boxShadow:"0 2px 12px rgba(90,60,30,0.06)",overflow:"hidden"}}>
                  <div onClick={()=>setOpenDays(p=>({...p,[day.id]:!open}))} style={{display:"flex",alignItems:"center",gap:12,padding:"13px 17px",cursor:"pointer"}}>
                    <div style={{width:38,height:38,background:C.bark,borderRadius:10,display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"Georgia,serif",fontSize:"1.1rem",fontWeight:700,color:C.sand,flexShrink:0}}>{di+1}</div>
                    <div style={{flex:1}}>
                      <input value={day.title} onClick={e=>e.stopPropagation()} onChange={e=>update(d=>{d.days[di].title=e.target.value;return d;})}
                        style={{background:"transparent",border:"none",fontFamily:"Georgia,serif",fontSize:"0.95rem",fontWeight:500,color:C.bark,width:"100%"}} placeholder="Título del día"/>
                      <div style={{fontSize:"0.7rem",color:"#A08060",marginTop:1}}>{(day.activities||[]).filter(a=>a.text).length} actividades</div>
                    </div>
                    <div style={{color:C.clay,fontSize:"0.8rem"}}>{open?"▲":"▼"}</div>
                  </div>
                  {open&&(
                    <div style={{padding:"0 17px 13px",borderTop:`1px solid ${C.light}`}}>
                      {(day.activities||[]).map((act,ai)=>(
                        <div key={act.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 0",borderBottom:`1px dashed ${C.light}`}}>
                          <input type="time" value={act.time} onChange={e=>update(d=>{d.days[di].activities[ai].time=e.target.value;return d;})}
                            style={{border:"none",background:"transparent",color:C.clay,fontSize:"0.72rem",fontWeight:500,minWidth:48}}/>
                          <div style={{width:7,height:7,borderRadius:"50%",background:act.color||C.sky,flexShrink:0}}/>
                          <input value={act.text} onChange={e=>update(d=>{d.days[di].activities[ai].text=e.target.value;return d;})}
                            style={{flex:1,border:"none",background:"transparent",fontSize:"0.85rem",color:C.ink}} placeholder="¿Qué haréis?"/>
                          <span onClick={()=>update(d=>{d.days[di].activities.splice(ai,1);return d;})} style={{cursor:"pointer",color:"#DDD",fontSize:"0.76rem"}}>✕</span>
                        </div>
                      ))}
                      <div style={{display:"flex",gap:8,marginTop:9,flexWrap:"wrap"}}>
                        <AddBtn onClick={()=>update(d=>{d.days[di].activities.push({id:uid(),time:"12:00",text:"",color:C.sky});return d;})}>＋ Actividad</AddBtn>
                        <AddBtn onClick={()=>update(d=>{d.days.splice(di,1);return d;})} style={{borderColor:"#E07070",color:"#E07070"}}>🗑 Día</AddBtn>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <AddBtn onClick={()=>update(d=>{d.days.push({id:uid(),title:"Nuevo día",activities:[{id:uid(),time:"10:00",text:"",color:C.sky}]});return d;})}>＋ Añadir día</AddBtn>
          </div>
        )}

        {/* IDEAS */}
        {tab==="ideas" && (
          <div>
            <div style={{background:"white",borderRadius:16,border:`1.5px solid ${C.light}`,padding:16,marginBottom:16,boxShadow:"0 2px 12px rgba(90,60,30,0.06)"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",fontWeight:500,color:C.bark,marginBottom:3}}>💡 Tablero de ideas</div>
              <div style={{fontSize:"0.77rem",color:"#9A8060"}}>Añade ideas y vota las que más os gusten. Se sincroniza al momento.</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:10}}>
              {(data.ideas||[]).map((idea,i)=>{
                const s=IDEA_COLORS[idea.color]||IDEA_COLORS.yellow;
                return (
                  <div key={idea.id} className="idea-card" style={{background:s.bg,border:`1.5px solid ${s.border}`,borderRadius:14,padding:14,position:"relative"}}>
                    <div onClick={()=>{update(d=>{const v=d.ideas[i].voters||[];if(!v.includes(userName)){d.ideas[i].votes=(d.ideas[i].votes||0)+1;d.ideas[i].voters=[...v,userName];}return d;});showToast("👍 Votado!");}}
                      style={{position:"absolute",top:10,right:10,background:"rgba(0,0,0,0.07)",borderRadius:100,padding:"3px 9px",fontSize:"0.7rem",cursor:"pointer",display:"flex",alignItems:"center",gap:3}}>
                      👍 {idea.votes||0}
                    </div>
                    <div style={{fontSize:"0.67rem",fontWeight:600,color:"#9A7850",marginBottom:7,textTransform:"uppercase",letterSpacing:"0.05em"}}>{s.label}</div>
                    <textarea value={idea.text} onChange={e=>update(d=>{d.ideas[i].text=e.target.value;return d;})}
                      style={{width:"100%",minHeight:66,background:"transparent",border:"none",fontSize:"0.85rem",lineHeight:1.5,resize:"none",color:C.ink}} placeholder="Tu idea..."/>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginTop:6}}>
                      <div style={{fontSize:"0.68rem",color:"#9A8A6A"}}>✏️ {idea.author}</div>
                      <span onClick={()=>update(d=>{d.ideas.splice(i,1);return d;})} style={{fontSize:"0.7rem",cursor:"pointer",color:"#CCC"}}>✕</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:13}}>
              {Object.entries(IDEA_COLORS).map(([color,s])=>(
                <AddBtn key={color} onClick={()=>update(d=>{d.ideas.push({id:uid(),color,text:"",author:userName,votes:0,voters:[]});return d;})}>
                  {s.label}
                </AddBtn>
              ))}
            </div>
          </div>
        )}

        {/* GASTOS */}
        {tab==="gastos" && (
          <div>
            {/* Miembros */}
            <div style={{background:"white",borderRadius:16,border:`1.5px solid ${C.light}`,padding:16,marginBottom:13,boxShadow:"0 2px 12px rgba(90,60,30,0.06)"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"0.98rem",fontWeight:500,color:C.bark,marginBottom:11}}>👥 En el viaje</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                {(data.members||[]).length===0
                  ? <div style={{fontSize:"0.82rem",color:"#9A8060",fontStyle:"italic"}}>Nadie se ha unido aún. Comparte el enlace con el grupo.</div>
                  : (data.members||[]).map((m,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:6,background:m===userName?"rgba(92,61,46,0.1)":C.sand,border:`1.5px solid ${m===userName?C.bark:C.light}`,borderRadius:100,padding:"6px 12px"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:AVATAR_BG[i%AVATAR_BG.length],display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"0.65rem",fontWeight:700,flexShrink:0}}>{m[0]?.toUpperCase()}</div>
                      <span style={{fontSize:"0.82rem",fontWeight:500,color:m===userName?C.bark:C.ink}}>{m}{m===userName?" (tú)":""}</span>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Resumen */}
            <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:9,marginBottom:13}}>
              {[["Total",totalExp.toFixed(2)+"€"],["Por persona",(totalExp/((data.members||[]).length||1)).toFixed(2)+"€"],["Gastos",(data.expenses||[]).length]].map(([label,val])=>(
                <div key={label} style={{background:C.sand,borderRadius:13,padding:"13px 10px",textAlign:"center"}}>
                  <div style={{fontFamily:"Georgia,serif",fontSize:"1.35rem",fontWeight:700,color:C.bark}}>{val}</div>
                  <div style={{fontSize:"0.68rem",color:"#8A7050",marginTop:2}}>{label}</div>
                </div>
              ))}
            </div>

            {/* Lista gastos */}
            <div style={{background:"white",borderRadius:16,border:`1.5px solid ${C.light}`,padding:16,marginBottom:13,boxShadow:"0 2px 12px rgba(90,60,30,0.06)"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"0.98rem",fontWeight:500,color:C.bark,marginBottom:13}}>💸 Gastos</div>
              {(data.expenses||[]).length===0 && <div style={{textAlign:"center",color:"#9A8060",fontSize:"0.84rem",padding:18}}>Sin gastos todavía</div>}
              {(data.expenses||[]).map((exp,i)=>{
                const cat=CAT[exp.cat]||CAT.otro;
                const sw=exp.splitWith?.length||(data.members||[]).length;
                const share=(parseFloat(exp.amount)||0)/(sw||1);
                return (
                  <div key={exp.id} className="row-hov" onClick={()=>setEditExp(i)}
                    style={{display:"flex",alignItems:"center",gap:9,padding:"10px 7px",borderBottom:`1px solid ${C.light}`,borderRadius:8,transition:"background 0.15s"}}>
                    <div style={{width:32,height:32,background:cat.bg,borderRadius:9,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"1rem",flexShrink:0}}>{cat.emoji}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:500,fontSize:"0.86rem",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{exp.desc||"Sin descripción"}</div>
                      <div style={{fontSize:"0.7rem",color:"#9A8060",marginTop:1}}>Pagó <b>{exp.paidBy||"?"}</b> · {sw} personas · <b>{share.toFixed(2)}€</b>/c.u.</div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontFamily:"Georgia,serif",fontSize:"1rem",fontWeight:600,color:C.bark}}>{(parseFloat(exp.amount)||0).toFixed(2)}€</div>
                      <div style={{fontSize:"0.65rem",color:"#B0A080"}}>✏️ editar</div>
                    </div>
                  </div>
                );
              })}
              <AddBtn style={{marginTop:13}} onClick={()=>{
                const idx=(data.expenses||[]).length;
                update(d=>{if(!d.expenses)d.expenses=[];d.expenses.push({id:uid(),desc:"",cat:"otro",amount:0,paidBy:userName,splitWith:[...(d.members||[])]});return d;});
                setEditExp(idx);
              }}>＋ Añadir gasto</AddBtn>
            </div>

            {/* Ajuste de cuentas */}
            <div style={{background:"white",borderRadius:16,border:`1.5px solid ${C.light}`,padding:16,boxShadow:"0 2px 12px rgba(90,60,30,0.06)"}}>
              <div style={{fontFamily:"Georgia,serif",fontSize:"0.98rem",fontWeight:500,color:C.bark,marginBottom:3}}>⚖️ Ajuste de cuentas</div>
              <div style={{fontSize:"0.73rem",color:"#9A8060",marginBottom:15}}>Transferencias mínimas para quedar a cero</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:7,marginBottom:16}}>
                {(data.members||[]).map((m,i)=>{
                  const bal=balance[m]||0;
                  const pos=bal>0.01, neg=bal<-0.01;
                  return (
                    <div key={m} style={{display:"flex",alignItems:"center",gap:6,background:pos?"#F0FFF4":neg?"#FFF0F0":C.sand,border:`1.5px solid ${pos?"#80C890":neg?"#F0A0A0":C.light}`,borderRadius:100,padding:"6px 12px"}}>
                      <div style={{width:22,height:22,borderRadius:"50%",background:AVATAR_BG[i%AVATAR_BG.length],display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"0.68rem",fontWeight:700,flexShrink:0}}>{m[0]?.toUpperCase()}</div>
                      <span style={{fontSize:"0.8rem",fontWeight:500}}>{m}</span>
                      <span style={{fontSize:"0.8rem",fontWeight:700,color:pos?C.moss:neg?C.sunset:"#9A8060"}}>{pos?"+":""}{bal.toFixed(2)}€</span>
                    </div>
                  );
                })}
              </div>
              {transactions.length===0
                ? <div style={{textAlign:"center",background:"#F0FFF4",borderRadius:12,padding:16,color:C.moss,fontSize:"0.86rem",fontWeight:500}}>✅ ¡Todo cuadrado! No hay deudas pendientes.</div>
                : transactions.map((t,i)=>{
                  const fi=(data.members||[]).indexOf(t.from);
                  const ti=(data.members||[]).indexOf(t.to);
                  return (
                    <div key={i} style={{display:"flex",alignItems:"center",gap:9,padding:"12px 13px",marginBottom:7,background:C.sand,borderRadius:13,border:`1.5px solid ${C.light}`}}>
                      <div style={{width:30,height:30,borderRadius:"50%",background:AVATAR_BG[fi%AVATAR_BG.length]||"#888",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"0.72rem",fontWeight:700,flexShrink:0}}>{t.from[0]?.toUpperCase()}</div>
                      <div style={{flex:1}}>
                        <span style={{fontWeight:600,fontSize:"0.86rem"}}>{t.from}</span>
                        <span style={{color:"#9A8060",fontSize:"0.82rem"}}> → </span>
                        <span style={{fontWeight:600,fontSize:"0.86rem"}}>{t.to}</span>
                      </div>
                      <div style={{fontFamily:"Georgia,serif",fontSize:"1.05rem",fontWeight:700,color:C.bark,flexShrink:0}}>{t.amount.toFixed(2)}€</div>
                      <div style={{width:30,height:30,borderRadius:"50%",background:AVATAR_BG[ti%AVATAR_BG.length]||"#888",display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"0.72rem",fontWeight:700,flexShrink:0}}>{t.to[0]?.toUpperCase()}</div>
                    </div>
                  );
                })
              }
            </div>
          </div>
        )}

        {/* CHECKLIST */}
        {tab==="checklist" && (
          <div>
            {[{title:"🎒 ¿Qué llevamos?",key:"checklist"},{title:"📋 Antes de salir",key:"preList"}].map(({title,key})=>(
              <div key={key} style={{background:"white",borderRadius:16,border:`1.5px solid ${C.light}`,padding:16,marginBottom:13,boxShadow:"0 2px 12px rgba(90,60,30,0.06)"}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:"0.98rem",fontWeight:500,color:C.bark,marginBottom:13}}>{title}</div>
                {(data[key]||[]).map((item,i)=>(
                  <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:`1px dashed ${C.light}`}}>
                    <div onClick={()=>{update(d=>{d[key][i].done=!d[key][i].done;return d;});showToast(item.done?"Desmarcado":"✓ Hecho!");}}
                      style={{width:21,height:21,borderRadius:7,border:`2px solid ${item.done?C.moss:C.clay}`,background:item.done?C.moss:"transparent",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",flexShrink:0,color:"white",fontSize:"0.7rem",transition:"all 0.15s"}}>
                      {item.done&&"✓"}
                    </div>
                    <input value={item.text} onChange={e=>update(d=>{d[key][i].text=e.target.value;return d;})}
                      style={{flex:1,border:"none",background:"transparent",fontSize:"0.86rem",color:C.ink,textDecoration:item.done?"line-through":"none",opacity:item.done?0.4:1}} placeholder="Añadir elemento..."/>
                    <span onClick={()=>update(d=>{d[key].splice(i,1);return d;})} style={{cursor:"pointer",color:"#DDD",fontSize:"0.76rem"}}>✕</span>
                  </div>
                ))}
                <AddBtn style={{marginTop:11}} onClick={()=>update(d=>{if(!d[key])d[key]=[];d[key].push({id:uid(),text:"",done:false});return d;})}>＋ Añadir</AddBtn>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* MODAL EDITAR GASTO */}
      {editingExpense!==null && (data.expenses||[])[editingExpense] && (()=>{
        const exp=(data.expenses||[])[editingExpense];
        const i=editingExpense;
        const upd=(fn)=>update(d=>{fn(d.expenses[i]);return d;});
        return (
          <div className="modal-bg" onClick={()=>setEditExp(null)}>
            <div className="modal-box" onClick={e=>e.stopPropagation()}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20}}>
                <div style={{fontFamily:"Georgia,serif",fontSize:"1.15rem",fontWeight:600,color:C.bark}}>✏️ Editar gasto</div>
                <button onClick={()=>setEditExp(null)} style={{background:"transparent",border:"none",fontSize:"1.2rem",cursor:"pointer",color:"#9A8060"}}>✕</button>
              </div>
              <div style={{marginBottom:13}}>
                <div style={{fontSize:"0.7rem",fontWeight:600,color:C.clay,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Descripción</div>
                <input value={exp.desc} onChange={e=>upd(ex=>{ex.desc=e.target.value;})}
                  style={{width:"100%",padding:"11px 14px",borderRadius:12,border:`1.5px solid ${C.light}`,fontSize:"0.9rem",background:C.sand}} placeholder="¿En qué se gastó?"/>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:13}}>
                <div>
                  <div style={{fontSize:"0.7rem",fontWeight:600,color:C.clay,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Importe (€)</div>
                  <input type="number" value={exp.amount} onChange={e=>upd(ex=>{ex.amount=parseFloat(e.target.value)||0;})}
                    style={{width:"100%",padding:"11px 14px",borderRadius:12,border:`1.5px solid ${C.light}`,fontSize:"1.1rem",fontFamily:"Georgia,serif",fontWeight:600,color:C.bark,background:C.sand}} min="0" step="0.01"/>
                </div>
                <div>
                  <div style={{fontSize:"0.7rem",fontWeight:600,color:C.clay,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:6}}>Categoría</div>
                  <select value={exp.cat} onChange={e=>upd(ex=>{ex.cat=e.target.value;})}
                    style={{width:"100%",padding:"11px 14px",borderRadius:12,border:`1.5px solid ${C.light}`,fontSize:"0.87rem",background:C.sand,cursor:"pointer"}}>
                    {Object.entries(CAT).map(([k,v])=><option key={k} value={k}>{v.emoji} {k.charAt(0).toUpperCase()+k.slice(1)}</option>)}
                  </select>
                </div>
              </div>
              <div style={{marginBottom:15}}>
                <div style={{fontSize:"0.7rem",fontWeight:600,color:C.clay,textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:8}}>¿Quién pagó?</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {(data.members||[]).map((m,mi)=>(
                    <div key={m} onClick={()=>upd(ex=>{ex.paidBy=m;})}
                      style={{display:"flex",alignItems:"center",gap:5,padding:"6px 13px",borderRadius:100,border:`2px solid ${exp.paidBy===m?C.bark:C.light}`,background:exp.paidBy===m?C.bark:"transparent",cursor:"pointer",transition:"all 0.15s"}}>
                      <div style={{width:19,height:19,borderRadius:"50%",background:AVATAR_BG[mi%AVATAR_BG.length],display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"0.62rem",fontWeight:700}}>{m[0]?.toUpperCase()}</div>
                      <span style={{fontSize:"0.82rem",fontWeight:500,color:exp.paidBy===m?C.sand:C.ink}}>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                  <div style={{fontSize:"0.7rem",fontWeight:600,color:C.clay,textTransform:"uppercase",letterSpacing:"0.05em"}}>¿Quién lo consume?</div>
                  <div style={{display:"flex",gap:7}}>
                    <button onClick={()=>upd(ex=>{ex.splitWith=[...(data.members||[])];})} style={{fontSize:"0.7rem",color:C.sky,background:"transparent",border:`1px solid ${C.sky}`,borderRadius:100,padding:"2px 8px",cursor:"pointer"}}>Todos</button>
                    <button onClick={()=>upd(ex=>{ex.splitWith=[];})} style={{fontSize:"0.7rem",color:C.sunset,background:"transparent",border:`1px solid ${C.sunset}`,borderRadius:100,padding:"2px 8px",cursor:"pointer"}}>Ninguno</button>
                  </div>
                </div>
                <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
                  {(data.members||[]).map((m,mi)=>{
                    const sel=(exp.splitWith||[]).includes(m);
                    return (
                      <div key={m} onClick={()=>upd(ex=>{const s=[...(ex.splitWith||[])];const idx=s.indexOf(m);if(idx>-1)s.splice(idx,1);else s.push(m);ex.splitWith=s;})}
                        style={{display:"flex",alignItems:"center",gap:5,padding:"6px 13px",borderRadius:100,border:`2px solid ${sel?C.moss:C.light}`,background:sel?"#EEF9EF":"transparent",cursor:"pointer",transition:"all 0.15s"}}>
                        <div style={{width:19,height:19,borderRadius:"50%",background:AVATAR_BG[mi%AVATAR_BG.length],display:"flex",alignItems:"center",justifyContent:"center",color:"white",fontSize:"0.62rem",fontWeight:700}}>{m[0]?.toUpperCase()}</div>
                        <span style={{fontSize:"0.82rem",fontWeight:500,color:sel?C.moss:C.ink}}>{m}</span>
                        {sel&&<span style={{fontSize:"0.65rem",color:C.moss}}>✓</span>}
                      </div>
                    );
                  })}
                </div>
                {(exp.splitWith?.length||0)>0&&(
                  <div style={{marginTop:10,padding:"8px 12px",background:C.sand,borderRadius:10,fontSize:"0.77rem",color:"#8A7050"}}>
                    <b>{(parseFloat(exp.amount)||0).toFixed(2)}€</b> ÷ {exp.splitWith.length} = <b>{((parseFloat(exp.amount)||0)/exp.splitWith.length).toFixed(2)}€ por persona</b>
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:9}}>
                <button onClick={()=>{showToast("✓ Guardado");setEditExp(null);}}
                  style={{flex:1,padding:"13px",borderRadius:12,background:C.bark,color:C.sand,border:"none",fontSize:"0.9rem",fontWeight:600,cursor:"pointer"}}>
                  Guardar
                </button>
                <button onClick={()=>{update(d=>{d.expenses.splice(i,1);return d;});setEditExp(null);showToast("🗑 Eliminado");}}
                  style={{padding:"13px 16px",borderRadius:12,background:"#FFF0F0",color:C.sunset,border:`1.5px solid #F0C0C0`,fontSize:"0.88rem",cursor:"pointer"}}>
                  🗑
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* TOAST */}
      {toast&&(
        <div className="toast-anim" style={{position:"fixed",bottom:22,right:14,background:C.bark,color:C.sand,padding:"10px 18px",borderRadius:100,fontSize:"0.82rem",fontWeight:500,boxShadow:"0 4px 20px rgba(0,0,0,0.2)",zIndex:999}}>
          {toast}
        </div>
      )}
    </div>
  );
}
