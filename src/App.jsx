
import { useState, useEffect, useCallback, useMemo, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";

// ─── CONFIG — substitui com os teus dados do Supabase ────────
const SUPABASE_URL  = https://xxxxxxxxx.supabase.co;
const SUPABASE_ANON = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtzdWpmbHZqYmpwb3djaW1xcGllIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4ODcxNjAsImV4cCI6MjA5MzQ2MzE2MH0.6kMZqY5c0L969DC83vk3gkp5cUAQYXtt4efd2E_TXQg ;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── UTILS ───────────────────────────────────────────────────
const genId    = () => crypto.randomUUID();
const today    = () => new Date().toISOString().split("T")[0];
const nowTime  = () => new Date().toTimeString().slice(0,5);
const addDays  = (d,n) => { const dt=new Date(d+"T00:00:00"); dt.setDate(dt.getDate()+n); return dt.toISOString().split("T")[0]; };
const fmtDate  = d => d ? new Date(d+"T00:00:00").toLocaleDateString("pt-PT") : "—";
const fmtCur   = v => `€${Number(v||0).toFixed(2)}`;
const weekStart = date => { const d=new Date(date+"T00:00:00"); const day=d.getDay(); d.setDate(d.getDate()-day+(day===0?-6:1)); return d.toISOString().split("T")[0]; };
const durMins  = (a,b) => { if(!a||!b) return null; const [ah,am]=a.split(":").map(Number),[bh,bm]=b.split(":").map(Number); const m=(bh*60+bm)-(ah*60+am); return m>0?m:null; };
const fmtDur   = m => m ? `${Math.floor(m/60)}h${String(m%60).padStart(2,"0")}` : null;
const mo       = d => d?d.slice(0,7):"";

// ─── CONSTANTS ───────────────────────────────────────────────
const SVC_TYPES = ["mudança","entrega","last-mile","b2b","outro"];
const SVC_ST    = ["pendente","confirmado","em curso","concluído","cancelado"];
const DRV_ST    = ["disponível","em serviço","folga","inativo"];
const VEH_TYPES = ["Carrinha Pequena","Carrinha Média","Carrinha Grande","Camião"];
const EXP_CATS  = ["combustível","portagens","manutenção","pneus","seguro","limpeza","multas","outros"];
const SC = { pendente:"#f59e0b",confirmado:"#3b82f6","em curso":"#8b5cf6",concluído:"#10b981",cancelado:"#ef4444",disponível:"#10b981","em serviço":"#8b5cf6",folga:"#f59e0b",inativo:"#94a3b8",manutenção:"#ef4444" };
const PC = ["#f59e0b","#3b82f6","#10b981","#8b5cf6","#ef4444","#06b6d4"];

// ─── DB HELPERS ──────────────────────────────────────────────
// Mapeia snake_case (Supabase) ↔ camelCase (app)
const mapSvc = r => r ? ({
  id:r.id, clientId:r.client_id, driverId:r.driver_id, vehicleId:r.vehicle_id,
  type:r.type, status:r.status, date:r.date, time:r.time?.slice(0,5),
  origin:r.origin, destination:r.destination, price:Number(r.price||0),
  notes:r.notes||"", startTime:r.start_time?.slice(0,5)||null,
  endTime:r.end_time?.slice(0,5)||null, km:r.km, createdAt:r.created_at?.split("T")[0]
}) : null;

const mapClient = r => r ? ({
  id:r.id, name:r.name, phone:r.phone||"", email:r.email||"",
  address:r.address||"", nif:r.nif||"", notes:r.notes||"",
  createdAt:r.created_at?.split("T")[0]
}) : null;

const mapDriver = r => r ? ({
  id:r.id, name:r.name, phone:r.phone||"", email:r.email||"",
  license:r.license||"B", status:r.status||"disponível",
  joinDate:r.join_date, notes:r.notes||""
}) : null;

const mapVehicle = r => r ? ({
  id:r.id, plate:r.plate, model:r.model, type:r.type,
  status:r.status, year:r.year, km:r.km||0,
  nextService:r.next_service, notes:r.notes||""
}) : null;

const mapInvoice = r => r ? ({
  id:r.id, serviceId:r.service_id, clientId:r.client_id,
  number:r.number, amount:Number(r.amount), vatRate:r.vat_rate,
  date:r.date, dueDate:r.due_date, status:r.status, notes:r.notes||""
}) : null;

const mapExpense = r => r ? ({
  id:r.id, vehicleId:r.vehicle_id, category:r.category,
  amount:Number(r.amount), date:r.date, notes:r.notes||"",
  createdAt:r.created_at?.split("T")[0]
}) : null;

// ─── AUTH CONTEXT ─────────────────────────────────────────────
const AuthCtx = createContext(null);

function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadProfile = useCallback(async (uid) => {
    const { data: prof } = await supabase.from("profiles").select("*").eq("id", uid).single();
    if (prof) {
      setProfile(prof);
      if (prof.company_id) {
        const { data: comp } = await supabase.from("companies").select("*").eq("id", prof.company_id).single();
        if (comp) setCompany(comp);
      }
    }
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id).finally(() => setLoading(false));
      else setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
      else { setProfile(null); setCompany(null); }
    });
    return () => subscription.unsubscribe();
  }, [loadProfile]);

  const signUp = async (email, password, fullName, companyName) => {
    const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
    if (error) throw error;
    // Cria empresa
    const { data: comp, error: compErr } = await supabase.from("companies").insert({ name: companyName }).select().single();
    if (compErr) throw compErr;
    // Liga utilizador à empresa
    await supabase.from("profiles").update({ company_id: comp.id, full_name: fullName }).eq("id", data.user.id);
    setCompany(comp);
    return data;
  };

  const signIn = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null); setProfile(null); setCompany(null);
  };

  const updateCompany = async (fields) => {
    if (!company?.id) return;
    const { data } = await supabase.from("companies").update(fields).eq("id", company.id).select().single();
    if (data) setCompany(data);
  };

  return (
    <AuthCtx.Provider value={{ user, profile, company, loading, signUp, signIn, signOut, updateCompany }}>
      {children}
    </AuthCtx.Provider>
  );
}

const useAuth = () => useContext(AuthCtx);

// ─── DATA CONTEXT ─────────────────────────────────────────────
const DataCtx = createContext(null);

function DataProvider({ children }) {
  const { company } = useAuth();
  const cid = company?.id;

  const [clients,  setClients]  = useState([]);
  const [drivers,  setDrivers]  = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [services, setServices] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  // ── Carrega todos os dados ────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!cid) return;
    setDataLoading(true);
    const [c, d, v, s, i, e] = await Promise.all([
      supabase.from("clients").select("*").eq("company_id", cid).order("name"),
      supabase.from("drivers").select("*").eq("company_id", cid).order("name"),
      supabase.from("vehicles").select("*").eq("company_id", cid).order("plate"),
      supabase.from("services").select("*").eq("company_id", cid).order("date", { ascending: false }),
      supabase.from("invoices").select("*").eq("company_id", cid).order("created_at", { ascending: false }),
      supabase.from("expenses").select("*").eq("company_id", cid).order("date", { ascending: false }),
    ]);
    setClients((c.data||[]).map(mapClient));
    setDrivers((d.data||[]).map(mapDriver));
    setVehicles((v.data||[]).map(mapVehicle));
    setServices((s.data||[]).map(mapSvc));
    setInvoices((i.data||[]).map(mapInvoice));
    setExpenses((e.data||[]).map(mapExpense));
    setDataLoading(false);
  }, [cid]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Realtime subscriptions ────────────────────────────────
  useEffect(() => {
    if (!cid) return;
    const channel = supabase.channel(`company-${cid}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "services",  filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "drivers",   filter: `company_id=eq.${cid}` }, () => loadAll())
      .on("postgres_changes", { event: "*", schema: "public", table: "vehicles",  filter: `company_id=eq.${cid}` }, () => loadAll())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [cid, loadAll]);

  // ── CRUD — Clientes ───────────────────────────────────────
  const saveClient = async (cl) => {
    const row = { company_id:cid, name:cl.name, phone:cl.phone, email:cl.email, address:cl.address, nif:cl.nif, notes:cl.notes };
    if (cl.id) {
      await supabase.from("clients").update(row).eq("id", cl.id);
      setClients(p => p.map(c => c.id===cl.id ? {...c,...cl} : c));
    } else {
      const { data } = await supabase.from("clients").insert(row).select().single();
      if (data) setClients(p => [...p, mapClient(data)]);
    }
  };
  const deleteClient = async (id) => { await supabase.from("clients").delete().eq("id", id); setClients(p=>p.filter(c=>c.id!==id)); };

  // ── CRUD — Motoristas ─────────────────────────────────────
  const saveDriver = async (dr) => {
    const row = { company_id:cid, name:dr.name, phone:dr.phone, email:dr.email, license:dr.license, status:dr.status, join_date:dr.joinDate, notes:dr.notes };
    if (dr.id) {
      await supabase.from("drivers").update(row).eq("id", dr.id);
      setDrivers(p => p.map(d => d.id===dr.id ? {...d,...dr} : d));
    } else {
      const { data } = await supabase.from("drivers").insert(row).select().single();
      if (data) setDrivers(p => [...p, mapDriver(data)]);
    }
  };
  const deleteDriver = async (id) => { await supabase.from("drivers").delete().eq("id", id); setDrivers(p=>p.filter(d=>d.id!==id)); };

  // ── CRUD — Viaturas ───────────────────────────────────────
  const saveVehicle = async (v) => {
    const row = { company_id:cid, plate:v.plate, model:v.model, type:v.type, status:v.status, year:v.year, km:v.km, next_service:v.nextService||null, notes:v.notes };
    if (v.id) {
      await supabase.from("vehicles").update(row).eq("id", v.id);
      setVehicles(p => p.map(x => x.id===v.id ? {...x,...v} : x));
    } else {
      const { data } = await supabase.from("vehicles").insert(row).select().single();
      if (data) setVehicles(p => [...p, mapVehicle(data)]);
    }
  };
  const deleteVehicle = async (id) => { await supabase.from("vehicles").delete().eq("id", id); setVehicles(p=>p.filter(v=>v.id!==id)); };

  // ── CRUD — Serviços ───────────────────────────────────────
  const saveService = async (s) => {
    const row = { company_id:cid, client_id:s.clientId, driver_id:s.driverId||null, vehicle_id:s.vehicleId||null, type:s.type, status:s.status, date:s.date, time:s.time, origin:s.origin, destination:s.destination, price:s.price, notes:s.notes, start_time:s.startTime||null, end_time:s.endTime||null, km:s.km||null };
    if (s.id) {
      await supabase.from("services").update(row).eq("id", s.id);
      setServices(p => p.map(x => x.id===s.id ? {...x,...s} : x));
    } else {
      const { data } = await supabase.from("services").insert(row).select().single();
      if (data) setServices(p => [mapSvc(data), ...p]);
    }
  };
  const deleteService = async (id) => { await supabase.from("services").delete().eq("id", id); setServices(p=>p.filter(s=>s.id!==id)); };
  const updateServiceStatus = async (id, status, extra={}) => {
    const upd = { status, ...extra };
    await supabase.from("services").update(upd).eq("id", id);
    setServices(p => p.map(s => s.id===id ? {...s,...upd} : s));
  };

  // ── CRUD — Faturas ────────────────────────────────────────
  const saveInvoice = async (inv) => {
    const row = { company_id:cid, service_id:inv.serviceId, client_id:inv.clientId, number:inv.number, amount:inv.amount, vat_rate:inv.vatRate, date:inv.date, due_date:inv.dueDate, status:inv.status, notes:inv.notes };
    if (inv.id) {
      await supabase.from("invoices").update(row).eq("id", inv.id);
      setInvoices(p => p.map(i => i.id===inv.id ? {...i,...inv} : i));
    } else {
      const { data } = await supabase.from("invoices").insert(row).select().single();
      if (data) setInvoices(p => [mapInvoice(data), ...p]);
    }
  };
  const toggleInvoicePaid = async (id) => {
    const inv = invoices.find(i=>i.id===id);
    const newStatus = inv.status==="pago"?"pendente":"pago";
    await supabase.from("invoices").update({ status:newStatus }).eq("id", id);
    setInvoices(p => p.map(i => i.id===id ? {...i,status:newStatus} : i));
  };

  // ── CRUD — Despesas ───────────────────────────────────────
  const saveExpense = async (ex) => {
    const row = { company_id:cid, vehicle_id:ex.vehicleId||null, category:ex.category, amount:ex.amount, date:ex.date, notes:ex.notes };
    if (ex.id) {
      await supabase.from("expenses").update(row).eq("id", ex.id);
      setExpenses(p => p.map(e => e.id===ex.id ? {...e,...ex} : e));
    } else {
      const { data } = await supabase.from("expenses").insert(row).select().single();
      if (data) setExpenses(p => [mapExpense(data), ...p]);
    }
  };
  const deleteExpense = async (id) => { await supabase.from("expenses").delete().eq("id", id); setExpenses(p=>p.filter(e=>e.id!==id)); };

  return (
    <DataCtx.Provider value={{
      clients, drivers, vehicles, services, invoices, expenses, dataLoading, loadAll,
      saveClient, deleteClient,
      saveDriver, deleteDriver,
      saveVehicle, deleteVehicle,
      saveService, deleteService, updateServiceStatus,
      saveInvoice, toggleInvoicePaid,
      saveExpense, deleteExpense,
    }}>
      {children}
    </DataCtx.Provider>
  );
}

const useData = () => useContext(DataCtx);

// ─── UI PRIMITIVES ───────────────────────────────────────────
const Badge = ({status}) => { const c=SC[status]||"#94a3b8"; return <span style={{background:c+"22",color:c,border:`1px solid ${c}44`,padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:"0.3px",whiteSpace:"nowrap"}}>{status}</span>; };
const Modal = ({title,onClose,children,wide}) => (
  <div style={{position:"fixed",inset:0,background:"rgba(15,23,42,0.75)",zIndex:1000,display:"flex",alignItems:"center",justifyContent:"center",padding:12}} onClick={e=>e.target===e.currentTarget&&onClose()}>
    <div style={{background:"white",borderRadius:20,width:"100%",maxWidth:wide?800:520,maxHeight:"92vh",overflow:"auto",boxShadow:"0 32px 80px rgba(0,0,0,0.4)"}}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"15px 22px",borderBottom:"1px solid #f1f5f9",position:"sticky",top:0,background:"white",zIndex:2}}>
        <h2 style={{margin:0,fontSize:17,fontWeight:900,color:"#0f172a"}}>{title}</h2>
        <button onClick={onClose} style={{background:"#f1f5f9",border:"none",borderRadius:8,width:34,height:34,cursor:"pointer",fontSize:20,color:"#64748b",display:"flex",alignItems:"center",justifyContent:"center"}}>×</button>
      </div>
      <div style={{padding:"20px 22px"}}>{children}</div>
    </div>
  </div>
);
const Toast = ({msg,type}) => <div style={{position:"fixed",bottom:76,left:"50%",transform:"translateX(-50%)",background:type==="error"?"#ef4444":type==="info"?"#3b82f6":"#10b981",color:"white",padding:"11px 22px",borderRadius:40,fontSize:14,fontWeight:700,zIndex:2000,whiteSpace:"nowrap",boxShadow:"0 8px 24px rgba(0,0,0,0.25)"}}>{msg}</div>;
const Spin = () => <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:40}}><div style={{width:28,height:28,border:"3px solid #f1f5f9",borderTop:"3px solid #f59e0b",borderRadius:"50%",animation:"spin 0.8s linear infinite"}}/><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

const is = {width:"100%",padding:"10px 14px",border:"1.5px solid #e2e8f0",borderRadius:10,fontSize:14,color:"#0f172a",outline:"none",boxSizing:"border-box",background:"#f8fafc",fontFamily:"inherit"};
const Fld = ({label,children}) => <div style={{marginBottom:14}}>{label&&<label style={{display:"block",fontSize:13,fontWeight:700,color:"#374151",marginBottom:5}}>{label}</label>}{children}</div>;
const Inp = ({label,...p}) => <Fld label={label}><input {...p} style={is}/></Fld>;
const Sel = ({label,opts,...p}) => <Fld label={label}><select {...p} style={is}><option value="">— Selecionar —</option>{opts.map(o=><option key={o.v} value={o.v}>{o.l}</option>)}</select></Fld>;
const TA  = ({label,...p}) => <Fld label={label}><textarea {...p} rows={3} style={{...is,resize:"vertical"}}/></Fld>;
const Dvd = ({label}) => <div style={{display:"flex",alignItems:"center",gap:10,margin:"16px 0 12px"}}>{label&&<span style={{fontSize:11,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1,whiteSpace:"nowrap"}}>{label}</span>}<div style={{flex:1,height:1,background:"#f1f5f9"}}/></div>;
const G2  = ({children,cols="1fr 1fr"}) => <div style={{display:"grid",gridTemplateColumns:cols,gap:"0 14px"}}>{children}</div>;
const G3  = ({children}) => <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0 12px"}}>{children}</div>;
const BV  = {primary:{background:"#f59e0b",color:"white"},secondary:{background:"#f1f5f9",color:"#334155"},ghost:{background:"transparent",color:"#64748b",border:"1.5px solid #e2e8f0"},danger:{background:"#fee2e2",color:"#dc2626"},danger2:{background:"#dc2626",color:"white"},success:{background:"#dcfce7",color:"#16a34a"},blue:{background:"#eff6ff",color:"#1d4ed8"},dark:{background:"#0f172a",color:"white"}};
const Btn = ({children,onClick,variant="primary",sm,xs,full,disabled,loading:ld,style:sy}) => (
  <button onClick={onClick} disabled={disabled||ld} style={{padding:xs?"4px 10px":sm?"7px 14px":"10px 20px",borderRadius:10,border:"none",cursor:(disabled||ld)?"not-allowed":"pointer",fontSize:xs?11:sm?13:14,fontWeight:700,width:full?"100%":"auto",opacity:(disabled||ld)?0.6:1,...BV[variant],...sy}}>
    {ld?"⏳ ":""}  {children}
  </button>
);
const Stat = ({label,value,sub,color,icon,onClick}) => (
  <div onClick={onClick} style={{background:"white",borderRadius:16,padding:"16px 18px",boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9",cursor:onClick?"pointer":"default"}}>
    <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between"}}>
      <div style={{flex:1}}><p style={{margin:"0 0 5px",fontSize:11,color:"#64748b",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.5px"}}>{label}</p><p style={{margin:0,fontSize:24,fontWeight:900,color:color||"#0f172a",lineHeight:1}}>{value}</p>{sub&&<p style={{margin:"4px 0 0",fontSize:11,color:"#94a3b8"}}>{sub}</p>}</div>
      <span style={{fontSize:24,opacity:0.8}}>{icon}</span>
    </div>
  </div>
);
const Empty = ({icon,text,action,al}) => (
  <div style={{textAlign:"center",padding:"52px 20px"}}>
    <div style={{fontSize:46,marginBottom:10,opacity:0.35}}>{icon}</div>
    <p style={{margin:"0 0 14px",fontSize:14,fontWeight:600,color:"#94a3b8"}}>{text}</p>
    {action&&<Btn sm onClick={action}>{al}</Btn>}
  </div>
);
function useToast(){ const [t,setT]=useState(null); const show=useCallback((msg,type="success")=>{ setT({msg,type}); setTimeout(()=>setT(null),2400); },[]); return {toast:t,show}; }
function useIsMobile(){ const [m,setM]=useState(typeof window!=="undefined"?window.innerWidth<768:false); useEffect(()=>{ const h=()=>setM(window.innerWidth<768); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]); return m; }

// ─── AUTH SCREENS ─────────────────────────────────────────────
function AuthScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode]     = useState("login");
  const [form, setForm]     = useState({ email:"", password:"", name:"", company:"" });
  const [err,  setErr]      = useState("");
  const [loading, setLoading] = useState(false);
  const s = (k,v) => setForm(p=>({...p,[k]:v}));

  const submit = async () => {
    setErr(""); setLoading(true);
    try {
      if (mode==="login") await signIn(form.email, form.password);
      else await signUp(form.email, form.password, form.name, form.company);
    } catch(e) { setErr(e.message); }
    setLoading(false);
  };

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"white",borderRadius:24,padding:36,maxWidth:400,width:"100%",boxShadow:"0 32px 80px rgba(0,0,0,0.5)"}}>
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{fontSize:52,marginBottom:8}}>🚛</div>
          <h1 style={{fontSize:24,fontWeight:900,color:"#0f172a",margin:0}}>TransGest</h1>
          <p style={{fontSize:14,color:"#64748b",margin:"6px 0 0"}}>{mode==="login"?"Entra na tua conta":"Cria a tua conta"}</p>
        </div>
        {err&&<div style={{background:"#fee2e2",border:"1px solid #fca5a5",borderRadius:10,padding:"10px 14px",marginBottom:14,fontSize:13,color:"#dc2626",fontWeight:600}}>{err}</div>}
        {mode==="register"&&<Inp label="Nome completo" value={form.name} onChange={e=>s("name",e.target.value)} placeholder="João Ferreira"/>}
        {mode==="register"&&<Inp label="Nome da empresa" value={form.company} onChange={e=>s("company",e.target.value)} placeholder="Transportes Mário Lda"/>}
        <Inp label="Email" type="email" value={form.email} onChange={e=>s("email",e.target.value)} placeholder="email@empresa.pt"/>
        <Inp label="Password" type="password" value={form.password} onChange={e=>s("password",e.target.value)} placeholder="mínimo 6 caracteres"/>
        <Btn full loading={loading} onClick={submit} style={{marginTop:8}}>
          {mode==="login"?"Entrar":"Criar conta"}
        </Btn>
        <div style={{textAlign:"center",marginTop:18,fontSize:14,color:"#64748b"}}>
          {mode==="login"?"Ainda não tens conta?":"Já tens conta?"}
          {" "}<button onClick={()=>{setMode(mode==="login"?"register":"login");setErr("");}} style={{background:"none",border:"none",color:"#f59e0b",fontWeight:700,cursor:"pointer",fontSize:14,fontFamily:"inherit"}}>
            {mode==="login"?"Registar":"Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SERVICE DETAIL ───────────────────────────────────────────
function ServiceDetail({svc,onClose,onEdit}){
  const {clients,drivers,vehicles,invoices,updateServiceStatus}=useData();
  const cl=clients.find(c=>c.id===svc.clientId);
  const dr=drivers.find(d=>d.id===svc.driverId);
  const vh=vehicles.find(v=>v.id===svc.vehicleId);
  const inv=invoices.find(i=>i.serviceId===svc.id);
  const dur=fmtDur(durMins(svc.startTime,svc.endTime));

  const setSt=async st=>{
    const extra={};
    if(st==="em curso"&&!svc.startTime) extra.start_time=nowTime();
    if(st==="concluído"&&!svc.endTime) extra.end_time=nowTime();
    await updateServiceStatus(svc.id, st, extra);
    onClose();
  };

  const R=({icon,label,val})=>val?<div style={{display:"flex",gap:12,padding:"9px 0",borderBottom:"1px solid #f8fafc"}}><span style={{fontSize:15,width:20,textAlign:"center",flexShrink:0}}>{icon}</span><div><div style={{fontSize:11,color:"#94a3b8",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.3px"}}>{label}</div><div style={{fontSize:14,color:"#0f172a",fontWeight:600,marginTop:1}}>{val}</div></div></div>:null;

  return (
    <Modal title="Detalhe do Serviço" onClose={onClose}>
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:16,flexWrap:"wrap"}}>
        <span style={{fontSize:26}}>{svc.type==="mudança"?"🏠":svc.type==="entrega"?"📦":"🔄"}</span>
        <div style={{flex:1}}><div style={{fontWeight:900,fontSize:17,color:"#0f172a"}}>{cl?.name||"—"}</div><div style={{display:"flex",gap:8,marginTop:4,flexWrap:"wrap"}}><Badge status={svc.status}/><span style={{fontSize:11,color:"#94a3b8",background:"#f8fafc",padding:"2px 8px",borderRadius:8,border:"1px solid #e2e8f0",fontWeight:600}}>{svc.type}</span></div></div>
        <div style={{textAlign:"right"}}><div style={{fontSize:22,fontWeight:900,color:"#10b981"}}>{fmtCur(svc.price)}</div>{inv&&<Badge status={inv.status==="pago"?"pago":"faturado"}/>}</div>
      </div>
      <R icon="📅" label="Data e hora" val={`${fmtDate(svc.date)} às ${svc.time}`}/>
      <R icon="📍" label="Origem" val={svc.origin}/>
      <R icon="🏁" label="Destino" val={svc.destination}/>
      <R icon="👤" label="Motorista" val={dr?.name}/>
      <R icon="🚐" label="Viatura" val={vh?`${vh.plate} · ${vh.model}`:null}/>
      <R icon="⏱️" label="Execução" val={svc.startTime?`${svc.startTime}${svc.endTime?" → "+svc.endTime:""}${dur?" ("+dur+")":""}`:null}/>
      <R icon="🗺️" label="KM" val={svc.km?`${svc.km} km`:null}/>
      {svc.notes&&<R icon="📝" label="Notas" val={svc.notes}/>}
      <div style={{marginTop:18,display:"flex",gap:8,flexWrap:"wrap"}}>
        {svc.status==="pendente"&&<Btn variant="blue" onClick={()=>setSt("confirmado")}>✓ Confirmar</Btn>}
        {svc.status==="confirmado"&&<Btn variant="success" onClick={()=>setSt("em curso")}>▶ Iniciar</Btn>}
        {svc.status==="em curso"&&<Btn variant="success" onClick={()=>setSt("concluído")}>✅ Concluir</Btn>}
        {["pendente","confirmado"].includes(svc.status)&&<Btn variant="danger" onClick={()=>setSt("cancelado")}>✕ Cancelar</Btn>}
        <Btn variant="secondary" onClick={onEdit}>✏️ Editar</Btn>
      </div>
    </Modal>
  );
}

// ─── SERVICE FORM ─────────────────────────────────────────────
function ServiceForm({svc,onClose}){
  const {clients,drivers,vehicles,services,saveService}=useData();
  const {toast,show}=useToast();
  const [f,setF]=useState(svc||{type:"mudança",status:"pendente",date:today(),time:"09:00",origin:"",destination:"",clientId:"",driverId:"",vehicleId:"",price:"",notes:"",startTime:"",endTime:"",km:""});
  const [saving,setSaving]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const conflict=useMemo(()=>services.find(sv=>sv.id!==(svc?.id)&&sv.date===f.date&&sv.time===f.time&&["pendente","confirmado","em curso"].includes(sv.status)&&((f.driverId&&sv.driverId===f.driverId)||(f.vehicleId&&sv.vehicleId===f.vehicleId))),[f.date,f.time,f.driverId,f.vehicleId,services,svc]);
  const active=!["pendente","confirmado"].includes(f.status);
  const save=async()=>{
    if(!f.clientId){alert("Seleciona um cliente.");return;}
    if(!f.origin||!f.destination){alert("Preenche origem e destino.");return;}
    setSaving(true);
    await saveService({...f,id:svc?.id,price:Number(f.price)||0,km:f.km?Number(f.km):null,createdAt:svc?.createdAt||today()});
    show(svc?"Guardado ✓":"Serviço criado ✓");
    setSaving(false);
    onClose();
  };

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      {conflict&&<div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:10,padding:"9px 14px",marginBottom:12,fontSize:13,color:"#c2410c",fontWeight:600}}>⚠️ Conflito: motorista ou viatura já ocupados neste horário.</div>}
      <Dvd label="Serviço"/>
      <G2><Sel label="Tipo" value={f.type} onChange={e=>s("type",e.target.value)} opts={SVC_TYPES.map(t=>({v:t,l:t.charAt(0).toUpperCase()+t.slice(1)}))}/><Sel label="Estado" value={f.status} onChange={e=>s("status",e.target.value)} opts={SVC_ST.map(t=>({v:t,l:t.charAt(0).toUpperCase()+t.slice(1)}))}/></G2>
      <G2><Inp label="Data" type="date" value={f.date} onChange={e=>s("date",e.target.value)}/><Inp label="Hora" type="time" value={f.time} onChange={e=>s("time",e.target.value)}/></G2>
      <Dvd label="Cliente"/>
      <G2><Sel label="Cliente *" value={f.clientId} onChange={e=>s("clientId",e.target.value)} opts={clients.map(c=>({v:c.id,l:c.name}))}/><Inp label="Preço (€)" type="number" value={f.price} onChange={e=>s("price",e.target.value)} placeholder="0.00"/></G2>
      <Dvd label="Localização"/>
      <Inp label="Origem *" value={f.origin} onChange={e=>s("origin",e.target.value)} placeholder="Morada completa"/>
      <Inp label="Destino *" value={f.destination} onChange={e=>s("destination",e.target.value)} placeholder="Morada completa"/>
      <Dvd label="Recursos"/>
      <G2><Sel label="Motorista" value={f.driverId||""} onChange={e=>s("driverId",e.target.value||null)} opts={drivers.map(d=>({v:d.id,l:d.name}))}/><Sel label="Viatura" value={f.vehicleId||""} onChange={e=>s("vehicleId",e.target.value||null)} opts={vehicles.map(v=>({v:v.id,l:`${v.plate} · ${v.model}`}))}/></G2>
      {active&&<><Dvd label="Execução"/><G3><Inp label="Hora início" type="time" value={f.startTime||""} onChange={e=>s("startTime",e.target.value)}/><Inp label="Hora fim" type="time" value={f.endTime||""} onChange={e=>s("endTime",e.target.value)}/><Inp label="KM" type="number" value={f.km||""} onChange={e=>s("km",e.target.value)}/></G3></>}
      <Dvd label="Notas"/>
      <TA value={f.notes} onChange={e=>s("notes",e.target.value)} placeholder="Detalhes, instruções especiais..."/>
      <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}><Btn variant="secondary" onClick={onClose}>Cancelar</Btn><Btn loading={saving} onClick={save}>{svc?"Guardar":"Criar serviço"}</Btn></div>
    </div>
  );
}

// ─── DASHBOARD ────────────────────────────────────────────────
function Dashboard({goTo}){
  const {services,invoices,expenses,clients,drivers}=useData();
  const td=today();
  const todaySvcs=services.filter(s=>s.date===td).sort((a,b)=>a.time.localeCompare(b.time));
  const pending=services.filter(s=>["pendente","confirmado","em curso"].includes(s.status));
  const tm=td.slice(0,7);
  const lm=(()=>{ const d=new Date(); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); })();
  const mRev=services.filter(s=>mo(s.date)===tm&&s.status==="concluído").reduce((a,s)=>a+(s.price||0),0);
  const lmRev=services.filter(s=>mo(s.date)===lm&&s.status==="concluído").reduce((a,s)=>a+(s.price||0),0);
  const diff=lmRev>0?Math.round(((mRev-lmRev)/lmRev)*100):null;
  const mExp=expenses.filter(e=>mo(e.date)===tm).reduce((a,e)=>a+(e.amount||0),0);
  const overdue=invoices.filter(i=>i.status==="pendente"&&i.dueDate&&i.dueDate<td);

  const chart=useMemo(()=>Array.from({length:6},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-(5-i)); const k=d.toISOString().slice(0,7); return {month:d.toLocaleDateString("pt-PT",{month:"short"}),receita:services.filter(s=>mo(s.date)===k&&s.status==="concluído").reduce((a,s)=>a+(s.price||0),0),despesas:expenses.filter(e=>mo(e.date)===k).reduce((a,e)=>a+(e.amount||0),0)}; }),[services,expenses]);

  return (
    <div>
      <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:22,flexWrap:"wrap",gap:12}}>
        <div><h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Dashboard 👋</h1><p style={{margin:"3px 0 0",color:"#64748b",fontSize:13}}>{new Date().toLocaleDateString("pt-PT",{weekday:"long",year:"numeric",month:"long",day:"numeric"})}</p></div>
        <Btn onClick={()=>goTo("services")}>+ Novo Serviço</Btn>
      </div>
      {overdue.length>0&&<div onClick={()=>goTo("invoicing")} style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:12,padding:"11px 16px",marginBottom:18,cursor:"pointer",display:"flex",alignItems:"center",gap:10}}><span>⚠️</span><span style={{fontSize:14,fontWeight:700,color:"#c2410c"}}>{overdue.length} fatura(s) em atraso — clique para ver</span></div>}
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:22}}>
        <Stat label="Receita mês" value={fmtCur(mRev)} sub={diff!==null?`${diff>=0?"+":""}${diff}% vs anterior`:undefined} color="#10b981" icon="💰" onClick={()=>goTo("reports")}/>
        <Stat label="Despesas mês" value={fmtCur(mExp)} color="#ef4444" icon="📤" onClick={()=>goTo("expenses")}/>
        <Stat label="Margem mês" value={fmtCur(mRev-mExp)} color={mRev-mExp>=0?"#10b981":"#ef4444"} icon="📊"/>
        <Stat label="Ativos" value={pending.length} sub={`${services.filter(s=>mo(s.date)===tm).length} este mês`} icon="🚛" onClick={()=>goTo("services")}/>
        <Stat label="Hoje" value={todaySvcs.length} color="#f59e0b" icon="📅" onClick={()=>goTo("calendar")}/>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:16}}>
        <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
            <h3 style={{margin:0,fontSize:15,fontWeight:800}}>📋 Hoje</h3>
            <span style={{background:"#fef3c7",color:"#92400e",fontSize:11,padding:"2px 10px",borderRadius:20,fontWeight:800}}>{todaySvcs.length}</span>
          </div>
          {todaySvcs.length===0?<p style={{color:"#94a3b8",fontSize:13,margin:0,textAlign:"center",padding:"18px 0"}}>Sem serviços hoje 🎉</p>
            :todaySvcs.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); return (
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",background:"#f8fafc",borderRadius:12,marginBottom:6,border:"1px solid #f1f5f9"}}>
                <span style={{fontSize:18}}>{s.type==="mudança"?"🏠":"📦"}</span>
                <div style={{flex:1,minWidth:0}}><p style={{margin:"0 0 1px",fontWeight:700,fontSize:13,color:"#0f172a"}}>{cl?.name}</p><p style={{margin:0,fontSize:12,color:"#64748b",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{s.origin} → {s.destination}</p></div>
                <div style={{textAlign:"right",flexShrink:0}}><p style={{margin:"0 0 2px",fontWeight:800,fontSize:13}}>{s.time}</p><Badge status={s.status}/></div>
              </div>
            );})}
        </div>
        <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
          <h3 style={{margin:"0 0 12px",fontSize:15,fontWeight:800}}>⏳ Próximos</h3>
          {pending.filter(s=>s.date>=td).length===0?<p style={{color:"#94a3b8",fontSize:13,margin:0,textAlign:"center",padding:"18px 0"}}>Nenhum pendente</p>
            :pending.filter(s=>s.date>=td).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,6).map(s=>{ const cl=clients.find(c=>c.id===s.clientId); return (
              <div key={s.id} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f8fafc"}}>
                <div style={{minWidth:44,textAlign:"center"}}><div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase"}}>{new Date(s.date+"T00:00:00").toLocaleDateString("pt-PT",{weekday:"short"})}</div><div style={{fontSize:16,fontWeight:900,color:"#0f172a"}}>{new Date(s.date+"T00:00:00").getDate()}</div></div>
                <div style={{flex:1,minWidth:0}}><div style={{fontWeight:700,fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cl?.name}</div><div style={{fontSize:12,color:"#64748b"}}>{s.time} · {s.type}</div></div>
                <div style={{textAlign:"right",flexShrink:0}}><div style={{fontWeight:800,color:"#10b981",fontSize:13}}>{fmtCur(s.price)}</div><Badge status={s.status}/></div>
              </div>
            );})}
        </div>
        <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9",gridColumn:"1/-1"}}>
          <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800}}>📊 Receita vs Despesas — 6 meses</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chart} margin={{top:4,right:4,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="month" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`€${v}`}/>
              <Tooltip formatter={v=>[`€${v}`]} contentStyle={{borderRadius:10,fontSize:12}}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4,4,0,0]}/>
              <Bar dataKey="despesas" name="Despesas" fill="#ef444455" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ─── SERVICES PAGE ────────────────────────────────────────────
function Services(){
  const {services,clients,drivers,vehicles,deleteService,updateServiceStatus,dataLoading}=useData();
  const [modal,setModal]=useState(null);
  const [detail,setDetail]=useState(null);
  const [filter,setFilter]=useState("todos");
  const [search,setSearch]=useState("");
  const {toast,show}=useToast();

  const list=useMemo(()=>services.filter(s=>filter==="todos"||s.status===filter).filter(s=>{ if(!search)return true; const cl=clients.find(c=>c.id===s.clientId); return [cl?.name,s.origin,s.destination].some(v=>(v||"").toLowerCase().includes(search.toLowerCase())); }),[services,clients,filter,search]);

  const del=async id=>{ if(confirm("Eliminar serviço?")){ await deleteService(id); show("Eliminado","info"); }};
  const qSt=async(id,st)=>{ await updateServiceStatus(id,st,...(st==="em curso"?[{start_time:nowTime()}]:st==="concluído"?[{end_time:nowTime()}]:[])); show(`Estado: ${st}`); };

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Serviços <span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>({list.length})</span></h1>
        <Btn onClick={()=>setModal("new")}>+ Novo Serviço</Btn>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Pesquisar..." style={{...is,width:"100%",marginBottom:12}}/>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        {["todos",...SVC_ST].map(st=>(
          <button key={st} onClick={()=>setFilter(st)} style={{padding:"6px 14px",borderRadius:20,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:filter===st?(SC[st]||"#f59e0b"):"#f1f5f9",color:filter===st?"white":"#64748b"}}>
            {st.charAt(0).toUpperCase()+st.slice(1)}{st!=="todos"&&<span style={{marginLeft:5,opacity:0.85}}>{services.filter(s=>s.status===st).length}</span>}
          </button>
        ))}
      </div>
      {dataLoading?<Spin/>:list.length===0?<Empty icon="🚛" text="Sem serviços" action={()=>setModal("new")} al="Criar serviço"/>
        :list.map(s=>{
          const cl=clients.find(c=>c.id===s.clientId);
          const dr=drivers.find(d=>d.id===s.driverId);
          const vh=vehicles.find(v=>v.id===s.vehicleId);
          const dur=fmtDur(durMins(s.startTime,s.endTime));
          const cf=services.some(o=>o.id!==s.id&&o.date===s.date&&o.time===s.time&&["pendente","confirmado","em curso"].includes(o.status)&&((s.driverId&&o.driverId===s.driverId)||(s.vehicleId&&o.vehicleId===s.vehicleId)));
          return (
            <div key={s.id} onClick={()=>setDetail(s)} style={{background:"white",borderRadius:14,padding:"13px 17px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`1px solid ${cf?"#fca5a5":"#f1f5f9"}`,cursor:"pointer",marginBottom:8}}
              onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 14px rgba(0,0,0,0.12)"}
              onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 3px rgba(0,0,0,0.06)"}>
              <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                <div style={{flex:1,minWidth:180}}>
                  {cf&&<div style={{fontSize:11,color:"#dc2626",fontWeight:800,marginBottom:3}}>⚠️ Conflito de horário</div>}
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:17}}>{s.type==="mudança"?"🏠":s.type==="entrega"?"📦":"🔄"}</span>
                    <span style={{fontWeight:900,fontSize:14,color:"#0f172a"}}>{cl?.name||"—"}</span>
                    <Badge status={s.status}/>
                    <span style={{fontSize:11,color:"#94a3b8",background:"#f8fafc",padding:"1px 8px",borderRadius:8,border:"1px solid #e2e8f0"}}>{s.type}</span>
                  </div>
                  <div style={{fontSize:13,color:"#475569",marginBottom:4,display:"flex",gap:4,flexWrap:"wrap"}}>
                    <span>📍 {s.origin}</span><span style={{color:"#f59e0b",fontWeight:900}}>→</span><span>{s.destination}</span>
                  </div>
                  <div style={{display:"flex",gap:12,fontSize:12,color:"#94a3b8",flexWrap:"wrap"}}>
                    <span>📅 {fmtDate(s.date)} {s.time}</span>
                    {dr&&<span>👤 {dr.name}</span>}
                    {vh&&<span>🚐 {vh.plate}</span>}
                    {s.km&&<span>🗺️ {s.km}km</span>}
                    {dur&&<span>⏱️ {dur}</span>}
                  </div>
                </div>
                <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:7,flexShrink:0}} onClick={e=>e.stopPropagation()}>
                  <span style={{fontSize:18,fontWeight:900,color:"#10b981"}}>{fmtCur(s.price)}</span>
                  <div style={{display:"flex",gap:5}}>
                    {s.status==="pendente"&&<Btn xs variant="blue" onClick={()=>qSt(s.id,"confirmado")}>✓</Btn>}
                    {s.status==="confirmado"&&<Btn xs variant="success" onClick={()=>qSt(s.id,"em curso")}>▶</Btn>}
                    {s.status==="em curso"&&<Btn xs variant="success" onClick={()=>qSt(s.id,"concluído")}>✅</Btn>}
                    <Btn xs variant="ghost" onClick={()=>{setDetail(null);setModal(s);}}>✏️</Btn>
                    <Btn xs variant="danger" onClick={()=>del(s.id)}>🗑</Btn>
                  </div>
                </div>
              </div>
            </div>
          );
        })
      }
      {detail&&<ServiceDetail svc={detail} onClose={()=>setDetail(null)} onEdit={()=>{setModal(detail);setDetail(null);}}/>}
      {modal&&<Modal title={modal==="new"?"Novo Serviço":"Editar Serviço"} onClose={()=>setModal(null)} wide><ServiceForm svc={modal==="new"?null:modal} onClose={()=>setModal(null)}/></Modal>}
    </div>
  );
}

// ─── CALENDAR ─────────────────────────────────────────────────
function Calendar(){
  const {services,clients,invoices,updateServiceStatus}=useData();
  const [wk,setWk]=useState(weekStart(today()));
  const [detail,setDetail]=useState(null);
  const [dayModal,setDayModal]=useState(null);
  const days=Array.from({length:7},(_,i)=>addDays(wk,i));
  const DNs=["Seg","Ter","Qua","Qui","Sex","Sáb","Dom"];

  const DayView=({day})=>{
    const svcs=services.filter(s=>s.date===day).sort((a,b)=>a.time.localeCompare(b.time));
    return (
      <Modal title={new Date(day+"T00:00:00").toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"})} onClose={()=>setDayModal(null)}>
        {svcs.length===0?<Empty icon="🗓️" text="Sem serviços neste dia"/>
          :svcs.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); const col=SC[s.status]||"#94a3b8"; return (
            <div key={s.id} onClick={()=>{setDayModal(null);setDetail(s);}} style={{borderLeft:`5px solid ${col}`,background:"#f8fafc",borderRadius:10,padding:"12px 16px",marginBottom:8,cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",flexWrap:"wrap",gap:6}}>
                <div><div style={{fontWeight:900,fontSize:14}}>{s.time} · {cl?.name}</div><div style={{fontSize:12,color:"#64748b",marginTop:2}}>{s.origin} → {s.destination}</div></div>
                <div style={{textAlign:"right"}}><div style={{fontWeight:900,color:"#10b981"}}>{fmtCur(s.price)}</div><Badge status={s.status}/></div>
              </div>
            </div>
          );})}
      </Modal>
    );
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Calendário</h1>
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
          <Btn sm variant="secondary" onClick={()=>setWk(weekStart(addDays(wk,-7)))}>‹</Btn>
          <span style={{fontSize:13,fontWeight:700,color:"#374151",background:"white",padding:"6px 14px",borderRadius:10,border:"1px solid #e2e8f0"}}>{fmtDate(wk)} — {fmtDate(addDays(wk,6))}</span>
          <Btn sm variant="secondary" onClick={()=>setWk(weekStart(addDays(wk,7)))}>›</Btn>
          <Btn sm onClick={()=>setWk(weekStart(today()))}>Hoje</Btn>
        </div>
      </div>
      <div style={{overflowX:"auto",paddingBottom:4}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,minmax(130px,1fr))",gap:8,minWidth:660}}>
          {days.map((day,i)=>{
            const isTd=day===today();
            const svcs=services.filter(s=>s.date===day).sort((a,b)=>a.time.localeCompare(b.time));
            return (
              <div key={day} onClick={()=>setDayModal(day)} style={{background:isTd?"#fffbeb":"white",border:isTd?"2px solid #f59e0b":"1px solid #f1f5f9",borderRadius:14,padding:10,minHeight:160,cursor:"pointer"}}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 12px rgba(0,0,0,0.1)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow="none"}>
                <div style={{textAlign:"center",marginBottom:8}}>
                  <div style={{fontSize:10,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:1}}>{DNs[i]}</div>
                  <div style={{width:32,height:32,borderRadius:"50%",background:isTd?"#f59e0b":"transparent",color:isTd?"white":"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",margin:"3px auto 0",fontSize:16,fontWeight:900}}>{new Date(day+"T00:00:00").getDate()}</div>
                </div>
                {svcs.length===0?<div style={{fontSize:11,color:"#e2e8f0",textAlign:"center",marginTop:10}}>—</div>
                  :svcs.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); const col=SC[s.status]||"#94a3b8"; return (
                    <div key={s.id} onClick={e=>{e.stopPropagation();setDetail(s);}} style={{background:col+"18",borderLeft:`3px solid ${col}`,borderRadius:6,padding:"4px 7px",marginBottom:4}}>
                      <div style={{fontSize:10,fontWeight:800,color:col}}>{s.time}</div>
                      <div style={{fontSize:11,fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{cl?.name}</div>
                    </div>
                  );})}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{marginTop:14,background:"white",borderRadius:12,padding:"10px 16px",border:"1px solid #f1f5f9",display:"flex",gap:16,flexWrap:"wrap"}}>
        {SVC_ST.map(st=><div key={st} style={{display:"flex",alignItems:"center",gap:6,fontSize:12}}><div style={{width:10,height:10,borderRadius:3,background:SC[st]}}/><span style={{color:"#64748b",fontWeight:600}}>{st}</span></div>)}
      </div>
      {dayModal&&<DayView day={dayModal}/>}
      {detail&&<ServiceDetail svc={detail} onClose={()=>setDetail(null)} onEdit={()=>setDetail(null)}/>}
    </div>
  );
}

// ─── DRIVERS PAGE ─────────────────────────────────────────────
function Drivers(){
  const {drivers,services,saveDriver,deleteDriver}=useData();
  const [modal,setModal]=useState(null);
  const [f,setF]=useState({});
  const {toast,show}=useToast();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const openNew=()=>{setF({name:"",phone:"",email:"",license:"B",status:"disponível",joinDate:today(),notes:""});setModal("form");};
  const openEdit=d=>{setF({...d});setModal("form");};
  const [saving,setSaving]=useState(false);
  const save=async()=>{
    if(!f.name){alert("Nome obrigatório.");return;}
    setSaving(true);
    await saveDriver({...f});
    show(f.id?"Atualizado ✓":"Adicionado ✓");
    setSaving(false); setModal(null);
  };
  const del=async id=>{if(confirm("Eliminar motorista?")){await deleteDriver(id);show("Eliminado","info");}};

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Motoristas</h1>
        <Btn onClick={openNew}>+ Novo Motorista</Btn>
      </div>
      {drivers.length===0?<Empty icon="👤" text="Sem motoristas" action={openNew} al="Adicionar"/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:16}}>
          {drivers.map(d=>{
            const svcs=services.filter(s=>s.driverId===d.id);
            const done=svcs.filter(s=>s.status==="concluído");
            const rev=done.reduce((a,s)=>a+(s.price||0),0);
            const km=done.reduce((a,s)=>a+(s.km||0),0);
            const tc=svcs.filter(s=>s.date===today()).length;
            return (
              <div key={d.id} style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:14}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:"linear-gradient(135deg,#fef3c7,#fde68a)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,flexShrink:0}}>👤</div>
                  <div style={{flex:1}}><div style={{fontWeight:900,fontSize:15,color:"#0f172a"}}>{d.name}</div><div style={{display:"flex",gap:6,marginTop:3,flexWrap:"wrap"}}><Badge status={d.status}/><span style={{fontSize:11,color:"#94a3b8"}}>Carta {d.license}</span></div></div>
                </div>
                <div style={{fontSize:13,color:"#64748b",marginBottom:12,display:"flex",flexDirection:"column",gap:4}}>
                  {d.phone&&<span>📞 {d.phone}</span>}
                  {d.joinDate&&<span>📅 Desde {fmtDate(d.joinDate)}</span>}
                  {tc>0&&<span style={{color:"#f59e0b",fontWeight:700}}>🔔 {tc} serviço(s) hoje</span>}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                  {[[done.length,"Serviços","#0f172a"],[fmtCur(rev),"Receita","#10b981"],[`${km}km`,"KM","#3b82f6"]].map(([v,l,c])=>(
                    <div key={l} style={{background:"#f8fafc",borderRadius:10,padding:"8px 6px",textAlign:"center"}}><div style={{fontSize:13,fontWeight:900,color:c}}>{v}</div><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase"}}>{l}</div></div>
                  ))}
                </div>
                <div style={{display:"flex",gap:6}}><Btn sm variant="secondary" full onClick={()=>openEdit(d)}>Editar</Btn><Btn sm variant="danger" onClick={()=>del(d.id)}>🗑</Btn></div>
              </div>
            );
          })}
        </div>}
      {modal==="form"&&(
        <Modal title={f.id?"Editar Motorista":"Novo Motorista"} onClose={()=>setModal(null)}>
          <Inp label="Nome *" value={f.name||""} onChange={e=>s("name",e.target.value)}/>
          <G2><Inp label="Telemóvel" value={f.phone||""} onChange={e=>s("phone",e.target.value)}/><Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/></G2>
          <G2><Inp label="Carta" value={f.license||""} onChange={e=>s("license",e.target.value)} placeholder="B, C, C+E..."/><Inp label="Data entrada" type="date" value={f.joinDate||""} onChange={e=>s("joinDate",e.target.value)}/></G2>
          <Sel label="Estado" value={f.status||"disponível"} onChange={e=>s("status",e.target.value)} opts={DRV_ST.map(x=>({v:x,l:x.charAt(0).toUpperCase()+x.slice(1)}))}/>
          <TA label="Notas" value={f.notes||""} onChange={e=>s("notes",e.target.value)}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn loading={saving} onClick={save}>{f.id?"Guardar":"Adicionar"}</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ─── FLEET PAGE ───────────────────────────────────────────────
function Fleet(){
  const {vehicles,services,saveVehicle}=useData();
  const [modal,setModal]=useState(null);
  const [f,setF]=useState({});
  const [saving,setSaving]=useState(false);
  const {toast,show}=useToast();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const openNew=()=>{setF({plate:"",model:"",type:"Carrinha Média",status:"disponível",year:new Date().getFullYear(),km:0,nextService:"",notes:""});setModal("form");};
  const openEdit=v=>{setF({...v});setModal("form");};
  const save=async()=>{
    if(!f.plate||!f.model){alert("Matrícula e modelo obrigatórios.");return;}
    setSaving(true);
    await saveVehicle({...f,km:Number(f.km)||0,year:Number(f.year)});
    show(f.id?"Atualizada ✓":"Adicionada ✓");
    setSaving(false); setModal(null);
  };

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Frota</h1>
        <Btn onClick={openNew}>+ Nova Viatura</Btn>
      </div>
      {vehicles.length===0?<Empty icon="🚐" text="Sem viaturas" action={openNew} al="Adicionar"/>
        :<div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(270px,1fr))",gap:16}}>
          {vehicles.map(v=>{
            const svcs=services.filter(s=>s.vehicleId===v.id&&s.status==="concluído");
            const km=svcs.reduce((a,s)=>a+(s.km||0),0);
            const rev=svcs.reduce((a,s)=>a+(s.price||0),0);
            const warn=v.nextService&&v.nextService<=addDays(today(),30);
            const active=services.find(s=>s.vehicleId===v.id&&s.status==="em curso");
            return (
              <div key={v.id} style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:`1px solid ${warn?"#fed7aa":"#f1f5f9"}`}}>
                {warn&&<div style={{background:"#fff7ed",borderRadius:8,padding:"7px 12px",marginBottom:12,fontSize:12,color:"#c2410c",fontWeight:700}}>⚠️ Revisão: {fmtDate(v.nextService)}</div>}
                <div style={{display:"flex",alignItems:"flex-start",gap:12,marginBottom:14}}>
                  <div style={{width:44,height:44,borderRadius:12,background:"linear-gradient(135deg,#eff6ff,#dbeafe)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:22,flexShrink:0}}>🚐</div>
                  <div style={{flex:1}}><div style={{fontWeight:900,fontSize:18,letterSpacing:"1px"}}>{v.plate}</div><div style={{fontSize:12,color:"#64748b"}}>{v.model} · {v.year}</div><div style={{marginTop:4,display:"flex",gap:6,flexWrap:"wrap"}}><Badge status={active?"em curso":v.status}/><span style={{fontSize:11,color:"#94a3b8",background:"#f8fafc",padding:"1px 7px",borderRadius:8,border:"1px solid #e2e8f0"}}>{v.type}</span></div></div>
                </div>
                <div style={{fontSize:13,color:"#64748b",marginBottom:12}}>📊 {Number(v.km||0).toLocaleString("pt-PT")} km odómetro</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:12}}>
                  {[[svcs.length,"Serviços","#0f172a"],[fmtCur(rev),"Receita","#10b981"],[`${km}km`,"KM","#3b82f6"]].map(([val,lbl,col])=>(
                    <div key={lbl} style={{background:"#f8fafc",borderRadius:10,padding:"8px 6px",textAlign:"center"}}><div style={{fontSize:13,fontWeight:900,color:col}}>{val}</div><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase"}}>{lbl}</div></div>
                  ))}
                </div>
                <Btn sm variant="secondary" full onClick={()=>openEdit(v)}>Editar</Btn>
              </div>
            );
          })}
        </div>}
      {modal==="form"&&(
        <Modal title={f.id?"Editar Viatura":"Nova Viatura"} onClose={()=>setModal(null)}>
          <G2><Inp label="Matrícula *" value={f.plate||""} onChange={e=>s("plate",e.target.value.toUpperCase())} placeholder="00-AA-00"/><Inp label="Modelo *" value={f.model||""} onChange={e=>s("model",e.target.value)}/></G2>
          <Sel label="Tipo" value={f.type||"Carrinha Média"} onChange={e=>s("type",e.target.value)} opts={VEH_TYPES.map(x=>({v:x,l:x}))}/>
          <G2><Inp label="Ano" type="number" value={f.year||""} onChange={e=>s("year",e.target.value)}/><Inp label="KM Atuais" type="number" value={f.km||""} onChange={e=>s("km",e.target.value)}/></G2>
          <G2><Sel label="Estado" value={f.status||"disponível"} onChange={e=>s("status",e.target.value)} opts={["disponível","em serviço","manutenção"].map(x=>({v:x,l:x.charAt(0).toUpperCase()+x.slice(1)}))}/><Inp label="Próxima revisão" type="date" value={f.nextService||""} onChange={e=>s("nextService",e.target.value)}/></G2>
          <TA label="Notas" value={f.notes||""} onChange={e=>s("notes",e.target.value)}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn loading={saving} onClick={save}>{f.id?"Guardar":"Adicionar"}</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ─── CLIENTS PAGE ─────────────────────────────────────────────
function Clients(){
  const {clients,services,saveClient,deleteClient}=useData();
  const [modal,setModal]=useState(null);
  const [f,setF]=useState({});
  const [exp,setExp]=useState(null);
  const [search,setSearch]=useState("");
  const [saving,setSaving]=useState(false);
  const {toast,show}=useToast();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const openNew=()=>{setF({name:"",phone:"",email:"",address:"",nif:"",notes:""});setModal("form");};
  const openEdit=c=>{setF({...c});setModal("form");};
  const save=async()=>{
    if(!f.name){alert("Nome obrigatório.");return;}
    setSaving(true);
    await saveClient({...f});
    show(f.id?"Atualizado ✓":"Adicionado ✓");
    setSaving(false); setModal(null);
  };
  const del=async id=>{if(confirm("Eliminar cliente?")){await deleteClient(id);show("Eliminado","info");}};

  const list=useMemo(()=>[...clients].filter(c=>!search||[c.name,c.phone,c.email,c.nif].some(v=>(v||"").toLowerCase().includes(search.toLowerCase()))).sort((a,b)=>services.filter(s=>s.clientId===b.id&&s.status==="concluído").reduce((x,s)=>x+(s.price||0),0)-services.filter(s=>s.clientId===a.id&&s.status==="concluído").reduce((x,s)=>x+(s.price||0),0)),[clients,services,search]);

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:18,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Clientes <span style={{fontSize:13,color:"#94a3b8",fontWeight:600}}>({clients.length})</span></h1>
        <Btn onClick={openNew}>+ Novo Cliente</Btn>
      </div>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Nome, telefone, NIF..." style={{...is,width:"100%",marginBottom:14}}/>
      {list.length===0?<Empty icon="👥" text="Sem clientes" action={openNew} al="Adicionar"/>
        :list.map((c,idx)=>{
          const svcs=services.filter(s=>s.clientId===c.id);
          const done=svcs.filter(s=>s.status==="concluído");
          const rev=done.reduce((a,s)=>a+(s.price||0),0);
          const isE=exp===c.id;
          const last=svcs.filter(s=>s.date<=today()).sort((a,b)=>b.date.localeCompare(a.date))[0];
          return (
            <div key={c.id} style={{background:"white",borderRadius:14,border:"1px solid #f1f5f9",overflow:"hidden",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",marginBottom:8}}>
              <div style={{display:"flex",alignItems:"center",gap:12,padding:"13px 16px",cursor:"pointer",flexWrap:"wrap"}} onClick={()=>setExp(isE?null:c.id)}>
                <div style={{width:38,height:38,borderRadius:"50%",background:idx<3?"linear-gradient(135deg,#fef3c7,#f59e0b22)":"#f8fafc",display:"flex",alignItems:"center",justifyContent:"center",fontSize:15,flexShrink:0,border:"1.5px solid #f1f5f9"}}>
                  {idx===0?"🥇":idx===1?"🥈":idx===2?"🥉":"👤"}
                </div>
                <div style={{flex:1,minWidth:130}}><div style={{fontWeight:800,fontSize:14,color:"#0f172a"}}>{c.name}</div><div style={{fontSize:12,color:"#64748b",marginTop:1}}>{c.phone}{c.email?` · ${c.email}`:""}</div></div>
                <div style={{display:"flex",gap:14,alignItems:"center",flexWrap:"wrap"}}>
                  <div style={{textAlign:"center"}}><div style={{fontWeight:900,fontSize:14}}>{done.length}</div><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase"}}>serviços</div></div>
                  <div style={{textAlign:"center"}}><div style={{fontWeight:900,color:"#10b981",fontSize:14}}>{fmtCur(rev)}</div><div style={{fontSize:10,color:"#94a3b8",textTransform:"uppercase"}}>receita</div></div>
                  <div style={{display:"flex",gap:5}}>
                    <Btn xs variant="ghost" onClick={e=>{e.stopPropagation();openEdit(c);}}>✏️</Btn>
                    <Btn xs variant="danger" onClick={e=>{e.stopPropagation();del(c.id);}}>🗑</Btn>
                  </div>
                  <span style={{color:"#94a3b8",fontSize:13}}>{isE?"▲":"▼"}</span>
                </div>
              </div>
              {isE&&(
                <div style={{padding:"0 16px 14px",borderTop:"1px solid #f8fafc"}}>
                  <div style={{display:"flex",gap:14,fontSize:12,color:"#64748b",margin:"10px 0",flexWrap:"wrap"}}>
                    {c.address&&<span>📍 {c.address}</span>}
                    {c.nif&&<span>🪪 NIF {c.nif}</span>}
                    {last&&<span>🕐 Último: {fmtDate(last.date)}</span>}
                    {c.notes&&<span>📝 {c.notes}</span>}
                  </div>
                  {svcs.length>0&&<div>
                    <div style={{fontSize:11,fontWeight:800,color:"#374151",marginBottom:6,textTransform:"uppercase",letterSpacing:"0.5px"}}>Histórico</div>
                    {svcs.sort((a,b)=>b.date.localeCompare(a.date)).slice(0,5).map(sv=>(
                      <div key={sv.id} style={{display:"flex",gap:10,fontSize:12,color:"#64748b",padding:"5px 0",borderBottom:"1px solid #f8fafc",alignItems:"center",flexWrap:"wrap"}}>
                        <span style={{minWidth:68,fontWeight:700,color:"#374151"}}>{fmtDate(sv.date)}</span>
                        <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{sv.type} · {sv.origin} → {sv.destination}</span>
                        <span style={{fontWeight:900,color:"#10b981"}}>{fmtCur(sv.price)}</span>
                        <Badge status={sv.status}/>
                      </div>
                    ))}
                  </div>}
                </div>
              )}
            </div>
          );
        })}
      {modal==="form"&&(
        <Modal title={f.id?"Editar Cliente":"Novo Cliente"} onClose={()=>setModal(null)}>
          <Inp label="Nome / Empresa *" value={f.name||""} onChange={e=>s("name",e.target.value)} placeholder="Nome ou empresa"/>
          <G2><Inp label="Telemóvel" value={f.phone||""} onChange={e=>s("phone",e.target.value)}/><Inp label="Email" type="email" value={f.email||""} onChange={e=>s("email",e.target.value)}/></G2>
          <G2><Inp label="NIF / NIPC" value={f.nif||""} onChange={e=>s("nif",e.target.value)}/><div/></G2>
          <Inp label="Morada" value={f.address||""} onChange={e=>s("address",e.target.value)} placeholder="Rua, nº, CP, cidade"/>
          <TA label="Notas" value={f.notes||""} onChange={e=>s("notes",e.target.value)}/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn loading={saving} onClick={save}>{f.id?"Guardar":"Adicionar"}</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ─── INVOICING PAGE ───────────────────────────────────────────
function Invoicing(){
  const {services,invoices,clients,saveInvoice,toggleInvoicePaid}=useData();
  const {company}=useAuth();
  const {toast,show}=useToast();
  const td=today();
  const cfg=company||{vat_rate:23,pay_days:30};

  const generate=async svc=>{
    const n=invoices.length+1;
    await saveInvoice({serviceId:svc.id,clientId:svc.clientId,number:`FT ${new Date().getFullYear()}/${String(n).padStart(3,"0")}`,amount:svc.price,vatRate:cfg.vat_rate||23,date:td,dueDate:addDays(td,cfg.pay_days||30),status:"pendente",notes:""});
    show(`Fatura criada ✓`);
  };
  const toggle=async id=>{ await toggleInvoicePaid(id); show("Estado atualizado ✓"); };

  const uninvoiced=services.filter(s=>s.status==="concluído"&&!invoices.find(i=>i.serviceId===s.id));
  const paid=invoices.filter(i=>i.status==="pago").reduce((a,i)=>a+i.amount,0);
  const pendAmt=invoices.filter(i=>i.status==="pendente").reduce((a,i)=>a+i.amount,0);
  const overdue=invoices.filter(i=>i.status==="pendente"&&i.dueDate&&i.dueDate<td);

  const exportCSV=()=>{ const rows=invoices.map(i=>{ const cl=clients.find(c=>c.id===i.clientId); const vat=i.amount*(i.vatRate/100); return [i.number,fmtDate(i.date),cl?.name||"",cl?.nif||"",i.amount.toFixed(2),i.vatRate,vat.toFixed(2),(i.amount+vat).toFixed(2),i.status,i.dueDate||""].join(";"); }); const csv=["Número;Data;Cliente;NIF;Base;IVA%;IVA€;Total;Estado;Vencimento",...rows].join("\n"); const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="faturas.csv"; a.click(); };

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Faturação</h1>
        {invoices.length>0&&<Btn sm variant="secondary" onClick={exportCSV}>📤 Exportar CSV</Btn>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:22}}>
        <Stat label="Pago" value={fmtCur(paid)} color="#10b981" icon="✅"/>
        <Stat label="Por receber" value={fmtCur(pendAmt)} color="#f59e0b" icon="⏳"/>
        <Stat label="Em atraso" value={overdue.length} color={overdue.length>0?"#ef4444":"#94a3b8"} icon="⚠️"/>
        <Stat label="Total faturas" value={invoices.length} icon="📄"/>
      </div>
      {uninvoiced.length>0&&(
        <div style={{background:"#fff7ed",border:"1.5px solid #fed7aa",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
          <h3 style={{margin:"0 0 10px",fontSize:14,fontWeight:800,color:"#92400e"}}>⚠️ {uninvoiced.length} serviço(s) sem fatura</h3>
          {uninvoiced.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); return (
            <div key={s.id} style={{display:"flex",alignItems:"center",gap:12,background:"white",borderRadius:10,padding:"9px 14px",marginBottom:6,flexWrap:"wrap"}}>
              <span style={{flex:1,fontWeight:700,fontSize:14}}>{cl?.name} · {fmtDate(s.date)} · {s.type}</span>
              <span style={{fontWeight:900,color:"#10b981"}}>{fmtCur(s.price)}</span>
              <Btn sm onClick={()=>generate(s)}>Gerar Fatura</Btn>
            </div>
          );})}
        </div>
      )}
      {overdue.length>0&&(
        <div style={{background:"#fef2f2",border:"1.5px solid #fca5a5",borderRadius:14,padding:"14px 18px",marginBottom:20}}>
          <h3 style={{margin:"0 0 10px",fontSize:14,fontWeight:800,color:"#dc2626"}}>🚨 Em atraso</h3>
          {overdue.map(i=>{ const cl=clients.find(c=>c.id===i.clientId); const days=Math.floor((new Date(td)-new Date(i.dueDate+"T00:00:00"))/86400000); return (
            <div key={i.id} style={{display:"flex",alignItems:"center",gap:12,background:"white",borderRadius:10,padding:"9px 14px",marginBottom:6,flexWrap:"wrap"}}>
              <span style={{flex:1}}><strong>{i.number}</strong> · {cl?.name} · <span style={{color:"#dc2626"}}>{days} dias</span></span>
              <span style={{fontWeight:900,color:"#dc2626"}}>{fmtCur(i.amount*(1+i.vatRate/100))}</span>
              <Btn sm variant="success" onClick={()=>toggle(i.id)}>Marcar pago</Btn>
            </div>
          );})}
        </div>
      )}
      <h2 style={{fontSize:16,fontWeight:800,margin:"0 0 12px"}}>Todas as Faturas</h2>
      {invoices.length===0?<Empty icon="📄" text="Sem faturas emitidas"/>
        :invoices.map(inv=>{ const cl=clients.find(c=>c.id===inv.clientId); const vat=inv.amount*(inv.vatRate/100); const od=inv.status==="pendente"&&inv.dueDate&&inv.dueDate<td; return (
          <div key={inv.id} style={{background:"white",borderRadius:14,padding:"13px 18px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:`1px solid ${od?"#fca5a5":"#f1f5f9"}`,marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{flex:1,minWidth:180}}><div style={{fontWeight:900,fontSize:15}}>{inv.number}</div><div style={{fontSize:13,color:"#64748b",marginTop:2}}>{cl?.name} · {fmtDate(inv.date)}{inv.dueDate?` · venc. ${fmtDate(inv.dueDate)}`:""}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontWeight:900,fontSize:16}}>{fmtCur(inv.amount+vat)}</div><div style={{fontSize:11,color:"#94a3b8"}}>Base {fmtCur(inv.amount)} + IVA {inv.vatRate}%</div></div>
              <Badge status={inv.status}/>
              <Btn sm variant={inv.status==="pago"?"secondary":"success"} onClick={()=>toggle(inv.id)}>{inv.status==="pago"?"↩ Reverter":"✓ Pago"}</Btn>
            </div>
          </div>
        );})}
      <div style={{background:"#f0fdf4",border:"1.5px solid #bbf7d0",borderRadius:14,padding:"14px 18px",marginTop:20}}>
        <p style={{margin:0,fontSize:13,color:"#15803d",fontWeight:600,lineHeight:1.6}}>ℹ️ Para faturação certificada AT, usa <strong>Moloni</strong>, <strong>InvoiceXpress</strong> ou <strong>Primavera</strong>. Exporta via CSV acima.</p>
      </div>
    </div>
  );
}

// ─── EXPENSES PAGE ────────────────────────────────────────────
function Expenses(){
  const {expenses,vehicles,services,saveExpense,deleteExpense}=useData();
  const [modal,setModal]=useState(null);
  const [f,setF]=useState({});
  const [mFilter,setMFilter]=useState(today().slice(0,7));
  const [saving,setSaving]=useState(false);
  const {toast,show}=useToast();
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const openNew=()=>{setF({category:"combustível",amount:"",date:today(),vehicleId:"",notes:""});setModal("form");};
  const openEdit=e=>{setF({...e});setModal("form");};
  const save=async()=>{
    if(!f.amount||!f.date){alert("Valor e data obrigatórios.");return;}
    setSaving(true);
    await saveExpense({...f,amount:Number(f.amount)});
    show(f.id?"Atualizada ✓":"Adicionada ✓");
    setSaving(false); setModal(null);
  };
  const del=async id=>{if(confirm("Eliminar despesa?")){await deleteExpense(id);show("Eliminado","info");}};

  const filtered=expenses.filter(e=>e.date.startsWith(mFilter)).sort((a,b)=>b.date.localeCompare(a.date));
  const total=filtered.reduce((a,e)=>a+(e.amount||0),0);
  const mRev=services.filter(s=>mo(s.date)===mFilter&&s.status==="concluído").reduce((a,s)=>a+(s.price||0),0);
  const byCat=EXP_CATS.map(c=>({name:c,val:filtered.filter(e=>e.category===c).reduce((a,e)=>a+(e.amount||0),0)})).filter(x=>x.val>0);
  const months=useMemo(()=>{ const s=new Set(expenses.map(e=>e.date.slice(0,7))); return [...s].sort().reverse().slice(0,12); },[expenses]);
  const ci={combustível:"⛽",portagens:"🛣️",manutenção:"🔧",pneus:"🔩",seguro:"🛡️",limpeza:"🧹",multas:"📋",outros:"💸"};

  return (
    <div>
      {toast&&<Toast {...toast}/>}
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Despesas</h1>
        <Btn onClick={openNew}>+ Nova Despesa</Btn>
      </div>
      <div style={{display:"flex",gap:8,marginBottom:18,alignItems:"center",flexWrap:"wrap"}}>
        <select value={mFilter} onChange={e=>setMFilter(e.target.value)} style={{...is,width:"auto",minWidth:160}}>
          <option value={today().slice(0,7)}>Este mês</option>
          {months.filter(m=>m!==today().slice(0,7)).map(m=><option key={m} value={m}>{m}</option>)}
        </select>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:22}}>
        <Stat label="Despesas" value={fmtCur(total)} color="#ef4444" icon="📤"/>
        <Stat label="Receita" value={fmtCur(mRev)} color="#10b981" icon="📥"/>
        <Stat label="Margem" value={fmtCur(mRev-total)} color={mRev-total>=0?"#10b981":"#ef4444"} icon="📊"/>
      </div>
      {byCat.length>0&&(
        <div style={{background:"white",borderRadius:14,padding:18,marginBottom:18,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
          <h3 style={{margin:"0 0 12px",fontSize:14,fontWeight:800}}>Por categoria</h3>
          <div style={{display:"flex",flexWrap:"wrap",gap:10}}>
            {byCat.sort((a,b)=>b.val-a.val).map((c,i)=>(
              <div key={c.name} style={{background:"#f8fafc",borderRadius:10,padding:"9px 14px",border:`1.5px solid ${PC[i%PC.length]}44`}}>
                <div style={{fontSize:12,fontWeight:700,color:"#374151",textTransform:"capitalize"}}>{ci[c.name]||"💸"} {c.name}</div>
                <div style={{fontSize:15,fontWeight:900,color:PC[i%PC.length]}}>{fmtCur(c.val)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {filtered.length===0?<Empty icon="📤" text="Sem despesas" action={openNew} al="Registar"/>
        :filtered.map(e=>{ const vh=vehicles.find(v=>v.id===e.vehicleId); return (
          <div key={e.id} style={{background:"white",borderRadius:14,padding:"12px 16px",boxShadow:"0 1px 3px rgba(0,0,0,0.06)",border:"1px solid #f1f5f9",display:"flex",alignItems:"center",gap:12,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:22}}>{ci[e.category]||"💸"}</span>
            <div style={{flex:1,minWidth:140}}><div style={{fontWeight:700,fontSize:14,textTransform:"capitalize"}}>{e.category}</div><div style={{fontSize:12,color:"#94a3b8"}}>{fmtDate(e.date)}{vh?` · ${vh.plate}`:""}  {e.notes&&`· ${e.notes}`}</div></div>
            <span style={{fontWeight:900,fontSize:16,color:"#ef4444"}}>{fmtCur(e.amount)}</span>
            <div style={{display:"flex",gap:5}}>
              <Btn xs variant="ghost" onClick={()=>openEdit(e)}>✏️</Btn>
              <Btn xs variant="danger" onClick={()=>del(e.id)}>🗑</Btn>
            </div>
          </div>
        );})}
      {modal==="form"&&(
        <Modal title={f.id?"Editar Despesa":"Nova Despesa"} onClose={()=>setModal(null)}>
          <G2><Sel label="Categoria" value={f.category||"combustível"} onChange={e=>s("category",e.target.value)} opts={EXP_CATS.map(c=>({v:c,l:c.charAt(0).toUpperCase()+c.slice(1)}))}/><Inp label="Valor (€) *" type="number" step="0.01" value={f.amount||""} onChange={e=>s("amount",e.target.value)} placeholder="0.00"/></G2>
          <G2><Inp label="Data *" type="date" value={f.date||today()} onChange={e=>s("date",e.target.value)}/><Sel label="Viatura" value={f.vehicleId||""} onChange={e=>s("vehicleId",e.target.value||null)} opts={vehicles.map(v=>({v:v.id,l:`${v.plate} · ${v.model}`}))}/></G2>
          <Inp label="Notas" value={f.notes||""} onChange={e=>s("notes",e.target.value)} placeholder="Fornecedor, referência..."/>
          <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}><Btn variant="secondary" onClick={()=>setModal(null)}>Cancelar</Btn><Btn loading={saving} onClick={save}>{f.id?"Guardar":"Adicionar"}</Btn></div>
        </Modal>
      )}
    </div>
  );
}

// ─── REPORTS PAGE ─────────────────────────────────────────────
function Reports(){
  const {services,expenses,clients,drivers}=useData();
  const [period,setPeriod]=useState("6m");
  const done=services.filter(s=>s.status==="concluído");
  const tRev=done.reduce((a,s)=>a+(s.price||0),0);
  const tKm=done.reduce((a,s)=>a+(s.km||0),0);
  const tExp=expenses.reduce((a,e)=>a+(e.amount||0),0);
  const avgP=done.length?tRev/done.length:0;
  const durs=done.filter(s=>s.startTime&&s.endTime).map(s=>durMins(s.startTime,s.endTime)).filter(Boolean);
  const avgD=durs.length?Math.round(durs.reduce((a,b)=>a+b)/durs.length):null;
  const months=period==="3m"?3:period==="6m"?6:12;

  const chart=useMemo(()=>Array.from({length:months},(_,i)=>{ const d=new Date(); d.setMonth(d.getMonth()-(months-1-i)); const k=d.toISOString().slice(0,7); const ms=services.filter(s=>mo(s.date)===k); const rev=ms.filter(s=>s.status==="concluído").reduce((a,s)=>a+(s.price||0),0); const exp=expenses.filter(e=>mo(e.date)===k).reduce((a,e)=>a+(e.amount||0),0); return {month:d.toLocaleDateString("pt-PT",{month:"short"}),receita:rev,despesas:exp,margem:rev-exp,total:ms.length,concluidos:ms.filter(s=>s.status==="concluído").length}; }),[services,expenses,months]);

  const byType=SVC_TYPES.map(t=>({name:t.charAt(0).toUpperCase()+t.slice(1),value:done.filter(s=>s.type===t).reduce((a,s)=>a+(s.price||0),0),count:done.filter(s=>s.type===t).length})).filter(x=>x.count>0);
  const byDriver=drivers.map(d=>{ const ds=done.filter(s=>s.driverId===d.id); return {name:d.name,receita:ds.reduce((a,s)=>a+(s.price||0),0),servicos:ds.length,km:ds.reduce((a,s)=>a+(s.km||0),0)}; }).filter(x=>x.servicos>0);
  const topC=[...clients].map(c=>{ const cs=done.filter(s=>s.clientId===c.id); return {name:c.name,rev:cs.reduce((a,s)=>a+(s.price||0),0),count:cs.length}; }).filter(x=>x.count>0).sort((a,b)=>b.rev-a.rev).slice(0,6);

  const exportCSV=()=>{ const rows=done.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); const dr=drivers.find(d=>d.id===s.driverId); return [fmtDate(s.date),s.type,cl?.name||"",s.origin,s.destination,s.price,s.km||"",s.startTime||"",s.endTime||"",dr?.name||""].join(";"); }); const csv=["Data;Tipo;Cliente;Origem;Destino;Valor;KM;Início;Fim;Motorista",...rows].join("\n"); const blob=new Blob([csv],{type:"text/csv"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="relatorio.csv"; a.click(); };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:20,flexWrap:"wrap",gap:12}}>
        <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:0}}>Relatórios</h1>
        <div style={{display:"flex",gap:8}}>
          <div style={{display:"flex",background:"#f1f5f9",borderRadius:10,padding:3}}>
            {["3m","6m","12m"].map(p=><button key={p} onClick={()=>setPeriod(p)} style={{padding:"6px 12px",borderRadius:8,border:"none",cursor:"pointer",fontSize:12,fontWeight:700,background:period===p?"white":"transparent",color:period===p?"#0f172a":"#64748b",fontFamily:"inherit"}}>{p}</button>)}
          </div>
          <Btn sm variant="secondary" onClick={exportCSV}>📤 CSV</Btn>
        </div>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12,marginBottom:22}}>
        <Stat label="Concluídos" value={done.length} icon="✅"/>
        <Stat label="Receita total" value={fmtCur(tRev)} color="#10b981" icon="💰"/>
        <Stat label="Despesas total" value={fmtCur(tExp)} color="#ef4444" icon="📤"/>
        <Stat label="Margem total" value={fmtCur(tRev-tExp)} color={tRev-tExp>=0?"#10b981":"#ef4444"} icon="📊"/>
        <Stat label="Preço médio" value={fmtCur(avgP)} color="#f59e0b" icon="🎯"/>
        <Stat label="KM total" value={`${tKm.toLocaleString("pt-PT")}km`} icon="🗺️"/>
        {avgD&&<Stat label="Duração média" value={fmtDur(avgD)} icon="⏱️"/>}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:18}}>
        <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9",gridColumn:"1/-1"}}>
          <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800}}>Receita vs Despesas</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chart} margin={{top:4,right:4,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="month" tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:"#94a3b8"}} axisLine={false} tickLine={false} tickFormatter={v=>`€${v}`}/>
              <Tooltip formatter={v=>[`€${v}`]} contentStyle={{borderRadius:10,fontSize:12}}/>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12}}/>
              <Bar dataKey="receita" name="Receita" fill="#10b981" radius={[4,4,0,0]}/>
              <Bar dataKey="despesas" name="Despesas" fill="#ef444455" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
          <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800}}>Margem mensal</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={chart} margin={{top:4,right:4,bottom:4,left:0}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9"/>
              <XAxis dataKey="month" tick={{fontSize:11}} axisLine={false}/>
              <YAxis tick={{fontSize:11}} axisLine={false} tickFormatter={v=>`€${v}`}/>
              <Tooltip formatter={v=>[`€${v}`,"Margem"]} contentStyle={{borderRadius:10,fontSize:12}}/>
              <Line dataKey="margem" stroke="#f59e0b" strokeWidth={3} dot={{r:4,fill:"#f59e0b"}} name="Margem"/>
            </LineChart>
          </ResponsiveContainer>
        </div>
        {byType.length>0&&(
          <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
            <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800}}>Receita por tipo</h3>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byType} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" nameKey="name">
                  {byType.map((_,i)=><Cell key={i} fill={PC[i%PC.length]}/>)}
                </Pie>
                <Tooltip formatter={v=>[fmtCur(v)]} contentStyle={{borderRadius:10,fontSize:12}}/>
                <Legend iconType="circle" iconSize={8} wrapperStyle={{fontSize:12}}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
        {topC.length>0&&(
          <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
            <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800}}>🏆 Top Clientes</h3>
            {topC.map((c,i)=>(
              <div key={c.name} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:"1px solid #f8fafc"}}>
                <span style={{fontWeight:900,color:"#94a3b8",minWidth:20,fontSize:13}}>{i+1}</span>
                <span style={{flex:1,fontWeight:700,fontSize:13}}>{c.name}</span>
                <span style={{fontSize:13,color:"#64748b"}}>{c.count}×</span>
                <span style={{fontWeight:900,color:"#10b981",fontSize:13}}>{fmtCur(c.rev)}</span>
              </div>
            ))}
          </div>
        )}
        {byDriver.length>0&&(
          <div style={{background:"white",borderRadius:16,padding:20,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9"}}>
            <h3 style={{margin:"0 0 14px",fontSize:15,fontWeight:800}}>Performance Motoristas</h3>
            {byDriver.map(d=>{ const maxR=Math.max(...byDriver.map(x=>x.receita)); return (
              <div key={d.name} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:700}}>👤 {d.name}</span>
                  <span style={{fontSize:12,color:"#64748b"}}>{d.servicos} serv · {d.km}km · <strong style={{color:"#10b981"}}>{fmtCur(d.receita)}</strong></span>
                </div>
                <div style={{background:"#f1f5f9",borderRadius:20,height:8,overflow:"hidden"}}><div style={{height:"100%",background:"linear-gradient(90deg,#f59e0b,#10b981)",borderRadius:20,width:`${maxR>0?(d.receita/maxR)*100:0}%`,transition:"width 0.5s"}}/></div>
              </div>
            );})}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SETTINGS PAGE ────────────────────────────────────────────
function Settings(){
  const {company,updateCompany,signOut}=useAuth();
  const [f,setF]=useState({ name:company?.name||"", nif:company?.nif||"", phone:company?.phone||"", email:company?.email||"", address:company?.address||"", vat_rate:company?.vat_rate||23, pay_days:company?.pay_days||30 });
  const [saved,setSaved]=useState(false);
  const [signingOut,setSigningOut]=useState(false);
  const s=(k,v)=>setF(p=>({...p,[k]:v}));
  const save=async()=>{ await updateCompany(f); setSaved(true); setTimeout(()=>setSaved(false),2000); };
  const doSignOut=async()=>{ setSigningOut(true); await signOut(); };

  return (
    <div>
      <h1 style={{fontSize:22,fontWeight:900,color:"#0f172a",margin:"0 0 22px"}}>Configurações</h1>
      <div style={{background:"white",borderRadius:16,padding:24,boxShadow:"0 1px 4px rgba(0,0,0,0.07)",border:"1px solid #f1f5f9",marginBottom:18}}>
        <Dvd label="Empresa"/>
        <G2><Inp label="Nome da empresa" value={f.name} onChange={e=>s("name",e.target.value)}/><Inp label="NIF / NIPC" value={f.nif} onChange={e=>s("nif",e.target.value)}/></G2>
        <G2><Inp label="Telemóvel" value={f.phone} onChange={e=>s("phone",e.target.value)}/><Inp label="Email" type="email" value={f.email} onChange={e=>s("email",e.target.value)}/></G2>
        <Inp label="Morada" value={f.address} onChange={e=>s("address",e.target.value)} placeholder="Rua, nº, CP, cidade"/>
        <Dvd label="Faturação"/>
        <G2><Inp label="IVA padrão (%)" type="number" value={f.vat_rate} onChange={e=>s("vat_rate",Number(e.target.value))}/><Inp label="Prazo pagamento (dias)" type="number" value={f.pay_days} onChange={e=>s("pay_days",Number(e.target.value))}/></G2>
        <div style={{display:"flex",gap:10,justifyContent:"flex-end",marginTop:8}}>
          <Btn onClick={save} variant={saved?"success":"primary"}>{saved?"✓ Guardado!":"Guardar configurações"}</Btn>
        </div>
      </div>
      <div style={{background:"#fff5f5",borderRadius:16,padding:24,border:"1.5px solid #fecaca"}}>
        <Dvd label="Sessão"/>
        <p style={{fontSize:14,color:"#64748b",margin:"0 0 14px"}}>Terminar sessão neste dispositivo.</p>
        <Btn variant="danger2" loading={signingOut} onClick={doSignOut}>Terminar sessão</Btn>
      </div>
    </div>
  );
}

// ─── DRIVER MODE ──────────────────────────────────────────────
function DriverMode({onExit}){
  const {drivers,services,clients,updateServiceStatus}=useData();
  const [dId,setDId]=useState("");
  const [tab,setTab]=useState("hoje");
  const driver=drivers.find(d=>d.id===dId);
  const td=today();
  const todaySvcs=dId?services.filter(s=>s.driverId===dId&&s.date===td).sort((a,b)=>a.time.localeCompare(b.time)):[];
  const future=dId?services.filter(s=>s.driverId===dId&&s.date>td&&["pendente","confirmado"].includes(s.status)).sort((a,b)=>a.date.localeCompare(b.date)):[];

  const checkin=async s=>{ await updateServiceStatus(s.id,"em curso",{start_time:s.startTime||nowTime()}); };
  const checkout=async s=>{ await updateServiceStatus(s.id,"concluído",{end_time:nowTime()}); };

  if(!dId) return (
    <div style={{minHeight:"100vh",background:"#0f172a",display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"white",borderRadius:24,padding:32,maxWidth:360,width:"100%",textAlign:"center",boxShadow:"0 32px 80px rgba(0,0,0,0.5)"}}>
        <div style={{fontSize:52,marginBottom:12}}>🚛</div>
        <h2 style={{fontSize:20,fontWeight:900,color:"#0f172a",margin:"0 0 8px"}}>App Motorista</h2>
        <p style={{fontSize:14,color:"#64748b",margin:"0 0 22px"}}>Seleciona o teu perfil.</p>
        {drivers.length===0?<p style={{color:"#94a3b8",fontSize:14}}>Sem motoristas registados.</p>
          :<div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
            {drivers.map(d=>(
              <button key={d.id} onClick={()=>setDId(d.id)} style={{padding:"13px 18px",borderRadius:12,border:"1.5px solid #e2e8f0",cursor:"pointer",background:"#f8fafc",textAlign:"left",display:"flex",alignItems:"center",gap:12,fontFamily:"inherit"}}>
                <span style={{fontSize:22}}>👤</span>
                <div><div style={{fontWeight:800,color:"#0f172a"}}>{d.name}</div><div style={{fontSize:12,color:"#94a3b8"}}>{d.status} · Carta {d.license}</div></div>
              </button>
            ))}
          </div>}
        <Btn variant="secondary" full onClick={onExit}>← Voltar à gestão</Btn>
      </div>
    </div>
  );

  return (
    <div style={{minHeight:"100vh",background:"#0f172a",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <div style={{background:"#1e293b",padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:20}}>👤</span><div><div style={{color:"white",fontWeight:900,fontSize:15}}>{driver?.name}</div><div style={{color:"#64748b",fontSize:12}}>{new Date().toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"short"})}</div></div></div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setDId("")} style={{background:"#334155",border:"none",borderRadius:8,padding:"6px 12px",color:"#94a3b8",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Sair</button>
          <button onClick={onExit} style={{background:"#f59e0b",border:"none",borderRadius:8,padding:"6px 12px",color:"white",cursor:"pointer",fontSize:12,fontWeight:700,fontFamily:"inherit"}}>Gestão</button>
        </div>
      </div>
      <div style={{padding:16}}>
        <div style={{display:"flex",background:"#1e293b",borderRadius:12,padding:4,marginBottom:18}}>
          {[["hoje",`Hoje (${todaySvcs.length})`],["proximos","Próximos"]].map(([v,l])=>(
            <button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"10px 0",borderRadius:9,border:"none",cursor:"pointer",fontSize:13,fontWeight:700,background:tab===v?"white":"transparent",color:tab===v?"#0f172a":"#64748b",fontFamily:"inherit"}}>{l}</button>
          ))}
        </div>
        {tab==="hoje"&&(
          todaySvcs.length===0?<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:48,marginBottom:12}}>✅</div><div style={{color:"#64748b",fontSize:15,fontWeight:600}}>Sem serviços para hoje</div></div>
            :todaySvcs.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); const col=SC[s.status]||"#94a3b8"; return (
              <div key={s.id} style={{background:"white",borderRadius:18,overflow:"hidden",marginBottom:14}}>
                <div style={{background:col,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                  <span style={{color:"white",fontWeight:900,fontSize:18}}>{s.time}</span>
                  <span style={{color:"white",fontWeight:700,fontSize:13,textTransform:"capitalize"}}>{s.status}</span>
                </div>
                <div style={{padding:"16px 18px"}}>
                  <div style={{fontWeight:900,fontSize:17,marginBottom:8}}>{cl?.name}</div>
                  <div style={{fontSize:14,color:"#475569",marginBottom:4,lineHeight:1.5}}><span style={{fontWeight:700}}>De:</span> {s.origin}</div>
                  <div style={{fontSize:14,color:"#475569",marginBottom:12,lineHeight:1.5}}><span style={{fontWeight:700}}>Para:</span> {s.destination}</div>
                  {s.notes&&<div style={{fontSize:13,color:"#64748b",background:"#f8fafc",borderRadius:10,padding:"10px 14px",marginBottom:14}}>📝 {s.notes}</div>}
                  {cl?.phone&&<a href={`tel:${cl.phone.replace(/\s/g,"")}`} style={{display:"flex",alignItems:"center",gap:8,background:"#f0fdf4",borderRadius:10,padding:"10px 14px",textDecoration:"none",color:"#16a34a",fontWeight:700,fontSize:14,marginBottom:10}}>📞 Ligar: {cl.phone}</a>}
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(s.destination)}`} target="_blank" rel="noopener" style={{display:"flex",alignItems:"center",gap:8,background:"#eff6ff",borderRadius:10,padding:"10px 14px",textDecoration:"none",color:"#1d4ed8",fontWeight:700,fontSize:14,marginBottom:14}}>🗺️ Abrir no Google Maps</a>
                  {s.status==="confirmado"&&<Btn full variant="success" onClick={()=>checkin(s)}>▶ Check-in — Iniciar</Btn>}
                  {s.status==="em curso"&&<div><div style={{background:"#f5f3ff",borderRadius:10,padding:"10px 14px",marginBottom:10,fontSize:13,color:"#6d28d9",fontWeight:700}}>⏱️ Em curso desde {s.startTime}</div><Btn full onClick={()=>checkout(s)}>✅ Check-out — Concluir</Btn></div>}
                  {s.status==="concluído"&&<div style={{background:"#f0fdf4",borderRadius:10,padding:"12px 16px",textAlign:"center",color:"#16a34a",fontWeight:800,fontSize:15}}>✅ {s.startTime} → {s.endTime}</div>}
                  {s.status==="pendente"&&<div style={{background:"#fffbeb",borderRadius:10,padding:"10px 14px",textAlign:"center",color:"#92400e",fontWeight:700,fontSize:13}}>⏳ Aguardar confirmação</div>}
                </div>
              </div>
            );})
        )}
        {tab==="proximos"&&(
          future.length===0?<div style={{textAlign:"center",padding:"60px 20px"}}><div style={{fontSize:48,marginBottom:12}}>📅</div><div style={{color:"#64748b",fontSize:15,fontWeight:600}}>Sem serviços futuros</div></div>
            :future.map(s=>{ const cl=clients.find(c=>c.id===s.clientId); return (
              <div key={s.id} style={{background:"white",borderRadius:16,padding:"15px 18px",marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:8,flexWrap:"wrap",gap:6}}>
                  <div style={{fontWeight:900,fontSize:14}}>{new Date(s.date+"T00:00:00").toLocaleDateString("pt-PT",{weekday:"long",day:"numeric",month:"long"})} às {s.time}</div>
                  <Badge status={s.status}/>
                </div>
                <div style={{fontWeight:800,fontSize:15,marginBottom:4}}>{cl?.name}</div>
                <div style={{fontSize:13,color:"#64748b"}}>📍 {s.origin} → {s.destination}</div>
                {s.notes&&<div style={{fontSize:12,color:"#94a3b8",marginTop:6}}>📝 {s.notes}</div>}
              </div>
            );})
        )}
      </div>
    </div>
  );
}

// ─── NAVIGATION & MAIN SHELL ──────────────────────────────────
const NAV=[
  {id:"dashboard",icon:"📊",label:"Dashboard"},
  {id:"services", icon:"🚛",label:"Serviços"},
  {id:"calendar", icon:"📅",label:"Calendário"},
  {id:"clients",  icon:"👥",label:"Clientes"},
  {id:"drivers",  icon:"👤",label:"Motoristas"},
  {id:"fleet",    icon:"🚐",label:"Frota"},
  {id:"invoicing",icon:"📄",label:"Faturação"},
  {id:"expenses", icon:"📤",label:"Despesas"},
  {id:"reports",  icon:"📈",label:"Relatórios"},
  {id:"settings", icon:"⚙️", label:"Configurações"},
];
const MOB_NAV=[
  {id:"dashboard",icon:"📊",label:"Início"},
  {id:"services", icon:"🚛",label:"Serviços"},
  {id:"calendar", icon:"📅",label:"Agenda"},
  {id:"clients",  icon:"👥",label:"Clientes"},
  {id:"reports",  icon:"📈",label:"Relatórios"},
];

function Shell(){
  const {company,signOut}=useAuth();
  const {services,invoices}=useData();
  const [tab,setTab]=useState("dashboard");
  const [sideOpen,setSideOpen]=useState(false);
  const [driverMode,setDriverMode]=useState(false);
  const isMobile=useIsMobile();
  const goTo=useCallback(id=>{setTab(id);setSideOpen(false);},[]);

  if(driverMode) return <DriverMode onExit={()=>setDriverMode(false)}/>;

  const pendCount=services.filter(s=>["pendente","confirmado","em curso"].includes(s.status)).length;
  const overdueCount=invoices.filter(i=>i.status==="pendente"&&i.dueDate&&i.dueDate<today()).length;

  const page=()=>{
    switch(tab){
      case "dashboard": return <Dashboard goTo={goTo}/>;
      case "services":  return <Services/>;
      case "calendar":  return <Calendar/>;
      case "drivers":   return <Drivers/>;
      case "fleet":     return <Fleet/>;
      case "clients":   return <Clients/>;
      case "invoicing": return <Invoicing/>;
      case "expenses":  return <Expenses/>;
      case "reports":   return <Reports/>;
      case "settings":  return <Settings/>;
      default: return null;
    }
  };

  const SideContent=()=>(
    <div style={{display:"flex",flexDirection:"column",height:"100%",overflowY:"auto"}}>
      <div style={{padding:"18px 14px 12px",borderBottom:"1px solid #1e293b"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
          <span style={{fontSize:26}}>🚛</span>
          <div><div style={{color:"white",fontWeight:900,fontSize:15}}>{company?.name||"TransGest"}</div><div style={{color:"#475569",fontSize:11}}>Gestão de Transportes</div></div>
        </div>
        <button onClick={()=>{setSideOpen(false);setDriverMode(true);}} style={{width:"100%",padding:"8px 12px",background:"#1e293b",border:"1.5px solid #334155",borderRadius:10,color:"#94a3b8",cursor:"pointer",fontSize:12,fontWeight:700,display:"flex",alignItems:"center",gap:8,fontFamily:"inherit"}}>
          <span>👤</span> Modo Motorista
        </button>
      </div>
      <nav style={{padding:"10px 10px",flex:1,display:"flex",flexDirection:"column",gap:2}}>
        {NAV.map(n=>{ const badge=n.id==="services"&&pendCount>0?pendCount:n.id==="invoicing"&&overdueCount>0?overdueCount:null; return (
          <button key={n.id} onClick={()=>goTo(n.id)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,padding:"10px 14px",borderRadius:10,border:"none",cursor:"pointer",textAlign:"left",background:tab===n.id?"#f59e0b":"transparent",color:tab===n.id?"white":"#64748b",fontWeight:tab===n.id?800:500,fontSize:13,fontFamily:"inherit"}}>
            <div style={{display:"flex",alignItems:"center",gap:12}}><span style={{fontSize:15,width:20,textAlign:"center",flexShrink:0}}>{n.icon}</span><span>{n.label}</span></div>
            {badge&&<span style={{background:tab===n.id?"rgba(255,255,255,0.3)":"#ef4444",color:"white",fontSize:10,fontWeight:900,padding:"1px 7px",borderRadius:20}}>{badge}</span>}
          </button>
        );})}
      </nav>
      <div style={{padding:"12px 14px",borderTop:"1px solid #1e293b"}}>
        <div style={{fontSize:11,color:"#334155",textAlign:"center",lineHeight:1.5}}>
          <div style={{fontWeight:700,color:"#475569"}}>{services.length} serviços sincronizados</div>
          <div>☁️ Supabase · Realtime ativo</div>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{display:"flex",minHeight:"100vh",background:"#f1f5f9",fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      {!isMobile&&<div style={{width:220,background:"#0f172a",flexShrink:0,position:"sticky",top:0,height:"100vh",overflowY:"auto"}}><SideContent/></div>}
      {isMobile&&sideOpen&&(
        <div style={{position:"fixed",inset:0,zIndex:600}}>
          <div style={{position:"absolute",inset:0,background:"rgba(0,0,0,0.6)"}} onClick={()=>setSideOpen(false)}/>
          <div style={{position:"absolute",left:0,top:0,bottom:0,width:260,background:"#0f172a",overflowY:"auto",display:"flex",flexDirection:"column"}}><SideContent/></div>
        </div>
      )}
      <div style={{flex:1,display:"flex",flexDirection:"column",minWidth:0}}>
        <div style={{background:"white",padding:"11px 16px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 1px 3px rgba(0,0,0,0.08)",position:"sticky",top:0,zIndex:100,flexShrink:0}}>
          <button onClick={()=>setSideOpen(true)} style={{background:"#f1f5f9",border:"none",borderRadius:10,width:36,height:36,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>☰</button>
          <span style={{flex:1,fontWeight:900,fontSize:15,color:"#0f172a",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{NAV.find(n=>n.id===tab)?.icon} {NAV.find(n=>n.id===tab)?.label}</span>
          <div style={{display:"flex",gap:6,flexShrink:0}}>
            {pendCount>0&&<span style={{background:"#fef3c7",color:"#92400e",padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:800}}>🚛 {pendCount}</span>}
            {overdueCount>0&&<span style={{background:"#fee2e2",color:"#dc2626",padding:"4px 10px",borderRadius:20,fontSize:11,fontWeight:800}}>⚠️ {overdueCount}</span>}
            {!isMobile&&<button onClick={()=>setDriverMode(true)} style={{background:"#0f172a",border:"none",borderRadius:10,padding:"7px 12px",cursor:"pointer",fontSize:12,fontWeight:700,color:"white",fontFamily:"inherit"}}>👤 Motorista</button>}
          </div>
        </div>
        <div style={{flex:1,padding:isMobile?"13px 13px 82px":"22px 24px",maxWidth:1240,width:"100%",margin:"0 auto",boxSizing:"border-box",overflowX:"hidden"}}>
          {page()}
        </div>
        {isMobile&&(
          <div style={{position:"fixed",bottom:0,left:0,right:0,background:"white",borderTop:"1px solid #f1f5f9",display:"flex",padding:"5px 2px",zIndex:200,boxShadow:"0 -4px 16px rgba(0,0,0,0.08)"}}>
            {MOB_NAV.map(n=>(
              <button key={n.id} onClick={()=>goTo(n.id)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 2px",border:"none",cursor:"pointer",background:"transparent",fontFamily:"inherit"}}>
                <span style={{fontSize:19}}>{n.icon}</span>
                <span style={{fontSize:9,fontWeight:tab===n.id?800:500,color:tab===n.id?"#f59e0b":"#94a3b8"}}>{n.label}</span>
                {tab===n.id&&<div style={{width:18,height:2,background:"#f59e0b",borderRadius:2}}/>}
              </button>
            ))}
            <button onClick={()=>setSideOpen(true)} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,padding:"6px 2px",border:"none",cursor:"pointer",background:"transparent",fontFamily:"inherit"}}>
              <span style={{fontSize:19}}>☰</span>
              <span style={{fontSize:9,fontWeight:500,color:"#94a3b8"}}>Mais</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ROOT ─────────────────────────────────────────────────────
function AppInner(){
  const {user,loading}=useAuth();
  if(loading) return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",background:"#0f172a",flexDirection:"column",gap:14,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
      <span style={{fontSize:56}}>🚛</span>
      <span style={{fontSize:16,color:"#64748b",fontWeight:700}}>A carregar TransGest…</span>
    </div>
  );
  if(!user) return <AuthScreen/>;
  return <DataProvider><Shell/></DataProvider>;
}

export default function App(){
  return <AuthProvider><AppInner/></AuthProvider>;
}
