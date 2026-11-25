import React, {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, BookOpen, BookOpenCheck, Check, ChevronRight, CloudUpload, FileImage, FileText, FolderOpen, GraduationCap, Image, LayoutDashboard, LockKeyhole, LogOut, Menu, MessageCircle, MoreHorizontal, Paperclip, Plus, Search, Send, ShieldCheck, Sparkles, Users, Video, X, UserRound, LoaderCircle, Copy, CalendarDays, ExternalLink, BookMarked, ListChecks, TextSelect, CheckCircle2, AlertCircle, Settings2, UserPlus
} from 'lucide-react';
import {supabase, ready, api, fileObjectURL, API_URL, normalizeUsername, isValidUsername, usernameAuthEmail} from './supabase';

const samples = {
  profiles: [
    {id:'demo-1', full_name:'Alex Morgan', username:'alex', role:'admin'},
    {id:'demo-2', full_name:'Sarah Chen', username:'sarah', role:'student'},
    {id:'demo-3', full_name:'Daniel James', username:'daniel', role:'student'},
    {id:'demo-4', full_name:'Priya Patel', username:'priya', role:'student'},
    {id:'demo-5', full_name:'Leo Carter', username:'leo', role:'student'}
  ],
  modules: [
    {id:'mod1',title:'Introduction to Programming',category:'Computer Science',description:'Core programming concepts, algorithms and problem solving.',color:'violet',semester:1,created_at:'2026-10-30'},
    {id:'mod2',title:'Database Management Systems',category:'Information Systems',description:'SQL, relational modeling, normalization and database design.',color:'blue',semester:2,created_at:'2026-10-29'},
    {id:'mod3',title:'Business Process Management',category:'Business',description:'Model and optimize business processes with BPMN.',color:'orange',semester:2,created_at:'2026-10-27'},
    {id:'mod4',title:'Applied Statistics',category:'Mathematics',description:'Explore statistics, experiments and data visualization.',color:'teal',semester:3,created_at:'2026-10-25'}
  ],
  resources: [
    {id:'res1',module_id:'mod1',uploader_id:'demo-2',title:'Python Basics — Week 01',file_name:'python_intro.pdf',mime_type:'application/pdf',size_bytes:2400000,created_at:'2026-11-11'},
    {id:'res2',module_id:'mod2',uploader_id:'demo-3',title:'ER Diagram Examples',file_name:'er_diagrams.png',mime_type:'image/png',size_bytes:1100000,created_at:'2026-11-10'},
    {id:'res3',module_id:'mod3',uploader_id:'demo-4',title:'BPMN Activity Exercises',file_name:'bpmn_exercises.pdf',mime_type:'application/pdf',size_bytes:3700000,created_at:'2026-11-10'},
    {id:'res4',module_id:'mod4',uploader_id:'demo-1',title:'Hypothesis Testing Lecture',file_name:'statistics_slides.pptx',mime_type:'application/vnd.openxmlformats-officedocument.presentationml.presentation',size_bytes:4100000,created_at:'2026-11-08'},
    {id:'res5',module_id:'mod1',uploader_id:'demo-2',title:'Loops and Conditions Guide',file_name:'loops_guide.pdf',mime_type:'application/pdf',size_bytes:900000,created_at:'2026-11-09'}
  ],
  chats: [
    {id:'chat1',is_group:true,title:'Programming Study Group',created_by:'demo-1',created_at:'2026-11-01'},
    {id:'chat2',is_group:false,title:'',created_at:'2026-11-02'},
    {id:'chat3',is_group:true,title:'Database Project Team',created_by:'demo-1',created_at:'2026-11-04'}
  ],
  members: [
    {chat_id:'chat1',user_id:'demo-1'},{chat_id:'chat1',user_id:'demo-2'},{chat_id:'chat1',user_id:'demo-3'},
    {chat_id:'chat2',user_id:'demo-1'},{chat_id:'chat2',user_id:'demo-4'},
    {chat_id:'chat3',user_id:'demo-1'},{chat_id:'chat3',user_id:'demo-3'},{chat_id:'chat3',user_id:'demo-5'}
  ],
  messages: [
    {id:'msg1',chat_id:'chat1',sender_id:'demo-2',body:'Hey everyone! I uploaded the Python notes from today’s lecture.',created_at:'2026-11-12T08:30:00Z'},
    {id:'msg2',chat_id:'chat1',sender_id:'demo-3',body:'Awesome! The examples are really useful 🙌',created_at:'2026-11-12T08:35:00Z'},
    {id:'msg3',chat_id:'chat1',sender_id:'demo-1',body:'Great work team! Let’s revise loops together this weekend.',created_at:'2026-11-12T09:10:00Z'},
    {id:'msg4',chat_id:'chat2',sender_id:'demo-4',body:'Hi Alex! Did you get a chance to review the assignment?',created_at:'2026-11-12T08:35:00Z'},
    {id:'msg5',chat_id:'chat3',sender_id:'demo-5',body:'I have shared the new ER diagram!',created_at:'2026-11-10T08:35:00Z'}
  ]
};
const demoUser = {id:'demo-1',username:'alex'};
const colorMap=['violet','blue','orange','teal','pink'];
// To support a different programme duration, change this list and the SQL check constraint together.
const semesterNumbers=[1,2,3,4,5,6,7,8];
// Intake years available during registration.
const intakeYears = Array.from(
  { length: new Date().getFullYear() - 2020 },
  (_, i) => new Date().getFullYear() + 1 - i
);
const moduleSemester=m=>m?.semester==null?'unassigned':Number(m.semester);
const semesterLabel=semester=>semester==='unassigned'?'Unassigned modules':`Semester ${semester}`;
const validUploadTypes = '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.docx,.pptx,.xlsx,.mp4,.webm,.mp3,.wav,.ogg,.m4a';
const featureIcons = [BookOpen,MessageCircle,Users,Sparkles];
function initials(name='?'){return name.trim().split(/\s+/).slice(0,2).map(v=>v[0]?.toUpperCase()).join('')||'?';}
function when(date){if(!date)return '';const d=new Date(date);return Number.isNaN(d.valueOf())?'':d.toLocaleDateString(undefined,{month:'short',day:'numeric'});}
function time(date){if(!date)return '';const d=new Date(date);return Number.isNaN(d.valueOf())?'':d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'});}
function bytes(n){if(!n)return '—';return n>=1048576?`${(n/1048576).toFixed(1)} MB`:`${Math.max(1,Math.round(n/1024))} KB`;}
function fileIcon(mime=''){return mime.startsWith('image/')?FileImage:mime.startsWith('video/')?Video:FileText;}
function FileIcon({mime,size=20}) {const Icon=fileIcon(mime);return <Icon size={size}/>;}
const avatarUrls = new Map();
function Avatar({profile,size=38,online=false,shape='circle'}){
  const [src,setSrc]=useState(null);
  useEffect(()=>{let live=true;const id=profile?.avatar_file_id;
    if(!id||!ready){setSrc(null);return;}
    if(avatarUrls.has(id)){setSrc(avatarUrls.get(id));return;}
    fileObjectURL(id).then(url=>{avatarUrls.set(id,url);if(live)setSrc(url);}).catch(()=>{});
    return ()=>{live=false;};
  },[profile?.avatar_file_id]);
  const colors=['#efcfa6','#cfc5f7','#b1dce1','#f0b7c8','#abd3b5'];
  const key=(profile?.full_name||'?').charCodeAt(0)%colors.length;
  return <span className={`avatar ${shape==='square'?'avatar-square':''}`} style={{width:size,height:size,fontSize:Math.round(size*.34),background:src?'#eef0f9':colors[key]}} title={profile?.full_name||'Student'}>
    {src?<img src={src} alt=""/>:<span>{initials(profile?.full_name)}</span>}
    {online&&<i className="online-dot"/>}
  </span>;
}
function Loading({label='Loading...'}){return <div className="loading-state"><LoaderCircle className="spin" size={26}/><span>{label}</span></div>;}
function Blank({icon:Icon=FolderOpen,title,desc,action}){return <div className="blank"><div className="blank-icon"><Icon size={27}/></div><h3>{title}</h3><p>{desc}</p>{action}</div>;}
function Modal({title,subtitle,children,onClose,wide=false}){useEffect(()=>{const onEsc=e=>{if(e.key==='Escape')onClose();};window.addEventListener('keydown',onEsc);return ()=>window.removeEventListener('keydown',onEsc);},[onClose]);return <div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-btn" onClick={onClose} aria-label="Close"><X size={19}/></button></div>{children}</section></div>}
function Toast({toast,onDismiss}){if(!toast)return null;return <div className={`toast ${toast.kind==='error'?'toast-error':''}`} role="status">{toast.kind==='error'?<AlertCircle size={18}/>:<CheckCircle2 size={18}/>}<span>{toast.message}</span><button onClick={onDismiss}><X size={16}/></button></div>}
function Logomark({small=false}){return <span className={`logo-mark ${small?'logo-small':''}`}><GraduationCap size={small?20:26} strokeWidth={2.15}/></span>}
function Login(){
  const [tab,setTab]=useState('login'),[name,setName]=useState(''),[username,setUsername]=useState(''),[password,setPassword]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const [intakeYear, setIntakeYear] = useState('');
  const submit=async(e)=>{e.preventDefault();setBusy(true);setError('');try{
    const handle=normalizeUsername(username);
    if(!isValidUsername(handle)) throw new Error('Username must be 3–24 characters, start with a letter and use only letters, numbers or underscores.');
    const alias=usernameAuthEmail(handle);
    if(tab==='signup'){
      if(name.trim().length<2) throw new Error('Enter your full name.');
      if (!intakeYear || !intakeYears.includes(Number(intakeYear))) {
        throw new Error('Please select your intake year.');
      }
      const { data, error } = await supabase.auth.signUp({email: alias,password,options: {data: {full_name: name.trim(),username: handle,intake_year: Number(intakeYear)}  }});
      if(error)throw error;
      if(!data?.session) throw new Error('Disable Confirm email in Supabase Auth settings. Username accounts cannot receive verification emails.');
    } else {
      const {error}=await supabase.auth.signInWithPassword({email:alias,password});
      if(error)throw error;
    }
  }catch(e){setError(/user already registered/i.test(e.message)?'That username is already taken. Choose another.':e.message);}finally{setBusy(false);}};
  return <div className="auth-layout"><div className="auth-art"><div className="auth-brand"><Logomark/><b>MORA-BPM<span></span></b></div><div className="auth-hero"><div className="eyebrow light"><span className="eyebrow-dot"/> YOUR SPACE TO LEARN TOGETHER</div><h1>Better learning<br/>happens <em>together.</em></h1><p>Everything you need to learn, connect, share and grow — all in one beautifully simple space.</p><div className="auth-features"><div><BookOpenCheck size={21}/> Shared course resources</div><div><MessageCircle size={21}/> Real-time study chats</div><div><Sparkles size={21}/> AI-powered study tools</div></div></div><div className="auth-decoration auth-dec-one"/><div className="auth-decoration auth-dec-two"/><div className="auth-bottom">Made for curious minds, built for your campus. ✦</div></div><div className="auth-panel"><div className="auth-mobile-brand"><Logomark small/><b>Mora-BPM<span>.</span></b></div><div className="auth-form"><div className="auth-kicker">WELCOME TO Mora - BPM</div><h2>{tab==='login'?'Welcome back 👋':'Let’s get started ✨'}</h2><p className="muted">{tab==='login'?'Sign in with your username and password.':'Create a student account without an email address.'}</p><div className="auth-tabs"><button className={tab==='login'?'selected':''} onClick={()=>{setTab('login');setError('');}}>Sign in</button><button className={tab==='signup'?'selected':''} onClick={()=>{setTab('signup');setError('');}}>Create account</button></div><form onSubmit={submit} className="stack-form">{tab==='signup'&&<label>Full name<input value={name} onChange={e=>setName(e.target.value)} required minLength={2} maxLength={80} placeholder="Your full name" autoComplete="name"/></label>}{tab === 'signup' && (
  <label>Intake year<select value={intakeYear} onChange={e => setIntakeYear(e.target.value)} required style={{width: '100%', minHeight: 48, padding: '12px',borderRadius: 10, border: '1px solid #d9deea', background: '#fff',fontSize: 14}}>
      <option value="">Select your intake year</option> {intakeYears.map(year => (<option key={year} value={year}>{year} Intake</option>))}</select><small>Select the year you joined the university.</small>
  </label>
)}<label>Username<div className="input-wrap"><UserRound size={18}/><input type="text" required value={username} onChange={e=>setUsername(e.target.value)} minLength={3} maxLength={24} pattern="[A-Za-z][A-Za-z0-9_]{2,23}" title="Start with a letter; only letters, numbers and underscores" autoCapitalize="none" spellCheck={false} autoComplete="username" placeholder="e.g. ben.25"/></div>{tab==='signup'&&<small>3–24 characters; letters, numbers, underscores. Usernames ignore capitalization.</small>}</label><label>Password<div className="input-wrap"><LockKeyhole size={18}/><input type="password" required minLength={8} value={password} onChange={e=>setPassword(e.target.value)} autoComplete={tab==='login'?'current-password':'new-password'} placeholder="Enter your password"/></div></label>{error&&<p className="form-error">{error}</p>}<button className="btn btn-primary full" type="submit" disabled={busy}>{busy?<LoaderCircle size={18} className="spin"/>:null}{tab==='login'?'Sign in to your workspace':'Create your account'}<ArrowRight size={18}/></button></form><p className="auth-footer">No email required. Keep your password safe; account recovery is handled by an administrator. Your files stay in private Google Drive storage.</p></div></div></div>;
}

function Preview(){
  const [page,setPage]=useState('dashboard'),[selectedModule,setSelectedModule]=useState(null),[activeChat,setActiveChat]=useState('chat1'),[notice,setNotice]=useState('');
  const show=()=>{setNotice('This is a visual preview. Add the .env values, deploy the Worker and run the SQL to enable live features.');setTimeout(()=>setNotice(''),5200);};
  return <Workspace demo page={page} onAssignIntake={()=>show()} setPage={v=>{setPage(v);setSelectedModule(null);}} selectedModule={selectedModule} setSelectedModule={setSelectedModule} activeChat={activeChat} setActiveChat={setActiveChat} user={demoUser} me={samples.profiles[0]} profiles={samples.profiles} modules={samples.modules} resources={samples.resources} chats={samples.chats} members={samples.members} messages={samples.messages} online={['demo-1','demo-2','demo-4','demo-5']} showToast={show} notice={notice} setNotice={setNotice} setUpload={()=>show()} setGroup={()=>show()} setCreateModule={()=>show()} setAiResource={()=>show()} onChatUser={()=>show()} onManageGroup={()=>show()} onEditSemester={()=>show()} onSignOut={()=>show()} onFile={()=>show()} onSend={()=>show()} onProfileSave={()=>show()} onAvatar={()=>show()} />;
}

function SemesterCard({number,count,onClick}){
  const unassigned=number==='unassigned';
  return <button type="button" className={`semester-card ${unassigned?'semester-card-unassigned':''}`} onClick={onClick}>
    <span className="semester-card-top"><span className="semester-year">{unassigned?'NEEDS ORGANIZING':`YEAR ${Math.ceil(number/2)}`}</span><span className="semester-card-icon"><BookOpen size={21}/></span></span>
    <span className="semester-card-number">{unassigned?'—':String(number).padStart(2,'0')}</span>
    <strong>{unassigned?'Unassigned modules':`Semester ${number}`}</strong>
    <span className="semester-card-bottom"><span>{count} {count===1?'module':'modules'}</span><span className="semester-card-arrow"><ArrowRight size={17}/></span></span>
  </button>;
}

function StudentCard({
  p,
  online,
  isAdmin,
  onChatUser,
  onAssignIntake
}) {
  return (
    <div className="person-card">
      <div className="person-top">
        <Avatar profile={p} size={60} online={online}/>

        <span className={`presence-label ${online ? 'present' : 'absent'}`}>
          <i/>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>

      <h3>{p.full_name}</h3>
      <p>@{p.username}</p>

      <span className="person-role">
        <GraduationCap size={14}/>
        Student
      </span>

      {isAdmin && (
        <label style={{display:'block',margin:'12px 0',fontSize:13}}>
          Intake year

          <select
            value={p.intake_year ?? ''}
            onChange={e => onAssignIntake(p.id, Number(e.target.value))}
            style={{
              width:'100%',
              padding:10,
              marginTop:6,
              borderRadius:8,
              border:'1px solid #d9deea'
            }}
          >
            <option value="" disabled>Unassigned</option>

            {intakeYears.map(year => (
              <option key={year} value={year}>
                {year} Intake
              </option>
            ))}
          </select>
        </label>
      )}

      <button
        className="btn btn-outline full"
        onClick={() => onChatUser(p.id)}
      >
        <MessageCircle size={16}/>
        Send message
      </button>
    </div>
  );
}

function Workspace({demo,page,setPage,selectedModule,setSelectedModule,activeChat,setActiveChat,user,me,profiles,modules,resources,chats,members,messages,online,showToast,notice,setNotice,setUpload,setGroup,setCreateModule,setAiResource,onChatUser,onManageGroup,onEditSemester,onSignOut,onFile,onSend,onProfileSave,onAvatar,onAssignIntake}){
  const [menuOpen,setMenuOpen]=useState(false),[selectedSemester,setSelectedSemester]=useState(null),[search,setSearch]=useState(''),[category,setCategory]=useState('All'),[studentSearch,setStudentSearch]=useState(''),[draft,setDraft]=useState('');
  const byId=useMemo(()=>Object.fromEntries(profiles.map(x=>[x.id,x])),[profiles]);
  const mById=useMemo(()=>Object.fromEntries(modules.map(x=>[x.id,x])),[modules]);
  const semesterModules=modules.filter(m=>moduleSemester(m)===selectedSemester);
  const visibleModules=semesterModules.filter(m=>(category==='All'||m.category===category)&&`${m.title} ${m.description}`.toLowerCase().includes(search.toLowerCase()));
  const categories=['All',...new Set(semesterModules.map(m=>m.category))];
  const people = profiles.filter(p => {
  if (p.role !== 'student') return false;
  if (p.id === user.id) return false;

  // Admins can see students from every intake.
  if (me?.role !== 'admin') {
    if (me?.intake_year == null) return false;
    if (p.intake_year !== me.intake_year) return false;
  }

  const query = studentSearch.toLowerCase();

  return `${p.full_name} ${p.username}`
    .toLowerCase()
    .includes(query);
});

  // Group students by intake year for administrators.
  const intakeGroups = Object.entries(
  people.reduce((groups, student) => {
  const year = student.intake_year == null
    ? 'Unassigned'
    : String(student.intake_year);

    if (!groups[year]) groups[year] = [];

    groups[year].push(student);

    return groups;
  }, {})
).sort(([a], [b]) => {
  if (a === 'Unassigned') return 1;
  if (b === 'Unassigned') return -1;

  return Number(b) - Number(a);
});

// Only show online students within the permitted directory.
const visibleOnline = online.filter(id =>
  profiles.some(p =>
    p.id === id &&
    (
      me?.role === 'admin'
        ? p.role === 'student'
        : (
            p.id === user.id ||
            (
              p.role === 'student' &&
              me?.intake_year != null &&
              p.intake_year === me.intake_year
            )
          )
    )
  )
);

  const selected=modules.find(m=>m.id===selectedModule);
  const activeConversation=chats.find(c=>c.id===activeChat);
  const chatTitle=c=>c?.is_group?c.title:(members.filter(m=>m.chat_id===c?.id&&m.user_id!==user.id).map(m=>byId[m.user_id]?.full_name).filter(Boolean).join(', ')||'Direct conversation');
  const chatPeer=c=>byId[members.find(m=>m.chat_id===c.id&&m.user_id!==user.id)?.user_id];
  const navItems=[{id:'dashboard',label:'Dashboard',icon:LayoutDashboard},{id:'modules',label:'My modules',icon:BookOpen},{id:'messages',label:'Messages',icon:MessageCircle},{id:'people',label:'Students',icon:Users},{id:'profile',label:'My profile',icon:UserRound}];
  const go=(id)=>{setPage(id);setSelectedModule(null);setSelectedSemester(null);setSearch('');setCategory('All');setMenuOpen(false);};
  const openSemester=semester=>{setSelectedSemester(semester);setSelectedModule(null);setSearch('');setCategory('All');};
  return <div className="app-shell">
    {menuOpen&&<button className="mobile-overlay" onClick={()=>setMenuOpen(false)} aria-label="Close navigation"/>}
    <aside className={`sidebar ${menuOpen?'sidebar-open':''}`}>
      <button className="sidebar-logo" onClick={()=>go('dashboard')}><Logomark/><span>MORA-BPM<span className="period">.</span><small>STUDENT WORKSPACE</small></span></button>
      <div className="nav-heading">WORKSPACE</div><nav className="main-nav">{navItems.map(n=><button key={n.id} className={`nav-link ${page===n.id?'nav-active':''}`} onClick={()=>go(n.id)}><n.icon size={19} strokeWidth={1.9}/><span>{n.label}</span>{n.id==='messages'&&<i className="nav-count">{chats.length}</i>}</button>)}</nav>
      <div className="sidebar-divider"/><div className="nav-heading">MY LEARNING</div><div className="sidebar-module-list">{modules.slice(0,4).map(m=><button key={m.id} className="sidebar-module" onClick={()=>{go('modules');setSelectedSemester(moduleSemester(m));setSelectedModule(m.id);}}><span className={`mini-mark mark-${m.color||'violet'}`}>{m.title.charAt(0)}</span><span>{m.title}</span></button>)}{!modules.length&&<p className="side-hint">Your modules will appear here</p>}</div>
      <div className="sidebar-spacer"/><div className="sidebar-help"><span className="help-star"><Sparkles size={18}/></span><b>Study smarter</b><p>Turn notes into summaries and quiz questions with AI.</p><button onClick={()=>{go('modules');}}>Explore resources <ArrowRight size={15}/></button></div>
      <button className="sidebar-user" onClick={()=>go('profile')}><Avatar profile={me} size={40}/><span><b>{me?.full_name||'Student'}</b><small>{me?.role==='admin'?'Administrator':'Student account'}</small></span><MoreHorizontal size={20}/></button>
    </aside>
    <main className="app-main">
      <header className="topbar"><div className="topbar-left"><button className="icon-btn mobile-menu" onClick={()=>setMenuOpen(true)} aria-label="Open navigation"><Menu size={21}/></button><span className="breadcrumb-root">Workspace</span><ChevronRight size={16} className="breadcrumb-chevron"/><span className="breadcrumb-active">{selected?'Module details':navItems.find(n=>n.id===page)?.label}</span></div><div className="topbar-right"><span className="topbar-today"><CalendarDays size={16}/>{new Date().toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'})}</span><span className="topbar-rule"/><button onClick={()=>go('people')} className="online-summary"><span className="pulse-dot"/>{online.length} online</button><button className="top-avatar" onClick={()=>go('profile')}><Avatar profile={me} size={36}/></button></div></header>
      {demo&&<div className="demo-banner"><div><Sparkles size={17}/><b>Interactive design preview</b> — sample data only; sign-in, chat, uploads and AI activate after you connect the services.</div><a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">Set up backend <ExternalLink size={14}/></a></div>}
      <div className="main-content">
      {page==='dashboard'&&<>
        <div className="page-heading"><div><p className="kicker">YOUR LEARNING HUB</p><h1>Good to see you, {me?.full_name?.split(' ')[0]||'student'} <span className="wave">👋</span></h1><p className="muted">Here’s what’s happening in your learning space today.</p></div><button className="btn btn-outline" onClick={()=>go('people')}><Users size={17}/> View students</button></div>
        <section className="hero-card"><div className="hero-copy"><span className="hero-pill"><Sparkles size={15}/> THE SMARTER WAY TO STUDY</span><h2>Your next big idea<br/>starts <em>right here.</em></h2><p>Explore notes, share your knowledge, and learn better with your study community.</p><button className="btn btn-light" onClick={()=>go('modules')}>Explore modules <ArrowRight size={17}/></button></div><div className="hero-art" aria-hidden="true"><div className="hero-orbit orbit-a"/><div className="hero-orbit orbit-b"/><div className="hero-graphic g1"><BookOpen size={36}/></div><div className="hero-graphic g2"><MessageCircle size={31}/></div><div className="hero-graphic g3"><Sparkles size={31}/></div><div className="hero-graphic g4"><Check size={19}/></div></div></section>
        <div className="stats-row"><Stat icon={BookOpen} color="violet" value={modules.length} label="Learning modules"/><Stat icon={FolderOpen} color="blue" value={resources.length} label="Shared resources"/><Stat icon={Users} color="teal" value={online.length} label="Students online"/><Stat icon={MessageCircle} color="orange" value={chats.length} label="Conversations"/></div>
        <div className="section-title-row"><div><h2>Your learning modules</h2><p>Pick up where you left off</p></div><button className="link-btn" onClick={()=>go('modules')}>View all <ArrowRight size={16}/></button></div>
        {modules.length?<div className="module-grid dashboard-modules">{modules.slice(0,3).map((m,i)=><ModuleCard key={m.id} module={m} count={resources.filter(r=>r.module_id===m.id).length} onClick={()=>{go('modules');setSelectedSemester(moduleSemester(m));setSelectedModule(m.id);}}/>)}</div>:<Blank icon={BookOpen} title="No modules yet" desc="Your administrator can create the first course module."/>}
        <div className="bottom-grid"><section className="surface-card"><div className="card-title"><h2>Recently shared</h2><button className="link-btn" onClick={()=>go('modules')}>See all <ArrowRight size={15}/></button></div>{resources.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,4).map(r=><button className="recent-item" key={r.id} onClick={()=>{go('modules');setSelectedSemester(moduleSemester(mById[r.module_id]));setSelectedModule(r.module_id);}}><span className={`file-icon ${r.mime_type?.startsWith('image/')?'file-img':'file-pdf'}`}><FileIcon mime={r.mime_type}/></span><span className="recent-name"><b>{r.title}</b><small>{mById[r.module_id]?.title||'Module'} • {when(r.created_at)}</small></span><ChevronRight size={17}/></button>)}{!resources.length&&<p className="empty-mini">No files have been shared yet.</p>}</section><section className="surface-card"><div className="card-title"><h2>Online right now</h2><span className="live-label"><span className="pulse-dot"/>LIVE</span></div>{profiles.filter(p=>p.role==='student' && visibleOnline.includes(p.id)).slice(0,4).map(p=><div className="online-person" key={p.id}><Avatar profile={p} online size={39}/><span><b>{p.full_name}</b><small>{p.role==='admin'?'Administrator':'Available to chat'}</small></span>{p.id!==user.id&&<button className="mini-action" onClick={()=>onChatUser(p.id)}><MessageCircle size={17}/></button>}</div>)}{!online.length&&<p className="empty-mini">No students connected right now.</p>}<button className="link-btn all-students" onClick={()=>go('people')}>View all students <ArrowRight size={16}/></button></section></div>
      </>}
      {page==='modules'&&(!selected?(selectedSemester===null?<>
        <div className="page-heading"><div><p className="kicker">LEARN BY SEMESTER</p><h1>My Modules</h1><p className="muted">Choose a semester to see its modules and study materials.</p></div>{me?.role==='admin'&&<button className="btn btn-primary" onClick={()=>setCreateModule({semester:typeof selectedSemester==='number'?selectedSemester:null})}><Plus size={18}/> New module</button>}</div>
        <div className="semester-intro"><div className="semester-intro-icon"><GraduationCap size={24}/></div><div><b>Your academic journey, organized.</b><p>Select a semester below. Your recent modules on the dashboard remain unchanged.</p></div><span className="semester-intro-total">{modules.length} modules</span></div>
        <div className="semester-grid">{semesterNumbers.map(n=><SemesterCard key={n} number={n} count={modules.filter(m=>moduleSemester(m)===n).length} onClick={()=>openSemester(n)}/>)}{modules.some(m=>moduleSemester(m)==='unassigned')&&<SemesterCard number="unassigned" count={modules.filter(m=>moduleSemester(m)==='unassigned').length} onClick={()=>openSemester('unassigned')}/>}</div>
      </>:<>
        <button className="back-link" onClick={()=>openSemester(null)}><ArrowLeft size={17}/> All semesters</button>
        <div className="page-heading"><div><p className="kicker">MY MODULES / {semesterLabel(selectedSemester).toUpperCase()}</p><h1>{semesterLabel(selectedSemester)}</h1><p className="muted">Browse modules and shared course resources for this semester.</p></div>{me?.role==='admin'&&<button className="btn btn-primary" onClick={()=>setCreateModule({semester:typeof selectedSemester==='number'?selectedSemester:null})}><Plus size={18}/> New module</button>}</div>
        <div className="toolbar"><div className="search-field"><Search size={19}/><input placeholder="Search modules in this semester..." value={search} onChange={e=>setSearch(e.target.value)}/></div><span className="toolbar-meta">{visibleModules.length} {visibleModules.length===1?'module':'modules'} available</span></div>
        {semesterModules.length>0&&<div className="pills">{categories.map(cat=><button key={cat} className={`pill ${category===cat?'pill-active':''}`} onClick={()=>setCategory(cat)}>{cat}</button>)}</div>}
        {visibleModules.length?<div className="module-grid">{visibleModules.map(m=><ModuleCard key={m.id} module={m} count={resources.filter(r=>r.module_id===m.id).length} onClick={()=>setSelectedModule(m.id)}/>)}</div>:<Blank icon={BookOpen} title={semesterModules.length?'No matching modules':'No modules in this semester yet'} desc={semesterModules.length?'Try a different search or category.':'An administrator can add a module to this semester.'}/>}
      </>):<>
        <button className="back-link" onClick={()=>{setSelectedModule(null);setSelectedSemester(moduleSemester(selected));setSearch('');setCategory('All');}}><ArrowLeft size={17}/> Back to {semesterLabel(moduleSemester(selected))}</button>
        <div className="module-detail-head"><div className={`detail-icon tile-${selected.color||'violet'}`}><BookOpen size={31}/></div><div className="module-detail-text"><p className="kicker">{semesterLabel(moduleSemester(selected))} · {selected.category}</p><h1>{selected.title}</h1><p>{selected.description}</p><div className="meta-line"><span><FolderOpen size={15}/>{resources.filter(r=>r.module_id===selected.id).length} resources</span><span><Users size={15}/> Shared with all students</span></div>{me?.role==='admin'&&<button type="button" className="semester-edit-btn" onClick={()=>onEditSemester(selected)}><Settings2 size={15}/> Change semester</button>}</div><button className="btn btn-primary detail-upload" onClick={()=>setUpload({kind:'resource',moduleId:selected.id})}><CloudUpload size={18}/> Upload resource</button></div>
        <div className="section-title-row"><div><h2>Learning resources</h2><p>Notes, documents and media uploaded by your classmates</p></div><button className="btn btn-outline btn-sm" onClick={()=>setUpload({kind:'resource',moduleId:selected.id})}><Plus size={16}/> Add resource</button></div>
        <div className="resource-list">{resources.filter(r=>r.module_id===selected.id).map(r=><ResourceRow key={r.id} resource={r} author={byId[r.uploader_id]} onFile={()=>onFile(r)} onAI={()=>setAiResource(r)}/>)}</div>
        {!resources.some(r=>r.module_id===selected.id)&&<Blank icon={CloudUpload} title="Be the first to share" desc="Upload lecture notes, a PDF, images or other learning materials for everyone to see." action={<button className="btn btn-primary" onClick={()=>setUpload({kind:'resource',moduleId:selected.id})}><Plus size={17}/> Upload a file</button>}/>}
        <div className="info-strip"><ShieldCheck size={20}/><div><b>Media stored in Google Drive</b><p>Documents are stored privately in Drive and shared only through the LMS with authorized students.</p></div></div>
      </>)}
      {page==='messages'&&<>
        <div className="page-heading"><div><p className="kicker">STAY CONNECTED</p><h1>Messages</h1><p className="muted">Your private and group conversations, all in one place.</p></div><button className="btn btn-primary" onClick={()=>setGroup(true)}><Plus size={18}/> New group</button></div>
        <div className="chat-layout"><aside className="conversation-list"><div className="chat-list-header"><h3>Chats <span>{chats.length}</span></h3><button className="icon-btn" title="New group" onClick={()=>setGroup(true)}><Plus size={18}/></button></div>{chats.map(c=><button key={c.id} className={`conversation-item ${activeChat===c.id?'conversation-active':''}`} onClick={()=>setActiveChat(c.id)}>{c.is_group?<span className="group-avatar"><Users size={22}/></span>:<Avatar profile={chatPeer(c)} size={43} online={online.includes(chatPeer(c)?.id)}/>}<span className="conversation-body"><b>{chatTitle(c)}</b><small>{c.is_group?`${members.filter(m=>m.chat_id===c.id).length} members`:'Private conversation'}</small></span><ChevronRight size={16}/></button>)}{!chats.length&&<div className="no-chats"><MessageCircle size={25}/><p>No conversations yet.<br/>Find a student to start chatting.</p><button onClick={()=>go('people')} className="link-btn">Browse students <ArrowRight size={15}/></button></div>}</aside>
          <section className="thread">{activeConversation?<><div className="thread-header">{activeConversation.is_group?<span className="group-avatar"><Users size={21}/></span>:<Avatar profile={chatPeer(activeConversation)} size={43} online={online.includes(chatPeer(activeConversation)?.id)}/>}<span><b>{chatTitle(activeConversation)}</b><small>{activeConversation.is_group?`${members.filter(m=>m.chat_id===activeConversation.id).length} group members`:'Private chat • only participants can read messages'}</small></span>{activeConversation.is_group&&<button type="button" className="manage-group-btn" onClick={()=>onManageGroup(activeConversation)} title="View members and manage this group"><Settings2 size={16}/><span>{activeConversation.created_by===user.id||me?.role==='admin'?'Manage group':'Group info'}</span></button>}<span className="thread-secure"><ShieldCheck size={15}/> Private</span></div><div className="thread-messages" key={activeConversation.id}><div className="chat-date"><span>Conversation</span></div>{messages.filter(m=>m.chat_id===activeConversation.id).map((m,i)=><div key={m.id} className={`bubble-row ${m.sender_id===user.id?'bubble-own':''}`}>{m.sender_id!==user.id&&<Avatar profile={byId[m.sender_id]} size={30}/>}<div><span className="bubble-author">{m.sender_id===user.id?'You':byId[m.sender_id]?.full_name||'Student'} · {time(m.created_at)}</span><div className="bubble">{m.body&&<p>{m.body}</p>}{m.file_id&&<button className="chat-attachment" onClick={()=>onFile(m)}><Paperclip size={16}/>{m.file_name||'Attachment'} <ArrowDownToLine size={15}/></button>}{demo&&m.id==='msg1'&&<span className="demo-attachment"><FileText size={16}/> python_intro.pdf</span>}</div></div></div>)}{!messages.some(m=>m.chat_id===activeConversation.id)&&<div className="thread-empty">Say hello! This is the beginning of your conversation.</div>}</div><form className="chat-composer" onSubmit={e=>{e.preventDefault();if(!draft.trim())return;onSend(activeConversation.id,draft.trim());setDraft('');}}><button type="button" className="icon-btn" title="Attach file from device" onClick={()=>setUpload({kind:'message',chatId:activeConversation.id})}><Paperclip size={20}/></button><input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Type a message..." maxLength={2000}/><button className="send-btn" type="submit" disabled={!draft.trim()} aria-label="Send message"><Send size={18}/></button></form></>:<Blank icon={MessageCircle} title="Select a conversation" desc="Start a private message or create a study group."/>}</section></div>
      </>}
      
      {page === 'people' && (<>
        <div className="page-heading"><div><p className="kicker">YOUR COMMUNITY</p><h1>{me?.role === 'admin'? 'Students by Intake Year': 'Students & Classmates'}</h1><p className="muted">
        {me?.role === 'admin'? 'Manage students from every intake year.': `Find classmates from your ${me?.intake_year ?? 'unassigned'} intake.`}</p></div>

      <span className="people-count">
        <span className="pulse-dot"/>
        {visibleOnline.length} currently online
      </span>
    </div>

    <div className="toolbar">
      <div className="search-field">
        <Search size={19}/>

        <input
          placeholder="Search students..."
          value={studentSearch}
          onChange={e => setStudentSearch(e.target.value)}
        />
      </div>

      <span className="toolbar-meta">
        {people.length} students
      </span>
    </div>

    {me?.role === 'admin' ? (
      intakeGroups.map(([year, students]) => (
        <section key={year} style={{marginBottom:30}}>
          <div className="section-title-row">
            <div>
              <h2>
                {year === 'Unassigned'
                  ? 'Unassigned Students'
                  : `${year} Intake`}
              </h2>

              <p>
                {students.length} students
              </p>
            </div>
          </div>

          <div className="people-grid">
            {students.map(p => (
              <StudentCard
                key={p.id}
                p={p}
                online={visibleOnline.includes(p.id)}
                isAdmin={true}
                onChatUser={onChatUser}
                onAssignIntake={onAssignIntake}
              />
            ))}
          </div>
        </section>
      ))
    ) : (
      <div className="people-grid">
        {people.map(p => (
          <StudentCard
            key={p.id}
            p={p}
            online={visibleOnline.includes(p.id)}
            isAdmin={false}
            onChatUser={onChatUser}
          />
        ))}
      </div>
    )}

    {!people.length && (
      <Blank
        icon={Users}
        title="No students found"
        desc={
          me?.role !== 'admin' && me?.intake_year == null
            ? 'Ask an administrator to assign your intake year.'
            : 'No matching students are available.'
        }
      />
    )}
  </>
)}

      {page==='profile'&&<>
        <div className="page-heading"><div><p className="kicker">ACCOUNT SETTINGS</p><h1>My profile</h1><p className="muted">Manage your details and how you appear to classmates.</p></div></div>
        <div className="profile-grid"><div className="profile-cover"><div className="cover-gradient"/><div className="profile-identity"><div className="profile-avatar-wrap"><Avatar profile={me} size={94}/><button title="Upload profile photo" onClick={()=>onAvatar()}><Image size={17}/></button></div><h2>{me?.full_name}</h2><p>@{me?.username}</p><span className="profile-badge"><ShieldCheck size={15}/>{me?.role==='admin'?'Administrator':'Student'}</span></div></div><div className="surface-card profile-edit"><h2>Personal information</h2><p className="muted">Make changes to your public profile.</p><form onSubmit={e=>{e.preventDefault();const name=e.currentTarget.elements.fullname.value.trim();if(name)onProfileSave(name);}}><label>Full name<input key={me?.full_name} name="fullname" defaultValue={me?.full_name||''} required minLength={2} maxLength={80}/></label><label>Username<input value={me?.username?`@${me.username}`:''} disabled/><small>This is your login username. Ask an administrator if you need a new one.</small></label><button type="submit" className="btn btn-primary"><Check size={17}/> Save changes</button></form><div className="profile-signout"><button className="btn btn-outline" onClick={onSignOut}><LogOut size={17}/> Sign out</button></div></div></div>
      </>}
      </div>
      <footer className="site-footer"><span>© {new Date().getFullYear()} Mora-BPM LMS</span><span>Made for better learning <span className="footer-heart">♥</span></span></footer>
    </main>
    <Toast toast={notice?(typeof notice==='string'?{message:notice}:notice):null} onDismiss={()=>setNotice('')}/>
  </div>;
}
function Stat({icon:Icon,color,value,label}){return <div className="stat-card"><div className={`stat-icon icon-${color}`}><Icon size={21}/></div><div><strong>{value}</strong><span>{label}</span></div><div className="stat-arrow"><ArrowRight size={17}/></div></div>}
function ModuleCard({module,count,onClick}){const colors={violet:'violet',blue:'blue',orange:'orange',teal:'teal',pink:'pink'};const cc=colors[module.color]||'violet';return <button className="module-card" onClick={onClick}><div className={`module-art module-art-${cc}`}><div className="module-symbol"><BookOpen size={28}/></div><span className="art-circle circle-one"/><span className="art-circle circle-two"/><span className="art-micro"><Sparkles size={17}/></span></div><div className="module-body"><span className="module-category">{module.category}</span><h3>{module.title}</h3><p>{module.description||'Explore shared resources in this module.'}</p><div className="module-bottom"><span><FolderOpen size={16}/>{count} {count===1?'resource':'resources'}</span><span className="module-open"><ArrowRight size={18}/></span></div></div></button>}
function ResourceRow({resource,author,onFile,onAI}){return <div className="resource-row"><span className={`resource-file-icon ${resource.mime_type?.startsWith('image/')?'resource-image':resource.mime_type?.startsWith('video/')?'resource-video':'resource-document'}`}><FileIcon mime={resource.mime_type} size={24}/></span><div className="resource-content"><h3>{resource.title}</h3><p>{resource.file_name} <span>•</span> {bytes(resource.size_bytes)} <span>•</span> {when(resource.created_at)}</p><small>Shared by {author?.full_name||'Student'}</small></div><div className="resource-actions"><button className="btn btn-soft btn-sm" onClick={onAI}><Sparkles size={16}/> AI tools</button><button className="btn btn-outline btn-sm" onClick={onFile}><ArrowDownToLine size={17}/> Open</button></div></div>}

function UploadModal({upload,modules,onClose,onSuccess}){
  const [file,setFile]=useState(null),[title,setTitle]=useState(''),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const kind=upload.kind;
  async function submit(e){e.preventDefault();if(!file)return setError('Please choose a file.');setBusy(true);setError('');try{
    const form=new FormData();form.set('kind',kind);form.set('file',file);
    if(kind==='resource'){form.set('module_id',upload.moduleId);form.set('title',title);form.set('description',description);}
    if(kind==='message'){form.set('chat_id',upload.chatId);form.set('description',description);}
    const res=await api('/api/upload',{method:'POST',body:form});const result=await res.json();onSuccess(kind,result.record);onClose();
  }catch(e){setError(e.message);}finally{setBusy(false);}}
  const head=kind==='avatar'?'Update profile photo':kind==='message'?'Attach a file':'Share a learning resource';
  return <Modal title={head} subtitle="Files are securely stored in Google Drive, not the database." onClose={onClose}><form onSubmit={submit} className="modal-form"><label className="dropzone"><CloudUpload size={28}/><b>{file?file.name:'Click to choose a file'}</b><span>{file?bytes(file.size):kind==='avatar'?'JPG, PNG or WebP · up to 2 MB':'PDF, images, Office files, audio and videos · up to 20 MB'}</span><input type="file" accept={kind==='avatar'?'image/jpeg,image/png,image/webp':validUploadTypes} onChange={e=>{const f=e.target.files?.[0];setFile(f||null);if(f&&!title)setTitle(f.name.replace(/\.[^/.]+$/,''));}} required/></label>{kind==='resource'&&<><label>Resource title<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={180} placeholder="e.g. Week 03 lecture notes"/></label><label>Module<input value={modules.find(m=>m.id===upload.moduleId)?.title||''} disabled/></label></>}{kind!=='avatar'&&<label>{kind==='message'?'Message (optional)':'Description (optional)'}<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000} placeholder="Add some context for your classmates..."/></label>}{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button disabled={busy} type="submit" className="btn btn-primary">{busy?<LoaderCircle size={16} className="spin"/>:<CloudUpload size={17}/>} {kind==='avatar'?'Upload photo':'Upload to Drive'}</button></div></form></Modal>;
}
function ModuleModal({onClose,onCreated,user,initialSemester=null}){
  const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[category,setCategory]=useState('General'),[semester,setSemester]=useState(initialSemester==null?'':String(initialSemester)),[color,setColor]=useState('violet'),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){e.preventDefault();setBusy(true);setError('');const {data,error}=await supabase.from('modules').insert({title:title.trim(),description:description.trim(),category:category.trim(),semester:Number(semester),color,created_by:user.id}).select().single();setBusy(false);if(error)setError(error.message);else{onCreated(data);onClose();}}
  return <Modal title="Create a module" subtitle="Create a shared space for your class and its resources." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Module name<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Software Engineering"/></label><label>Category<input value={category} onChange={e=>setCategory(e.target.value)} required maxLength={60} placeholder="e.g. Computer Science"/></label><label>Semester<select value={semester} onChange={e=>setSemester(e.target.value)} required><option value="">Select a semester</option>{semesterNumbers.map(n=><option value={n} key={n}>Semester {n}</option>)}</select></label><label>Description<textarea rows={3} value={description} onChange={e=>setDescription(e.target.value)} maxLength={1000} placeholder="What will students learn in this module?"/></label><label>Module color</label><div className="color-options">{colorMap.map(c=><button type="button" key={c} onClick={()=>setColor(c)} className={`color-choice color-${c} ${color===c?'color-chosen':''}`} aria-label={c}>{color===c&&<Check size={20}/>}</button>)}</div>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Plus size={17}/>} Create module</button></div></form></Modal>;
}
function ModuleSemesterModal({module,onClose,onUpdated}){
  const [semester,setSemester]=useState(module.semester==null?'':String(module.semester));
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){
    e.preventDefault();setBusy(true);setError('');
    const {error:saveError}=await supabase.from('modules').update({semester:semester===''?null:Number(semester)}).eq('id',module.id).select('id,semester').single();
    setBusy(false);
    if(saveError){setError(saveError.message);return;}
    await onUpdated();onClose();
  }
  return <Modal title="Change module semester" subtitle={`Move “${module.title}” to a different semester.`} onClose={onClose}>
    <form className="modal-form" onSubmit={submit}><label>Semester<select value={semester} onChange={e=>setSemester(e.target.value)}><option value="">Unassigned</option>{semesterNumbers.map(n=><option key={n} value={n}>Semester {n}</option>)}</select></label>
    <p className="semester-modal-hint">This changes only where the module appears in My Modules. Its resources, students, and recent dashboard display are preserved.</p>
    {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} type="submit">{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>} Save semester</button></div></form>
  </Modal>;
}
function GroupSettingsModal({chat,profiles,memberRows,me,onClose,onUpdated}){
  const [title,setTitle]=useState(chat.title||'');
  const [selected,setSelected]=useState([]);
  const [query,setQuery]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const canManage=chat.created_by===me?.id||me?.role==='admin';
  const currentIds=new Set(memberRows.filter(m=>m.chat_id===chat.id).map(m=>m.user_id));
  const currentMembers=profiles.filter(p=>currentIds.has(p.id));
  const available = profiles.filter(p =>p.role === 'student' &&!currentIds.has(p.id) &&`${p.full_name} ${p.username}`.toLowerCase().includes(query.trim().toLowerCase()));
  const changed=title.trim()!==chat.title||selected.length>0;
  const countAfter=currentIds.size+selected.length;
  async function save(e){
    e.preventDefault();
    if(!canManage||!changed)return;
    const cleanTitle=title.trim();
    if(cleanTitle.length<2||cleanTitle.length>80){setError('The group name must have 2 to 80 characters.');return;}
    if(countAfter>30){setError('A group can have up to 30 students.');return;}
    setBusy(true);setError('');
    try{
      const {error:rpcError}=await supabase.rpc('update_group_details',{
        p_chat_id:chat.id,
        p_title:cleanTitle,
        p_add_member_ids:selected
      });
      if(rpcError)throw rpcError;
      await onUpdated();
      onClose();
    }catch(err){setError(err.message||'Could not update this group.');}
    finally{setBusy(false);}
  }
  return <Modal title={canManage?'Manage study group':'Group information'} subtitle="Review members, update the group name and invite classmates." onClose={onClose}>
    <form className="modal-form" onSubmit={save}>
      <label>Group name<input type="text" value={title} onChange={e=>setTitle(e.target.value)} minLength={2} maxLength={80} required disabled={!canManage||busy}/></label>
      <div className="group-settings-section"><div className="group-settings-title"><b>Current members</b><small>{currentIds.size} / 30</small></div>
        <div className="group-member-list">{currentMembers.map(p=><div className="group-member-row" key={p.id}><Avatar profile={p} size={32}/><span><strong>{p.full_name}</strong><small>@{p.username}</small></span>{p.id===chat.created_by&&<span className="group-member-owner">Creator</span>}</div>)}</div>
      </div>
      {canManage?<div className="group-settings-section"><div className="group-settings-title"><b>Add students</b><small>{selected.length} selected</small></div>
        <input aria-label="Search students to invite" placeholder="Find classmates by name or username" value={query} onChange={e=>setQuery(e.target.value)} disabled={busy}/>
        <div className="select-students group-invite-list">{available.map(p=><label className="select-person" key={p.id}><Avatar profile={p} size={34}/><span>{p.full_name}<small className="group-username">@{p.username}</small></span><input type="checkbox" checked={selected.includes(p.id)} disabled={busy||(!selected.includes(p.id)&&countAfter>=30)} onChange={e=>setSelected(prev=>e.target.checked?[...prev,p.id]:prev.filter(id=>id!==p.id))}/></label>)}{!available.length&&<p className="group-empty">No other students found.</p>}</div>
        <p className="group-settings-help"><UserPlus size={15}/> New members can read this group's earlier messages and shared files.</p>
      </div>:<p className="group-settings-help"><ShieldCheck size={15}/> Only the group creator or an LMS administrator can change the name or add students.</p>}
      {error&&<div className="form-error" role="alert">{error}</div>}
      <div className="modal-actions"><button type="button" className="btn btn-outline" disabled={busy} onClick={onClose}>{canManage?'Cancel':'Close'}</button>{canManage&&<button type="submit" className="btn btn-primary" disabled={busy||!changed||countAfter>30||title.trim().length<2}>{busy?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>} Save changes</button>}</div>
    </form>
  </Modal>;
}

function GroupModal({profiles,user,onClose,onCreated}){
  const [title,setTitle]=useState(''),[members,setMembers]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const possible = profiles.filter(p => p.role === 'student' && p.id !== user.id);
  async function submit(e){e.preventDefault();setBusy(true);setError('');const {data,error}=await supabase.rpc('create_conversation',{p_is_group:true,p_title:title.trim(),p_member_ids:members});setBusy(false);if(error)setError(error.message);else{onCreated(data);onClose();}}
  return <Modal title="Create a study group" subtitle="Choose students to start a private group conversation." onClose={onClose}><form className="modal-form" onSubmit={submit}><label>Group name<input value={title} onChange={e=>setTitle(e.target.value)} required minLength={2} maxLength={80} placeholder="e.g. Database Project Group"/></label><label>Invite classmates <small>({members.length} selected)</small></label><div className="select-students">{possible.map(p=><label className="select-person" key={p.id}><Avatar profile={p} size={34}/><span>{p.full_name}</span><input type="checkbox" checked={members.includes(p.id)} onChange={e=>setMembers(prev=>e.target.checked?[...prev,p.id]:prev.filter(id=>id!==p.id))}/></label>)}</div>{!possible.length&&<p className="muted">Ask other students to create their accounts first.</p>}{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button><button type="submit" className="btn btn-primary" disabled={busy||members.length<1}>{busy?<LoaderCircle className="spin" size={17}/>:<Users size={17}/>} Create group</button></div></form></Modal>;
}
function AIModal({resource,onClose}){
  const [task,setTask]=useState('summary'),[busy,setBusy]=useState(false),[answer,setAnswer]=useState(''),[error,setError]=useState('');
  const tasks=[{id:'summary',icon:BookMarked,title:'Summarize',desc:'Key concepts and takeaways'},{id:'extract',icon:TextSelect,title:'Extract text',desc:'Convert PDF or image to text'},{id:'quiz',icon:ListChecks,title:'Generate quiz',desc:'Revision questions with answers'}];
  const run=async()=>{setBusy(true);setError('');setAnswer('');try{const r=await api('/api/ai',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({resourceId:resource.id,mode:task})});setAnswer((await r.json()).result);}catch(e){setError(e.message);}finally{setBusy(false);}};
  return <Modal title="AI Study Assistant ✨" subtitle={`Learn from “${resource.title}”`} onClose={onClose} wide><div className="ai-modal"><div className="ai-options">{tasks.map(t=><button key={t.id} className={`ai-option ${task===t.id?'ai-selected':''}`} onClick={()=>{setTask(t.id);setAnswer('');}}><t.icon size={23}/><b>{t.title}</b><small>{t.desc}</small></button>)}</div><div className="ai-privacy"><ShieldCheck size={18}/> Your file is sent to Google Gemini only when you click Generate. Google's AI service terms and data-use policies apply.</div><button className="btn btn-primary full" onClick={run} disabled={busy}>{busy?<LoaderCircle className="spin" size={17}/>:<Sparkles size={17}/>} {busy?'Analyzing your document...':'Generate with AI'}</button>{error&&<div className="form-error">{error}</div>}{answer&&<div className="ai-result"><div className="ai-result-head"><b><Sparkles size={17}/> AI study notes</b><button className="mini-action" onClick={()=>navigator.clipboard?.writeText(answer)} title="Copy answer"><Copy size={17}/></button></div><div className="ai-result-text">{answer}</div><small>AI output may contain mistakes. Check it against your source material.</small></div>}</div></Modal>;
}

function Connected(){
  const [session,setSession]=useState(undefined),[profile,setProfile]=useState(null),[profiles,setProfiles]=useState([]),[modules,setModules]=useState([]),[resources,setResources]=useState([]),[chats,setChats]=useState([]),[members,setMembers]=useState([]),[messages,setMessages]=useState([]),[online,setOnline]=useState([]),[page,setPage]=useState('dashboard'),[selectedModule,setSelectedModule]=useState(null),[activeChat,setActiveChat]=useState(null),[upload,setUpload]=useState(null),[group,setGroup]=useState(false),[groupSettings,setGroupSettings]=useState(null),[editSemester,setEditSemester]=useState(null),[createModule,setCreateModule]=useState(false),[aiResource,setAiResource]=useState(null),[notice,setNotice]=useState(''),[fetching,setFetching]=useState(true);
  const notify=useCallback((message,kind='success')=>{setNotice({message,kind});},[]);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:sub}=supabase.auth.onAuthStateChange((_event,session)=>setSession(session));return ()=>sub.subscription.unsubscribe();},[]);
  const refresh=useCallback(async()=>{
    const fetches=await Promise.all([supabase.from('profiles').select('*').order('full_name'),supabase.from('modules').select('*').order('created_at',{ascending:false}),supabase.from('resources').select('*').order('created_at',{ascending:false}),supabase.from('chats').select('*').order('created_at',{ascending:false}),supabase.from('chat_members').select('*')]);
    const err=fetches.find(r=>r.error)?.error;if(err){notify('Database error: '+err.message,'error');return;}
    setProfiles(fetches[0].data||[]);setModules(fetches[1].data||[]);setResources(fetches[2].data||[]);setChats(fetches[3].data||[]);setMembers(fetches[4].data||[]);
    if(session?.user)setProfile((fetches[0].data||[]).find(p=>p.id===session.user.id)||null);
    setActiveChat(prev=>prev||(fetches[3].data?.[0]?.id||null));
  },[session?.user?.id,notify]);
  const refreshMessages=useCallback(async()=>{const {data,error}=await supabase.from('messages').select('*').order('created_at',{ascending:true}).limit(1000);if(!error)setMessages(data||[]);},[]);
  useEffect(()=>{if(!session?.user){setFetching(false);setProfile(null);return;}let ignore=false;setFetching(true);Promise.all([refresh(),refreshMessages()]).finally(()=>{if(!ignore)setFetching(false);});return()=>{ignore=true;};},[session?.user?.id,refresh,refreshMessages]);
  useEffect(()=>{if(!session?.user)return;const channel=supabase.channel('campusflow-live-changes').on('postgres_changes',{event:'INSERT',schema:'public',table:'messages'},()=>refreshMessages()).on('postgres_changes',{event:'INSERT',schema:'public',table:'resources'},()=>refresh()).on('postgres_changes',{event:'*',schema:'public',table:'chats'},()=>refresh()).on('postgres_changes',{event:'INSERT',schema:'public',table:'chat_members'},()=>refresh()).on('postgres_changes',{event:'INSERT',schema:'public',table:'modules'},()=>refresh()).subscribe();return()=>{supabase.removeChannel(channel);};},[session?.user?.id,refresh,refreshMessages]);
  useEffect(()=>{if(!session?.user)return;const channel=supabase.channel('campusflow-connected',{config:{presence:{key:session.user.id}}});channel.on('presence',{event:'sync'},()=>{const state=channel.presenceState();setOnline([...new Set(Object.values(state).flat().map(x=>x.user_id).filter(Boolean))]);}).subscribe(async(status)=>{if(status==='SUBSCRIBED')await channel.track({user_id:session.user.id,online_at:new Date().toISOString()});});return()=>{channel.untrack().catch(()=>{});supabase.removeChannel(channel);};},[session?.user?.id]);
  const onChatUser=async(otherId)=>{try{const {data,error}=await supabase.rpc('create_conversation',{p_is_group:false,p_title:'',p_member_ids:[otherId]});if(error)throw error;await refresh();setActiveChat(data);setPage('messages');setSelectedModule(null);notify('Conversation ready');}catch(e){notify(e.message,'error');}};
  const onSend=async(chatId,body)=>{const {error}=await supabase.from('messages').insert({chat_id:chatId,sender_id:session.user.id,body});if(error)notify(error.message,'error');else refreshMessages();};
  const onFile=async(resource)=>{try{const url=await fileObjectURL(resource.file_id);const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';if(!(/^(image\/|application\/pdf)/.test(resource.mime_type||'')))link.download=resource.file_name||'download';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}catch(e){notify(e.message,'error');}};
  const onProfileSave=async(name)=>{const {error}=await supabase.from('profiles').update({full_name:name}).eq('id',session.user.id);if(error)notify(error.message,'error');else{await refresh();notify('Profile updated!');}};
  const onAssignIntake = async (studentId, year) => {if (profile?.role !== 'admin') {notify('Administrator access required', 'error');return;}try {
  const { error } = await supabase.rpc('assign_student_intake',{p_student_id: studentId,p_intake_year: year});if (error) throw error;await refresh();notify('Student intake year updated successfully!');} catch (error) {notify(error.message, 'error');}};

  const afterUpload=async(kind)=>{await refresh();await refreshMessages();notify(kind==='avatar'?'Profile photo updated':kind==='resource'?'Resource shared with the class!':'Attachment sent!');};
  const onSignOut=async()=>{await supabase.auth.signOut();avatarUrls.clear();setPage('dashboard');};
  if(session===undefined)return <Loading label="Preparing your learning space..."/>;
  if(!session)return <Login onNotice={notify}/>;
  if(fetching)return <Loading label="Loading your workspace..."/>;
  if(!profile)return <div className="not-ready"><Logomark/><h2>Your profile is being prepared.</h2><p>Sign out and try again, or verify that you ran schema.sql in Supabase.</p><button className="btn btn-primary" onClick={onSignOut}>Sign out</button></div>;
  return <><Workspace onAssignIntake={onAssignIntake}  demo={false} page={page} setPage={setPage} selectedModule={selectedModule} setSelectedModule={setSelectedModule} activeChat={activeChat} setActiveChat={setActiveChat} user={session.user} me={profile} profiles={profiles} modules={modules} resources={resources} chats={chats} members={members} messages={messages} online={online} notice={notice} setNotice={setNotice} showToast={notify} setUpload={setUpload} setGroup={setGroup} setCreateModule={setCreateModule} setAiResource={setAiResource} onChatUser={onChatUser} onManageGroup={chat=>setGroupSettings(chat.id)} onEditSemester={module=>setEditSemester(module.id)} onSignOut={onSignOut} onFile={onFile} onSend={onSend} onProfileSave={onProfileSave} onAvatar={()=>setUpload({kind:'avatar'})}/>{upload&&<UploadModal upload={upload} modules={modules} onClose={()=>setUpload(null)} onSuccess={afterUpload}/>} {group&&<GroupModal profiles={profiles} user={session.user} onClose={()=>setGroup(false)} onCreated={async id=>{await refresh();setActiveChat(id);setPage('messages');notify('Study group created!');}}/>} {groupSettings&&chats.find(c=>c.id===groupSettings)?.is_group&&<GroupSettingsModal key={groupSettings} chat={chats.find(c=>c.id===groupSettings)} profiles={profiles} memberRows={members} me={profile} onClose={()=>setGroupSettings(null)} onUpdated={async()=>{await refresh();notify('Group updated successfully!');}}/>} {editSemester&&modules.find(m=>m.id===editSemester)&&<ModuleSemesterModal key={editSemester} module={modules.find(m=>m.id===editSemester)} onClose={()=>setEditSemester(null)} onUpdated={async()=>{await refresh();notify('Module semester updated!');}}/>} {createModule&&<ModuleModal initialSemester={createModule.semester} user={session.user} onClose={()=>setCreateModule(false)} onCreated={async()=>{await refresh();notify('Module created!');}}/>} {aiResource&&<AIModal resource={aiResource} onClose={()=>setAiResource(null)}/>}</>;
}
export default function App(){return ready?<Connected/>:<Preview/>;}
