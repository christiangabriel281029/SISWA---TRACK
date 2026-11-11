import { useEffect, useRef, useState } from 'react'
import { supabase, configured } from './supabase'
import { BrowserMultiFormatReader } from '@zxing/browser'
import { QRCodeCanvas } from 'qrcode.react'

type Student = {
  id: string
  student_code: string
  full_name: string
  qr_token: string
  is_active: boolean
}

type Attendance = {
  id: string
  student_id: string
  attendance_date: string
  status: string
  check_in_time: string | null
  latitude: number | null
  longitude: number | null
  students?: {
    full_name: string
    student_code: string
  }
}

const today = new Date().toLocaleDateString('en-CA')

export default function App() {
  const [session, setSession] = useState<any>(null)
  const [role, setRole] = useState('')
  const [profile, setProfile] = useState('Pengguna')
  const [students, setStudents] = useState<Student[]>([])
  const [attendance, setAttendance] = useState<Attendance[]>([])
  const [page, setPage] = useState('dashboard')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [nik, setNik] = useState('')
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [qrStudent, setQrStudent] = useState<Student | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const controlsRef = useRef<{ stop: () => void } | null>(null)

  async function refresh() {
    if (!supabase) return

    const { data: studentData, error: studentError } =
      await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false })

    if (studentError) setNotice(studentError.message)
    else setStudents(studentData || [])

    const { data: attendanceData, error: attendanceError } =
      await supabase
        .from('attendance')
        .select('*,students(full_name,student_code)')
        .eq('attendance_date', today)
        .order('created_at', { ascending: false })

    if (attendanceError) setNotice(attendanceError.message)
    else setAttendance((attendanceData || []) as Attendance[])
  }

  async function loadProfile(userId: string) {
    if (!supabase) return

    const { data, error } = await supabase
      .from('profiles')
      .select('full_name,role')
      .eq('id', userId)
      .single()

    if (error) {
      setNotice('Profil Admin/Guru belum tersedia.')
      return
    }

    setProfile(data.full_name)
    setRole(data.role)
  }

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session)

      if (data.session) {
        await loadProfile(data.session.user.id)
        await refresh()
      }

      setLoading(false)
    })

    const { data } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        setSession(newSession)

        if (newSession) {
          await loadProfile(newSession.user.id)
          await refresh()
        } else {
          setRole('')
        }
      }
    )

    return () => {
      data.subscription.unsubscribe()
      controlsRef.current?.stop()
    }
  }, [])

  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!supabase) return

    const form = new FormData(e.currentTarget)

    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get('email')),
      password: String(form.get('password')),
    })

    setNotice(error?.message || 'Login berhasil.')
  }

  async function logout() {
    await supabase?.auth.signOut()
    setSession(null)
    setRole('')
  }

  async function addStudent(e: React.FormEvent) {
    e.preventDefault()
    if (!supabase) return

    if (!/^\d{16}$/.test(nik)) {
      setNotice('NIK harus 16 angka.')
      return
    }

    const studentCode = 'ST-' + Date.now()

    const { data, error } = await supabase
      .from('students')
      .insert({
        student_code: studentCode,
        full_name: name.trim(),
      })
      .select()
      .single()

    if (error) {
      setNotice(error.message)
      return
    }

    const { error: privateError } = await supabase
      .from('student_private')
      .insert({
        student_id: data.id,
        nik: nik,
      })

    if (privateError) {
      await supabase.from('students').delete().eq('id', data.id)
      setNotice(privateError.message)
      return
    }

    setName('')
    setNik('')
    setShowAdd(false)
    setNotice('Siswa berhasil ditambahkan.')
    await refresh()
  }

  async function getLocation() {
    return new Promise<{
      latitude: number | null
      longitude: number | null
      accuracy: number | null
    }>((resolve) => {
      if (!navigator.geolocation) {
        resolve({
          latitude: null,
          longitude: null,
          accuracy: null,
        })
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          })
        },
        () => {
          resolve({
            latitude: null,
            longitude: null,
            accuracy: null,
          })
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    })
  }

  async function markAttendance(token: string) {
    if (!supabase) return

    const student = students.find(
      (item) => item.qr_token === token && item.is_active
    )

    if (!student) {
      setNotice('QR tidak dikenal atau siswa tidak aktif.')
      return
    }

    const location = await getLocation()

    const { error } = await supabase
      .from('attendance')
      .insert({
        student_id: student.id,
        attendance_date: today,
        session: 'PAGI',
        status: 'HADIR',
        check_in_time: new Date().toISOString(),
        latitude: location.latitude,
        longitude: location.longitude,
        gps_accuracy: location.accuracy,
        scanned_by: session?.user?.id,
      })

    if (error) {
      setNotice(
        error.code === '23505'
          ? 'Siswa sudah melakukan absensi.'
          : error.message
      )
      return
    }

    setNotice('Absensi ' + student.full_name + ' berhasil.')
    await refresh()
  }

  async function startScanner() {
    setCameraOpen(true)

    window.setTimeout(async () => {
      if (!videoRef.current) return

      try {
        const reader = new BrowserMultiFormatReader()

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result) => {
            if (result) {
              controlsRef.current?.stop()
              controlsRef.current = null
              setCameraOpen(false)
              void markAttendance(result.getText())
            }
          }
        )

        controlsRef.current = controls
      } catch {
        setNotice('Kamera gagal dibuka. Periksa izin kamera.')
        setCameraOpen(false)
      }
    }, 300)
  }

  function stopScanner() {
    controlsRef.current?.stop()
    controlsRef.current = null
    setCameraOpen(false)
  }

  const present = attendance.filter(
    (item) => item.status === 'HADIR'
  ).length

  const izin = attendance.filter(
    (item) => item.status === 'IZIN'
  ).length

  const sakit = attendance.filter(
    (item) => item.status === 'SAKIT'
  ).length

  const alpa = attendance.filter(
    (item) => item.status === 'ALPA'
  ).length

  const filteredStudents = students.filter((student) =>
    (student.full_name + student.student_code)
      .toLowerCase()
      .includes(search.toLowerCase())
  )

  if (!configured) {
    return <h2>Hubungkan SISWA TRACK ke Supabase terlebih dahulu.</h2>
  }

  if (loading) return <h2>Memuat SISWA TRACK...</h2>

  if (!session) {
    return (
      <main className="login">
        <div className="login-card">
          <h1>SISWA TRACK</h1>
          <p>Sistem Absensi Siswa</p>

          <form onSubmit={login}>
            <label>Email</label>
            <input
              name="email"
              type="email"
              required
              placeholder="Email akun"
            />

            <label>Password</label>
            <input
              name="password"
              type="password"
              required
              placeholder="Password akun"
            />

            <button type="submit">Masuk</button>
          </form>

          {notice && <p>{notice}</p>}
        </div>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <h2>SISWA TRACK</h2>
        <span>{profile} ({role})</span>
        <button onClick={logout}>Keluar</button>
      </header>

      <nav className="navigation">
        <button onClick={() => setPage('dashboard')}>Dashboard</button>
        <button onClick={() => setPage('students')}>Data Siswa</button>
        <button onClick={() => setPage('scan')}>Scan QR</button>
        <button onClick={() => setPage('attendance')}>Absensi</button>
        <button onClick={() => setPage('map')}>Peta GPS</button>
      </nav>

      <main className="content">
        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice('')}>Tutup</button>
          </div>
        )}

        {page === 'dashboard' && (
          <>
            <h2>Dashboard</h2>
            <p>Ringkasan kehadiran hari ini: {today}</p>

            <div className="stats">
              <div className="stat">
                <span>Hadir</span>
                <strong>{present}</strong>
              </div>
              <div className="stat">
                <span>Izin</span>
                <strong>{izin}</strong>
              </div>
              <div className="stat">
                <span>Sakit</span>
                <strong>{sakit}</strong>
              </div>
              <div className="stat">
                <span>Alpa</span>
                <strong>{alpa}</strong>
              </div>
            </div>

            <h3>Jumlah siswa: {students.length}</h3>
            <button onClick={() => void refresh()}>Muat ulang data</button>
          </>
        )}

        {page === 'students' && (
          <section>
            <h2>Data Siswa</h2>

            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama siswa"
            />

            {role === 'admin' && (
              <button onClick={() => setShowAdd(true)}>
                Tambah Siswa
              </button>
            )}

            {filteredStudents.map((student) => (
              <div className="student-card" key={student.id}>
                <b>{student.full_name}</b>
                <p>{student.student_code}</p>
                <button onClick={() => setQrStudent(student)}>
                  Lihat QR
                </button>
              </div>
            ))}
          </section>
        )}

        {page === 'scan' && (
          <section>
            <h2>Pemindaian QR</h2>

            {!cameraOpen ? (
              <button onClick={() => void startScanner()}>
                Buka Kamera
              </button>
            ) : (
              <>
                <video
                  ref={videoRef}
                  muted
                  playsInline
                  style={{ width: '100%', maxWidth: 450 }}
                />
                <button onClick={stopScanner}>Tutup Kamera</button>
              </>
            )}
          </section>
        )}

        {page === 'attendance' && (
          <section>
            <h2>Riwayat Absensi Hari Ini</h2>

            {attendance.map((item) => (
              <div className="student-card" key={item.id}>
                <b>{item.students?.full_name || 'Siswa'}</b>
                <p>Status: {item.status}</p>
                <p>
                  Waktu:{' '}
                  {item.check_in_time
                    ? new Date(item.check_in_time).toLocaleTimeString('id-ID')
                    : '-'}
                </p>
              </div>
            ))}
          </section>
        )}

        {page === 'map' && (
          <section>
            <h2>Lokasi Pemindaian GPS</h2>

            {attendance.map((item) =>
              item.latitude !== null && item.longitude !== null ? (
                <div className="student-card" key={item.id}>
                  <b>{item.students?.full_name || 'Siswa'}</b>
                  <p>Latitude: {item.latitude}</p>
                  <p>Longitude: {item.longitude}</p>
                  <a
                    href={`https://www.google.com/maps?q=${item.latitude},${item.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Buka di Google Maps
                  </a>
                </div>
              ) : null
            )}
          </section>
        )}
      </main>

      {showAdd && (
        <div className="modal-back">
          <form className="modal" onSubmit={addStudent}>
            <h2>Tambah Siswa</h2>

            <label>Nama lengkap</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <label>NIK (16 angka)</label>
            <input
              value={nik}
              onChange={(e) =>
                setNik(e.target.value.replace(/\D/g, '').slice(0, 16))
              }
              inputMode="numeric"
              required
            />

            <button type="submit">Simpan</button>
            <button type="button" onClick={() => setShowAdd(false)}>
              Batal
            </button>
          </form>
        </div>
      )}

      {qrStudent && (
        <div className="modal-back">
          <div className="modal">
            <h2>QR Siswa</h2>
            <b>{qrStudent.full_name}</b>
            <p>{qrStudent.student_code}</p>

            <QRCodeCanvas
              value={qrStudent.qr_token}
              size={220}
              includeMargin
            />

            <button onClick={() => window.print()}>Cetak QR</button>
            <button onClick={() => setQrStudent(null)}>Tutup</button>
          </div>
        </div>
      )}
    </div>
  )
    }
