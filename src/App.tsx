import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase, configured } from './supabase'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { QRCodeCanvas } from 'qrcode.react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Activity, ArrowDownToLine, BarChart3, Camera, Check, ChevronRight, ClipboardList, GraduationCap, LayoutDashboard, LogOut, MapPin, Plus, QrCode, Search, ShieldCheck, Users, X } from 'lucide-react'

type Student = { id:string; student_code:string; full_name:string; qr_token:string; is_active:boolean }
type Attendance = { id:string; student_id:string; attendance_date:string; status:string; check_in_time:string|null; reason:string|null; latitude:number|null; longitude:number|null; gps_accuracy:number|null; students?:{full_name:string;student_code:string} }
const today = new Date().toLocaleDateString('en-CA')
const iconMap = L.icon({iconUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png', iconRetinaUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png', shadowUrl:'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png', iconSize:[25,41], iconAnchor:[12,41]})

export default function App() {
  const [session,setSession] = useState<any>(null)
  const [role,setRole] = useState<string>('')
  const [profileName,setProfileName] = useState('Pengguna')
  const [page,setPage] = useState('dashboard')
  const [students,setStudents] = useState<Student[]>([])
  const [attendance,setAttendance] = useState<Attendance[]>([])
  const [loading,setLoading] = useState(true)
  const [notice,setNotice] = useState('')
  const [search,setSearch] = useState('')
  const [showAdd,setShowAdd] = useState(false)
  const [name,setName] = useState('')
  const [nik,setNik] = useState('')
  const [status,setStatus] = useState('HADIR')
  const [reason,setReason] = useState('')
  const [scanToken,setScanToken] = useState('')
  const [scanOpen,setScanOpen] = useState(false)
  const [qrStudent,setQrStudent] = useState<Student|null>(null)
  const [selectedStudent,setSelectedStudent] = useState<Student|null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const readerRef = useRef<BrowserMultiFormatReader|null>(null)

  const refresh = async () => {
    if(!supabase) return
    const s = await supabase.from('students').select('id,student_code,full_name,qr_token,is_active').order('created_at',{ascending:false})
    if(s.error) setNotice(s.error.message); else setStudents(s.data || [])
    const a = await supabase.from('attendance').select('*,students(full_name,student_code)').eq('attendance_date',today).order('created_at',{ascending:false})
    if(a.error) setNotice(a.error.message); else setAttendance((a.data || []) as Attendance[])
  }
  useEffect(()=>{
    if(!supabase){setLoading(false);return}
    supabase.auth.getSession().then(async ({data})=>{
      setSession(data.session)
      if(data.session) await loadProfile(data.session.user.id)
      await refresh(); setLoading(false)
    })
    const {data:{subscription}} = supabase.auth.onAuthStateChange(async (_e,s)=>{
      setSession(s)
      if(s){ await loadProfile(s.user.id); await refresh() } else {setRole('');setProfileName('Pengguna')}
    })
    return ()=>subscription.unsubscribe()
  },[])
  async function loadProfile(id:string){
    if(!supabase)return
    const {data,error}=await supabase.from('profiles').select('full_name,role').eq('id',id).single()
    if(error){setNotice('Akun login belum memiliki profil Admin/Guru. Minta Admin sekolah menyiapkan profil.');return}
    setProfileName(data.full_name);setRole(data.role)
  }
  async function login(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();const f=new FormData(e.currentTarget)
    const {error}=await supabase!.auth.signInWithPassword({email:String(f.get('email')),password:String(f.get('password'))})
    setNotice(error?.message || '')
  }
  async function addStudent(e:React.FormEvent){
    e.preventDefault()
    if(!supabase)return
    if(!/^\d{16}$/.test(nik)){setNotice('NIK harus terdiri dari 16 angka.');return}
    const student_code='ST-'+Date.now().toString().slice(-8)
    const {data,error}=await supabase.from('students').insert({student_code,full_name:name.trim()}).select().single()
    if(error){setNotice(error.message);return}
    const privateResult=await supabase.from('student_private').insert({student_id:data.id,nik})
    if(privateResult.error){
      await supabase.from('students').delete().eq('id',data.id)
      setNotice('Data NIK gagal disimpan. '+privateResult.error.message);return
    }
    setName('');setNik('');setShowAdd(false);setNotice('Siswa berhasil ditambahkan.');await refresh()
  }
  async function getLocation(){
    return new Promise<{latitude:number|null;longitude:number|null;accuracy:number|null}>((resolve)=>{
      if(!navigator.geolocation){resolve({latitude:null,longitude:null,accuracy:null});return}
      navigator.geolocation.getCurrentPosition(p=>resolve({latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy}),()=>resolve({latitude:null,longitude:null,accuracy:null}),{enableHighAccuracy:true,timeout:10000,maximumAge:0})
    })
  }
  async function markAttendance(token:string, chosenStatus='HADIR', why=''){
    if(!supabase)return
    const student=students.find(s=>s.qr_token===token && s.is_active)
    if(!student){setNotice('QR tidak dikenal atau siswa tidak aktif.');return}
    const loc=chosenStatus==='HADIR'?await getLocation():{latitude:null,longitude:null,accuracy:null}
    const {error}=await supabase.from('attendance').insert({
      student_id:student.id,attendance_date:today,session:'PAGI',status:chosenStatus,
      check_in_time:chosenStatus==='HADIR'?new Date().toISOString():null,reason:why||null,
      latitude:loc.latitude,longitude:loc.longitude,gps_accuracy:loc.accuracy,scanned_by:session?.user?.id
    })
    if(error){setNotice(error.code==='23505'?'Siswa sudah memiliki absensi untuk sesi ini.':error.message);return}
    setNotice('Absensi '+student.full_name+' berhasil dicatat.');setScanToken('');setReason('');await refresh()
  }
  async function startScanner(){
    setScanOpen(true)
    setTimeout(async()=>{
      if(!videoRef.current)return
      try{
        readerRef.current=new BrowserMultiFormatReader()
        await readerRef.current.decodeFromVideoDevice(undefined,videoRef.current,(result)=>{
          if(result){const text=result.getText();setScanToken(text);readerRef.current?.reset();setScanOpen(false);markAttendance(text)}
        })
      }catch{setNotice('Kamera tidak dapat dibuka. Pastikan izin kamera diberikan dan website menggunakan HTTPS.')}
    },250)
  }
  async function logout(){await supabase?.auth.signOut();setSession(null)}
  const filtered=useMemo(()=>students.filter(s=>(s.full_name+' '+s.student_code).toLowerCase().includes(search.toLowerCase())),[students,search])
  const present=attendance.filter(a=>a.status==='HADIR').length
  const izin=attendance.filter(a=>a.status==='IZIN').length
  const sakit=attendance.filter(a=>a.status==='SAKIT').length
  const chart=[{day:'Hadir',total:present},{day:'Izin',total:izin},{day:'Sakit',total:sakit},{day:'Alpa',total:attendance.filter(a=>a.status==='ALPA').length}]
  if(!configured)return <Setup/>
  if(loading)return <div className="loading">Menyiapkan SISWA TRACK…</div>
  if(!session)return <main className="login"><div className="login-card"><div className="brand-mark"><GraduationCap/></div><p className="eyebrow">SISTEM INFORMASI SEKOLAH</p><h1>SISWA <span>TRACK</span></h1><p className="muted">Masuk untuk mengelola kehadiran siswa.</p><form onSubmit={login}><label>Email<input name="email" type="email" required placeholder="nama@email.com"/></label><label>Password<input name="password" type="password" required placeholder="Password akun aplikasi"/></label><button className="primary wide">Masuk <ChevronRight size={17}/></button></form><p className="tiny">Akses hanya untuk akun sekolah yang telah terdaftar.</p>{notice&&<p className="notice">{notice}</p>}</div></main>
  return <div className="app-shell"><aside className="sidebar"><div className="logo"><div className="logo-icon"><GraduationCap/></div><div><b>SISWA TRACK</b><small>ATTENDANCE SYSTEM</small></div></div><div className="side-label">MENU UTAMA</div><nav>
    {[['dashboard','Dashboard',LayoutDashboard],['students','Data Siswa',Users],['scan','Scan QR',QrCode],['attendance','Riwayat Absensi',ClipboardList],['map','Peta Lokasi',MapPin],['reports','Laporan',BarChart3]].map(([id,label,Icon]:any)=><button key={id} className={page===id?'nav active':'nav'} onClick={()=>{setPage(id);if(id==='scan')startScanner()}}><Icon size={18}/>{label}</button>)}
  </nav><div className="sidebar-bottom"><ShieldCheck size={17}/><span>Area terbatas<br/><b>{role==='admin'?'Administrator':'Guru'}</b></span></div></aside>
  <main className="main"><header className="topbar"><div><span className="eyebrow">SISTEM ABSENSI SEKOLAH</span><h2>{({dashboard:'Dashboard',students:'Data Siswa',scan:'Pemindaian QR',attendance:'Riwayat Absensi',map:'Peta Lokasi',reports:'Laporan'} as any)[page]}</h2></div><div className="userbox"><div className="avatar">{profileName.slice(0,1).toUpperCase()}</div><div><b>{profileName}</b><small>{role==='admin'?'Admin':'Guru'}</small></div><button className="icon-btn" onClick={logout} title="Keluar"><LogOut size={18}/></button></div></header>
  {notice&&<div className="notice-bar">{notice}<button onClick={()=>setNotice('')}><X size={15}/></button></div>}
  {page==='dashboard'&&<><section className="welcome"><div><p className="eyebrow">RINGKASAN HARI INI</p><h1>Selamat datang, {profileName}.</h1><p>Pantau kehadiran siswa dengan lebih mudah dan tertata.</p></div><div className="date-pill">{new Date().toLocaleDateString('id-ID',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}</div></section><section className="stats"><Stat title="Total Siswa" value={students.length} icon={<Users/>}/><Stat title="Hadir Hari Ini" value={present} icon={<Check/>}/><Stat title="Izin" value={izin} icon={<ClipboardList/>}/><Stat title="Sakit" value={sakit} icon={<Activity/>}/></section><section className="panel"><div className="panel-head"><div><h3>Ringkasan Kehadiran</h3><p>Data yang tercatat hari ini</p></div><span className="live">● TERKINI</span></div><div className="chart"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4269d7" stopOpacity={.3}/><stop offset="95%" stopColor="#4269d7" stopOpacity={0}/></linearGradient></defs><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="day"/><YAxis allowDecimals={false}/><Tooltip/><Area type="monotone" dataKey="total" stroke="#4269d7" fill="url(#fill)" strokeWidth={3}/></AreaChart></ResponsiveContainer></div></section><section className="panel"><div className="panel-head"><div><h3>Absensi Terbaru</h3><p>Pemindaian dan status terbaru</p></div><button className="text-btn" onClick={()=>setPage('attendance')}>Lihat semua <ChevronRight size={15}/></button></div><AttendanceTable rows={attendance.slice(0,6)}/></section></>}
  {page==='students'&&<section className="panel"><div className="panel-head"><div><h3>Data Siswa</h3><p>Kelola identitas dan QR Code siswa.</p></div>{role==='admin'&&<button className="primary" onClick={()=>setShowAdd(true)}><Plus size={17}/> Tambah siswa</button>}</div><div className="toolbar"><div className="search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama atau ID siswa…"/></div></div><div className="student-grid">{filtered.map(s=><div className="student-card" key={s.id}><div className="student-avatar">{s.full_name.slice(0,1).toUpperCase()}</div><div className="student-info"><b>{s.full_name}</b><small>{s.student_code}</small></div><button className="icon-btn" onClick={()=>setQrStudent(s)} title="Lihat QR"><QrCode size={18}/></button></div>)}</div>{filtered.length===0&&<p className="empty">Belum ada data siswa.</p>}</section>}
  {page==='scan'&&<section className="panel scan-panel"><div className="panel-head"><div><h3>Scan QR Code</h3><p>Arahkan kamera ke QR siswa untuk mencatat kehadiran.</p></div><button className="primary" onClick={startScanner}><Camera size={17}/> Buka kamera</button></div>{scanOpen?<div className="video-wrap"><video ref={videoRef} muted playsInline/><p>Posisikan QR Code di dalam area kamera.</p><button className="secondary" onClick={()=>{readerRef.current?.reset();setScanOpen(false)}}>Tutup kamera</button></div>:<div className="scan-empty"><QrCode size={48}/><b>Kamera belum aktif</b><span>Tekan Buka kamera untuk mulai memindai.</span></div>}<div className="manual"><label>Atau masukkan token QR untuk pengujian<input value={scanToken} onChange={e=>setScanToken(e.target.value)} placeholder="Token QR (UUID)"/></label><button className="secondary" onClick={()=>markAttendance(scanToken)}>Catat hadir</button></div></section>}
  {page==='attendance'&&<section className="panel"><div className="panel-head"><div><h3>Riwayat Absensi</h3><p>Catatan kehadiran hari ini.</p></div><button className="secondary" onClick={refresh}>Muat ulang</button></div><AttendanceTable rows={attendance}/></section>}
  {page==='map'&&<section className="panel"><div className="panel-head"><div><h3>Peta Lokasi Pemindaian</h3><p>Lokasi perangkat pemindai yang memberikan izin GPS.</p></div></div>{attendance.some(a=>a.latitude&&a.longitude)?<MapContainer center={[attendance.find(a=>a.latitude&&a.longitude)!.latitude!,attendance.find(a=>a.latitude&&a.longitude)!.longitude!]} zoom={13} style={{height:440,borderRadius:16}}><TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{attendance.filter(a=>a.latitude&&a.longitude).map(a=><Marker key={a.id} position={[a.latitude!,a.longitude!]} icon={iconMap}><Popup>{a.students?.full_name||'Siswa'} · {a.status}</Popup></Marker>)}</MapContainer>:<div className="empty big"><MapPin size={34}/><b>Belum ada lokasi pemindaian</b><span>Lokasi akan muncul setelah pemindaian dengan izin GPS.</span></div>}</section>}
  {page==='reports'&&<section className="panel"><div className="panel-head"><div><h3>Laporan Harian</h3><p>Unduh ringkasan absensi hari ini dalam CSV.</p></div><button className="primary" onClick={()=>downloadCSV(attendance)}><ArrowDownToLine size={17}/> Unduh CSV</button></div><div className="stats compact"><Stat title="Hadir" value={present} icon={<Check/>}/><Stat title="Izin" value={izin} icon={<ClipboardList/>}/><Stat title="Sakit" value={sakit} icon={<Activity/>}/><Stat title="Alpa" value={attendance.filter(a=>a.status==='ALPA').length} icon={<X/>}/></div><p className="tiny">Laporan menampilkan data yang tersedia pada tanggal hari ini. Laporan bulanan dan ekspor PDF dapat ditambahkan pada tahap berikutnya.</p></section>}
  </main>
  {showAdd&&<div className="modal-back"><form className="modal" onSubmit={addStudent}><div className="panel-head"><div><h3>Tambah siswa</h3><p>NIK hanya disimpan pada tabel privat.</p></div><button type="button" className="icon-btn" onClick={()=>setShowAdd(false)}><X/></button></div><label>Nama lengkap<input value={name} onChange={e=>setName(e.target.value)} required placeholder="Nama siswa"/></label><label>NIK (16 angka)<input value={nik} onChange={e=>setNik(e.target.value.replace(/\D/g,''))} maxLength={16} inputMode="numeric" required placeholder="Masukkan NIK"/></label><button className="primary wide">Simpan siswa</button></form></div>}
  {qrStudent&&<div className="modal-back" onClick={()=>setQrStudent(null)}><div className="modal qr-modal" onClick={e=>e.stopPropagation()}><button className="icon-btn close" onClick={()=>setQrStudent(null)}><X/></button><h3>QR Code Siswa</h3><b>{qrStudent.full_name}</b><p className="muted">{qrStudent.student_code}</p><QRCodeCanvas value={qrStudent.qr_token} size={220} includeMargin/><button className="secondary wide" onClick={()=>window.print()}>Cetak QR</button></div></div>}
  </div>
}
function Stat({title,value,icon}:{title:string,value:number,icon:any}){return <div className="stat"><div className="stat-icon">{icon}</div><div><small>{title}</small><strong>{value}</strong></div></div>}
function AttendanceTable({rows}:{rows:Attendance[]}){return <div className="table-wrap"><table><thead><tr><th>Nama siswa</th><th>ID siswa</th><th>Waktu</th><th>Status</th><th>GPS</th></tr></thead><tbody>{rows.map(a=><tr key={a.id}><td>{a.students?.full_name||'—'}</td><td>{a.students?.student_code||'—'}</td><td>{a.check_in_time?new Date(a.check_in_time).toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}):'—'}</td><td><span className={'status '+a.status.toLowerCase()}>{a.status}</span></td><td>{a.latitude&&a.longitude?'Tersedia':'—'}</td></tr>)}</tbody></table>{rows.length===0&&<p className="empty">Belum ada absensi hari ini.</p>}</div>}
function downloadCSV(rows:Attendance[]){const lines=[['Nama','ID Siswa','Tanggal','Waktu','Status','Latitude','Longitude'].join(','),...rows.map(a=>[a.students?.full_name||'',a.students?.student_code||'',a.attendance_date,a.check_in_time||'',a.status,a.latitude??'',a.longitude??''].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(','))];const blob=new Blob([lines.join('\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='laporan-absensi.csv';a.click();URL.revokeObjectURL(url)}
function Setup(){return <main className="login"><div className="login-card setup"><div className="brand-mark"><GraduationCap/></div><p className="eyebrow">PENYIAPAN WEBSITE</p><h1>SISWA <span>TRACK</span></h1><h3>Hubungkan ke Supabase</h3><p className="muted">Buat file <b>.env</b> berdasarkan <b>.env.example</b>, lalu isi URL Project dan publishable/anon key dari pengaturan API Supabase. Jangan gunakan service_role key.</p><ol><li>Buka Project Settings → API.</li><li>Salin Project URL ke VITE_SUPABASE_URL.</li><li>Salin publishable key (atau anon public key) ke VITE_SUPABASE_ANON_KEY.</li><li>Jalankan ulang aplikasi.</li></ol><p className="tiny">Jangan mengirim key melalui chat atau memasukkannya ke repositori publik.</p></div></main>}
