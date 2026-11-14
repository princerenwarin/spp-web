const STORAGE_KEY = 'spp-web-db-v1';

const LEGACY_USER_ALIASES = {
  admin: 'Admin',
  adminkkms: 'Admin',
  yayasan: 'Yayasan',
  admintheresia: 'TK01',
  adminmaria: 'M01',
  adminmikael: 'K01',
  adminyusup: 'Y01'
};

const DEFAULT_DB = {
  users: [
    { idpemakai: 'Admin', password: 'admin123', jabatan: 'Administrator', role: 'superadmin', unit: 'ALL' },
    { idpemakai: 'Yayasan', password: 'yayasan123', jabatan: 'Yayasan', role: 'yayasan', unit: 'ALL' },
    { idpemakai: 'TK01', password: 'tk123', jabatan: 'Administrator', role: 'unit', unit: 'T' },
    { idpemakai: 'M01', password: 'm123', jabatan: 'Administrator', role: 'unit', unit: 'M' },
    { idpemakai: 'K01', password: 'k123', jabatan: 'Administrator', role: 'unit', unit: 'K' },
    { idpemakai: 'Y01', password: 'y123', jabatan: 'Administrator', role: 'unit', unit: 'Y' }
  ],
  schools: [
    { kdsek: 'T', nmsek: 'TK ST. Theresia' },
    { kdsek: 'M', nmsek: 'SD ST. Maria' },
    { kdsek: 'K', nmsek: 'SMP ST. Mikael' },
    { kdsek: 'Y', nmsek: 'SD ST. Yusuf' },
    { kdsek: 'P', nmsek: 'PG ST. Theresia' }
  ],
  siswa: [
    { nospp: 'M3B00342', nama: 'Anna', kdsek: 'M', kdkls: '3B', id: '00342', spp: 335000, komp: 20000, idpemakai: 'admin' },
    { nospp: 'Y5B00140', nama: 'Budi', kdsek: 'Y', kdkls: '5B', id: '00140', spp: 330000, komp: 20000, idpemakai: 'admin' },
    { nospp: 'K7C00249', nama: 'Citra', kdsek: 'K', kdkls: '7C', id: '00249', spp: 450000, komp: 25000, idpemakai: 'admin' },
    { nospp: 'T1A01470', nama: 'Dewi', kdsek: 'T', kdkls: 'A2', id: '01470', spp: 310000, komp: 15000, idpemakai: 'admin' }
  ],
  transaksi: [
    { id: 'tx-1', nospp: 'M3B00342', nama: 'Anna', kdsek: 'M', periode: '112026', nominal: 355000, tglbyr: '2026-11-02', idpemakai: 'admin', ket: 'Pembayaran via web' },
    { id: 'tx-2', nospp: 'Y5B00140', nama: 'Budi', kdsek: 'Y', periode: '112026', nominal: 350000, tglbyr: '2026-11-04', idpemakai: 'admin', ket: 'Pembayaran via web' },
    { id: 'tx-3', nospp: 'K7C00249', nama: 'Citra', kdsek: 'K', periode: '112026', nominal: 475000, tglbyr: '2026-11-07', idpemakai: 'admin', ket: 'Pembayaran via web' }
  ]
};

const app = {
  supabase: null,
  user: null,
  state: null,
  currentPage: 'dashboard',
  useSupabase: false
};

const pageMap = {
  dashboard: document.getElementById('dashboardPage'),
  siswa: document.getElementById('siswaPage'),
  pembayaran: document.getElementById('pembayaranPage'),
  laporan: document.getElementById('laporanPage')
};

const ui = {
  sidebar: document.getElementById('sidebar'),
  loginScreen: document.getElementById('loginScreen'),
  pageTitle: document.getElementById('pageTitle'),
  userName: document.getElementById('userName'),
  schoolFilter: document.getElementById('schoolFilter'),
  studentTableBody: document.getElementById('studentTableBody'),
  studentForm: document.getElementById('studentForm'),
  studentNospp: document.getElementById('studentNospp'),
  studentNama: document.getElementById('studentNama'),
  studentSekolah: document.getElementById('studentSekolah'),
  studentKelas: document.getElementById('studentKelas'),
  studentIndex: document.getElementById('studentIndex'),
  studentSpp: document.getElementById('studentSpp'),
  studentKomp: document.getElementById('studentKomp'),
  studentIdEdit: document.getElementById('studentIdEdit'),
  studentSubmitBtn: document.getElementById('studentSubmitBtn'),
  studentResetBtn: document.getElementById('studentResetBtn'),
  activityList: document.getElementById('activityList'),
  reportList: document.getElementById('reportList'),
  reportTable: document.getElementById('reportTable'),
  detailReportTable: document.getElementById('detailReportTable'),
  reportPeriod: document.getElementById('reportPeriod'),
  reportSummaryStudents: document.getElementById('reportSummaryStudents'),
  reportSummaryStudentsMeta: document.getElementById('reportSummaryStudentsMeta'),
  reportSummaryTagihan: document.getElementById('reportSummaryTagihan'),
  reportSummaryTerbayar: document.getElementById('reportSummaryTerbayar'),
  reportSummaryBelum: document.getElementById('reportSummaryBelum'),
  paymentList: document.getElementById('paymentList'),
  totalSiswa: document.getElementById('totalSiswa'),
  totalTagihan: document.getElementById('totalTagihan'),
  paymentThisMonth: document.getElementById('paymentThisMonth'),
  totalTransaksi: document.getElementById('totalTransaksi'),
  searchStudent: document.getElementById('searchStudent'),
  paymentForm: document.getElementById('paymentForm'),
  loginForm: document.getElementById('loginForm')
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DB));
      return clone(DEFAULT_DB);
    }
    const parsed = JSON.parse(raw);
    const users = (parsed.users || clone(DEFAULT_DB.users)).map((user) => {
      const canonicalId = normalizeCanonicalUserId(user.idpemakai);
      return {
        ...user,
        idpemakai: canonicalId,
        password: user.password || DEFAULT_DB.users.find((item) => normalizeLoginValue(item.idpemakai) === normalizeLoginValue(canonicalId))?.password || user.password
      };
    });

    const normalized = {
      users,
      schools: parsed.schools || clone(DEFAULT_DB.schools),
      siswa: parsed.siswa || clone(DEFAULT_DB.siswa),
      transaksi: parsed.transaksi || clone(DEFAULT_DB.transaksi)
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    return normalized;
  } catch (error) {
    console.warn('Invalid local data, using defaults.', error);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_DB));
    return clone(DEFAULT_DB);
  }
}

function hasSupabaseConfig() {
  const config = window.SUPABASE_CONFIG || {};
  const url = config.url || '';
  const anonKey = config.anonKey || '';
  return Boolean(url && anonKey && !url.includes('YOUR_PROJECT') && !anonKey.includes('YOUR_'));
}

function normalizeSupabaseSchool(row) {
  return {
    kdsek: String(row.kdsek || row.kode_sekolah || '').trim(),
    nmsek: row.nmsek || row.nama_sekolah || 'Sekolah'
  };
}

function normalizeSupabaseStudent(row) {
  const nomor = row.id || row.id_siswa || row.id_anak || '';
  const nospp = row.nospp || row.no_spp || row.no_spp || String(row.id || '').padStart(5, '0');
  const kdsek = row.kdsek || row.id_sekolah || '';
  return {
    nospp: String(nospp),
    nama: row.nama || row.nama_siswa || 'Siswa',
    kdsek: String(kdsek),
    kdkls: row.kdkls || row.kelas_aktif || '',
    id: String(nomor),
    spp: Number(row.spp || row.nominal || 0),
    komp: Number(row.komp || 0),
    idpemakai: row.idpemakai || row.id_pengguna || 'admin'
  };
}

function normalizeSupabaseTransaction(row) {
  const nospp = row.nospp || row.no_spp || '';
  const nama = row.nama || row.nama_siswa || 'Siswa';
  const kdsek = row.kdsek || row.id_sekolah || '';
  return {
    id: row.id || row.id_pembayaran || `tx-${Date.now()}-${Math.random()}`,
    nospp: String(nospp),
    nama: String(nama),
    kdsek: String(kdsek),
    periode: row.periode || row.tglbyr || '',
    nominal: Number(row.nominal || row.jumlah_bayar || 0),
    tglbyr: row.tglbyr || row.tanggal_bayar || new Date().toISOString().slice(0, 10),
    idpemakai: row.idpemakai || row.id_pengguna || 'admin',
    ket: row.ket || row.keterangan || 'Pembayaran via web'
  };
}

async function loadSupabaseData() {
  if (!app.supabase || !hasSupabaseConfig()) {
    return null;
  }

  try {
    const [schoolsRes, mastankRes, mastsppRes, pembayaranRes] = await Promise.all([
      app.supabase.from('mastsek').select('*'),
      app.supabase.from('mastank').select('*'),
      app.supabase.from('mastspp').select('*'),
      app.supabase.from('pembayaran').select('*')
    ]);

    const schoolsData = schoolsRes.data || [];
    const studentMaster = mastankRes.data || [];
    const tagihanData = mastsppRes.data || [];
    const transaksiData = pembayaranRes.data || [];

    const studentById = new Map();
    studentMaster.forEach((student) => {
      const key = String(student.id || student.id_siswa || '').trim();
      if (key) studentById.set(key, student);
    });

    const fallbackSchools = (schoolsData.length ? schoolsData : [{ kdsek: 'T', nmsek: 'TK ST. Theresia' }, { kdsek: 'M', nmsek: 'SD ST. Maria' }, { kdsek: 'K', nmsek: 'SMP ST. Mikael' }, { kdsek: 'Y', nmsek: 'SD ST. Yusuf' }])
      .map((row) => normalizeSupabaseSchool({
        kdsek: row.kdsek || row.id_sekolah || row.kode_sekolah,
        nmsek: row.nmsek || row.nama_sekolah || row.nama,
        ...row
      }))
      .filter((school) => school.kdsek);

    const fallbackSiswa = (tagihanData.length ? tagihanData : DEFAULT_DB.siswa)
      .map((row) => {
        const master = studentById.get(String(row.id_siswa || row.id || '')) || {};
        return normalizeSupabaseStudent({
          ...master,
          ...row,
          nama: row.nama || master.nama || row.nama_siswa || master.nama_siswa || 'Siswa',
          kdsek: row.kdsek || master.id_sekolah || row.id_sekolah || '',
          kdkls: row.kdkls || master.kelas_aktif || row.kelas_aktif || '',
          id: row.id || row.id_siswa || master.id || '',
          nospp: row.nospp || row.no_spp || String(row.id || row.id_siswa || '').padStart(5, '0')
        });
      })
      .filter((siswa) => siswa.nospp);

    const fallbackTransaksi = (transaksiData.length ? transaksiData : DEFAULT_DB.transaksi)
      .map(normalizeSupabaseTransaction);

    return {
      schools: fallbackSchools,
      users: [],
      siswa: fallbackSiswa,
      transaksi: fallbackTransaksi
    };
  } catch (error) {
    console.warn('Supabase fetch failed, using local demo data.', error);
    return null;
  }
}

function saveLocalData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(app.state));
}

function getSchoolName(kdsek) {
  const school = app.state.schools.find((item) => item.kdsek === kdsek);
  return school ? school.nmsek : '-';
}

function formatRupiah(value) {
  const amount = Number(value || 0);
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(amount);
}

function setPage(pageName) {
  if (pageName === 'pembayaran' && !canAccessPayment()) {
    alert('Hanya Admin KKMS yang dapat mengakses halaman pembayaran.');
    return;
  }

  app.currentPage = pageName;
  Object.entries(pageMap).forEach(([key, element]) => {
    element.classList.toggle('active', key === pageName);
  });

  document.querySelectorAll('.nav').forEach((button) => {
    button.classList.toggle('active', button.dataset.page === pageName);
  });

  ui.pageTitle.textContent = {
    dashboard: 'Overview',
    siswa: 'Data Siswa',
    pembayaran: 'Pembayaran',
    laporan: 'Laporan'
  }[pageName];
}

function initSupabase() {
  const { url, anonKey } = window.SUPABASE_CONFIG || {};
  if (!url || !anonKey || url.includes('YOUR_PROJECT') || anonKey.includes('YOUR_')) {
    return null;
  }
  return window.supabase.createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  });
}

function getAllowedSchoolCodes() {
  if (!app.user) return app.state.schools.map((school) => school.kdsek);
  if (app.user.role === 'unit') return [app.user.unit];
  return app.state.schools.map((school) => school.kdsek);
}

function canAccessPayment() {
  return !!app.user && app.user.role === 'superadmin';
}

function canAccessAllReports() {
  return !!app.user && (app.user.role === 'superadmin' || app.user.role === 'yayasan');
}

function applyUserAccess() {
  const paymentNav = document.querySelector('.nav[data-page="pembayaran"]');
  if (paymentNav) {
    paymentNav.style.display = canAccessPayment() ? 'block' : 'none';
  }

  const allowedSchools = app.state.schools.filter((school) => getAllowedSchoolCodes().includes(school.kdsek));
  const schoolFilterOptions = ['<option value="all">Semua</option>']
    .concat(allowedSchools.map((school) => `<option value="${school.kdsek}">${school.nmsek}</option>`))
    .join('');
  ui.schoolFilter.innerHTML = schoolFilterOptions;

  if (app.user && app.user.role === 'unit') {
    ui.schoolFilter.value = app.user.unit;
  } else if (ui.schoolFilter.value === '') {
    ui.schoolFilter.value = 'all';
  }
}

function populateSchoolSelect(selectedValue = '') {
  const allowedSchools = app.state.schools.filter((school) => getAllowedSchoolCodes().includes(school.kdsek));
  const options = allowedSchools
    .map((school) => `<option value="${school.kdsek}" ${selectedValue === school.kdsek ? 'selected' : ''}>${school.nmsek}</option>`)
    .join('');

  ui.studentSekolah.innerHTML = options;
  applyUserAccess();
}

function getFilteredStudents() {
  const schoolFilter = app.user && app.user.role === 'unit' ? app.user.unit : ui.schoolFilter.value;
  const keyword = ui.searchStudent.value.trim().toLowerCase();

  return app.state.siswa.filter((row) => {
    const matchSchool = schoolFilter === 'all' || row.kdsek === schoolFilter;
    const haystack = `${row.nospp || ''} ${row.nama || ''} ${row.kdkls || ''} ${row.id || ''} ${row.kdsek || ''}`.toLowerCase();
    const matchKeyword = !keyword || haystack.includes(keyword);
    return matchSchool && matchKeyword;
  });
}

function renderStudentTable() {
  const rows = getFilteredStudents();
  if (!rows.length) {
    ui.studentTableBody.innerHTML = '<tr><td colspan="7" class="empty-state">Tidak ada data siswa yang cocok.</td></tr>';
    return;
  }

  ui.studentTableBody.innerHTML = rows.map((row) => {
    const totalTagihan = Number(row.spp || 0) + Number(row.komp || 0);
    const totalBayar = app.state.transaksi
      .filter((tx) => tx.nospp === row.nospp)
      .reduce((sum, tx) => sum + Number(tx.nominal || 0), 0);
    const status = totalBayar >= totalTagihan ? 'Lunas' : 'Belum';

    return `
      <tr>
        <td>${row.nospp}</td>
        <td>${row.nama}</td>
        <td>${getSchoolName(row.kdsek)}</td>
        <td>${row.kdkls}</td>
        <td>${formatRupiah(totalTagihan)}</td>
        <td><span class="status-pill ${status === 'Lunas' ? 'lunas' : 'belum'}">${status}</span></td>
        <td>
          <button class="action-btn edit" data-action="edit-student" data-nospp="${row.nospp}">Edit</button>
          <button class="action-btn delete" data-action="delete-student" data-nospp="${row.nospp}">Hapus</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderPaymentList() {
  const rows = [...getAccessibleTransactionRows()].sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr));

  if (!rows.length) {
    ui.paymentList.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada riwayat pembayaran.</td></tr>';
    return;
  }

  ui.paymentList.innerHTML = rows.map((row) => `
    <tr>
      <td>${row.nospp}</td>
      <td>${row.nama || '-'}</td>
      <td>${row.periode || '-'}</td>
      <td>${row.tglbyr}</td>
      <td>${formatRupiah(row.nominal)}</td>
      <td>
        <button class="action-btn delete" data-action="delete-payment" data-id="${row.id}">Hapus</button>
      </td>
    </tr>
  `).join('');
}

function getAccessibleStudentRows() {
  if (!app.user || app.user.role === 'superadmin' || app.user.role === 'yayasan') {
    return app.state.siswa;
  }
  return app.state.siswa.filter((row) => row.kdsek === app.user.unit);
}

function getAccessibleTransactionRows() {
  if (!app.user || app.user.role === 'superadmin' || app.user.role === 'yayasan') {
    return app.state.transaksi;
  }
  return app.state.transaksi.filter((row) => row.kdsek === app.user.unit);
}

function renderDashboard() {
  const siswa = getAccessibleStudentRows();
  const transaksi = getAccessibleTransactionRows();
  const totalSiswa = siswa.length;
  const totalTagihan = siswa.reduce((sum, item) => sum + Number(item.spp || 0) + Number(item.komp || 0), 0);
  const bulanIni = new Date().getMonth() + 1;
  const thisMonth = transaksi
    .filter((item) => {
      const d = new Date(item.tglbyr);
      return d.getMonth() + 1 === bulanIni && d.getFullYear() === new Date().getFullYear();
    })
    .reduce((sum, item) => sum + Number(item.nominal || 0), 0);

  ui.totalSiswa.textContent = totalSiswa.toLocaleString('id-ID');
  ui.totalTagihan.textContent = formatRupiah(totalTagihan);
  ui.paymentThisMonth.textContent = formatRupiah(thisMonth);
  ui.totalTransaksi.textContent = transaksi.length.toLocaleString('id-ID');

  ui.activityList.innerHTML = [...transaksi]
    .sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr))
    .slice(0, 5)
    .map((item) => `
      <li>
        <div>
          <strong>${item.nospp}</strong>
          <small>${item.nama || 'Siswa'} • ${item.tglbyr}</small>
        </div>
        <strong>${formatRupiah(item.nominal)}</strong>
      </li>
    `)
    .join('');
}

function renderReport() {
  const schools = canAccessAllReports() ? app.state.schools : app.state.schools.filter((school) => getAllowedSchoolCodes().includes(school.kdsek));

  const summary = schools.map((school) => {
    const siswaSekolah = getAccessibleStudentRows().filter((item) => item.kdsek === school.kdsek);
    const totalTagihan = siswaSekolah.reduce((sum, item) => sum + Number(item.spp || 0) + Number(item.komp || 0), 0);
    const totalTerbayar = getAccessibleTransactionRows()
      .filter((item) => item.kdsek === school.kdsek)
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const belum = Math.max(totalTagihan - totalTerbayar, 0);

    return {
      school: school.nmsek,
      jumlah: siswaSekolah.length,
      totalTagihan,
      totalTerbayar,
      belum
    };
  });

  const siswa = getAccessibleStudentRows();
  const totalStudents = siswa.length;
  const totalTagihan = siswa.reduce((sum, item) => sum + Number(item.spp || 0) + Number(item.komp || 0), 0);
  const totalTerbayar = getAccessibleTransactionRows().reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const totalBelum = Math.max(totalTagihan - totalTerbayar, 0);

  const now = new Date();
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ui.reportPeriod.textContent = period;
  ui.reportSummaryStudents.textContent = totalStudents.toLocaleString('id-ID');
  ui.reportSummaryStudentsMeta.textContent = `${summary.reduce((sum, row) => sum + row.jumlah, 0)} siswa aktif`;
  ui.reportSummaryTagihan.textContent = formatRupiah(totalTagihan);
  ui.reportSummaryTerbayar.textContent = formatRupiah(totalTerbayar);
  ui.reportSummaryBelum.textContent = formatRupiah(totalBelum);

  ui.reportList.innerHTML = summary.map((row) => `
    <div class="report-item">
      <div class="report-item-meta">
        <span class="report-badge">${row.jumlah} siswa</span>
        <strong>${row.school}</strong>
      </div>
      <div class="report-item-metrics">
        <span>Tagihan <strong>${formatRupiah(row.totalTagihan)}</strong></span>
        <span>Terbayar <strong>${formatRupiah(row.totalTerbayar)}</strong></span>
        <span>Belum <strong>${formatRupiah(row.belum)}</strong></span>
      </div>
    </div>
  `).join('');

  ui.reportTable.innerHTML = summary.map((row) => `
    <tr>
      <td>${row.school}</td>
      <td>${row.jumlah}</td>
      <td>${formatRupiah(row.totalTagihan)}</td>
      <td>${formatRupiah(row.totalTerbayar)}</td>
      <td>${formatRupiah(row.belum)}</td>
    </tr>
  `).join('');

  ui.detailReportTable.innerHTML = getAccessibleStudentRows().map((row) => {
    const totalTagihan = Number(row.spp || 0) + Number(row.komp || 0);
    const totalTerbayar = getAccessibleTransactionRows()
      .filter((item) => item.nospp === row.nospp)
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const sisa = Math.max(totalTagihan - totalTerbayar, 0);
    const status = totalTerbayar >= totalTagihan ? 'Lunas' : 'Belum';
    const terakhirBayar = getAccessibleTransactionRows()
      .filter((item) => item.nospp === row.nospp)
      .sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr))[0];

    return `
      <tr>
        <td>${row.nospp}</td>
        <td>${row.nama}</td>
        <td>${getSchoolName(row.kdsek)}</td>
        <td>${row.kdkls}</td>
        <td>${formatRupiah(totalTagihan)}</td>
        <td>${formatRupiah(totalTerbayar)}</td>
        <td>${formatRupiah(sisa)}</td>
        <td><span class="status-pill ${status === 'Lunas' ? 'lunas' : 'belum'}">${status}</span></td>
        <td>${terakhirBayar ? terakhirBayar.tglbyr : '-'}</td>
      </tr>
    `;
  }).join('');
}

function resetStudentForm() {
  ui.studentForm.reset();
  ui.studentIdEdit.value = '';
  ui.studentSpp.value = 0;
  ui.studentKomp.value = 0;
  ui.studentSubmitBtn.textContent = 'Simpan Siswa';
}

function fillStudentForm(row) {
  ui.studentIdEdit.value = row.nospp;
  ui.studentNospp.value = row.nospp;
  ui.studentNama.value = row.nama;
  ui.studentSekolah.value = row.kdsek;
  ui.studentKelas.value = row.kdkls;
  ui.studentIndex.value = row.id;
  ui.studentSpp.value = row.spp;
  ui.studentKomp.value = row.komp;
  ui.studentSubmitBtn.textContent = 'Update Siswa';
  setPage('siswa');
}

function addOrUpdateStudent(event) {
  event.preventDefault();
  const nospp = ui.studentNospp.value.trim();
  const nama = ui.studentNama.value.trim();
  const kdsek = ui.studentSekolah.value;
  const kdkls = ui.studentKelas.value.trim();
  const id = ui.studentIndex.value.trim();
  const spp = Number(ui.studentSpp.value || 0);
  const komp = Number(ui.studentKomp.value || 0);

  if (!nospp || !nama || !kdsek || !kdkls || !id) {
    alert('Mohon isi semua field siswa dengan lengkap.');
    return;
  }

  const existingIndex = app.state.siswa.findIndex((item) => item.nospp === nospp);
  const payload = { nospp, nama, kdsek, kdkls, id, spp, komp, idpemakai: app.user ? app.user.idpemakai : 'admin' };

  if (existingIndex >= 0) {
    app.state.siswa[existingIndex] = payload;
  } else {
    app.state.siswa.push(payload);
  }

  saveLocalData();
  renderStudentTable();
  renderDashboard();
  renderReport();
  resetStudentForm();
}

function deleteStudent(nospp) {
  const confirmed = window.confirm(`Hapus siswa ${nospp}?`);
  if (!confirmed) return;

  app.state.siswa = app.state.siswa.filter((item) => item.nospp !== nospp);
  app.state.transaksi = app.state.transaksi.filter((item) => item.nospp !== nospp);
  saveLocalData();
  renderStudentTable();
  renderDashboard();
  renderReport();
}

function deletePayment(id) {
  const confirmed = window.confirm('Hapus riwayat pembayarannya?');
  if (!confirmed) return;

  app.state.transaksi = app.state.transaksi.filter((item) => item.id !== id);
  saveLocalData();
  renderPaymentList();
  renderDashboard();
  renderReport();
}

function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!canAccessPayment()) {
    alert('Hanya Admin KKMS yang dapat melakukan pembayaran.');
    return;
  }

  const formData = new FormData(event.currentTarget);
  const nospp = String(formData.get('nospp') || '').trim();
  const nama = String(formData.get('nama') || '').trim();
  const periode = String(formData.get('periode') || '').trim();
  const nominal = Number(formData.get('nominal') || 0);

  if (!nospp || nominal <= 0) {
    alert('Nomor SPP dan nominal pembayaran harus diisi.');
    return;
  }

  const student = app.state.siswa.find((item) => item.nospp === nospp);
  const payload = {
    id: `tx-${Date.now()}`,
    nospp,
    nama: nama || (student ? student.nama : 'Siswa'),
    kdsek: student ? student.kdsek : '',
    periode: periode || new Date().toISOString().slice(0, 7).replace('-', ''),
    nominal,
    tglbyr: new Date().toISOString().slice(0, 10),
    idpemakai: app.user ? app.user.idpemakai : 'admin',
    ket: 'Pembayaran via web'
  };

  app.state.transaksi.push(payload);
  saveLocalData();
  event.currentTarget.reset();
  renderDashboard();
  renderPaymentList();
  renderReport();
  renderStudentTable();
  alert('Pembayaran berhasil disimpan.');
}

function normalizeLoginValue(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCanonicalUserId(value) {
  const normalized = normalizeLoginValue(value);
  return LEGACY_USER_ALIASES[normalized] || String(value || '').trim();
}

function matchLoginUser(record, username, allowLegacyAliases = false) {
  const input = normalizeLoginValue(username);
  const candidates = [
    record.idpemakai,
    record.username,
    record.nama_lengkap,
    record.jabatan,
    record.id_pengguna,
    record.id_sekolah
  ];

  const normalizedCandidates = candidates
    .map((value) => normalizeLoginValue(String(value || '').trim()))
    .filter(Boolean);

  if (!allowLegacyAliases) {
    return normalizedCandidates.includes(input);
  }

  const aliasMappings = Object.entries(LEGACY_USER_ALIASES).reduce((acc, [alias, canonical]) => {
    acc[normalizeLoginValue(alias)] = normalizeLoginValue(canonical);
    return acc;
  }, {});

  const normalizedCanonicalInput = aliasMappings[input] || input;
  return normalizedCandidates.includes(input)
    || normalizedCandidates.includes(normalizedCanonicalInput)
    || Object.values(aliasMappings).includes(normalizedCanonicalInput);
}

async function login(username, password) {
  if (app.useSupabase && app.supabase) {
    const { data, error } = await app.supabase.rpc('login_mastusr', {
      p_username: username,
      p_password: password
    });
    if (error) {
      console.error('Supabase login RPC failed:', error);
      throw new Error('Layanan login Supabase belum siap. Jalankan SQL login_mastusr di Supabase.');
    }

    const matchedUser = data && data[0];
    if (!matchedUser) {
      return false;
    }

    const mappedUser = {
      idpemakai: matchedUser.idpemakai || username,
      jabatan: matchedUser.jabatan || matchedUser.nama_lengkap || 'Admin',
      role: String(matchedUser.role || 'unit').toLowerCase(),
      unit: matchedUser.id_sekolah || 'ALL'
    };

    app.user = mappedUser;
    ui.userName.textContent = mappedUser.jabatan || mappedUser.idpemakai;
    ui.sidebar.hidden = false;
    applyUserAccess();
    ui.loginScreen.classList.add('hidden');
    return true;
  }

  const localUser = app.state.users.find((item) => matchLoginUser(item, username, true) && item.password === password);
  if (localUser) {
    app.user = localUser;
    ui.userName.textContent = localUser.jabatan || localUser.idpemakai;
    ui.sidebar.hidden = false;
    applyUserAccess();
    ui.loginScreen.classList.add('hidden');
    return true;
  }

  return false;
}

function setupEvents() {
  document.querySelectorAll('.nav').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });

  ui.searchStudent.addEventListener('input', renderStudentTable);
  ui.schoolFilter.addEventListener('change', renderStudentTable);
  ui.studentForm.addEventListener('submit', addOrUpdateStudent);
  ui.studentResetBtn.addEventListener('click', resetStudentForm);
  ui.paymentForm.addEventListener('submit', handlePaymentSubmit);

  ui.studentTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const { action, nospp } = target.dataset;
    if (action === 'edit-student') {
      const row = app.state.siswa.find((item) => item.nospp === nospp);
      if (row) fillStudentForm(row);
    }
    if (action === 'delete-student') {
      deleteStudent(nospp);
    }
  });

  ui.paymentList.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    if (target.dataset.action === 'delete-payment') {
      deletePayment(target.dataset.id);
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    app.user = null;
    applyUserAccess();
    ui.sidebar.hidden = true;
    ui.loginScreen.classList.remove('hidden');
    ui.loginForm.reset();
  });

  ui.loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = document.getElementById('loginUser').value.trim();
    const password = document.getElementById('loginPassword').value.trim();

    try {
      if (!(await login(username, password))) {
        alert('Username atau password salah.');
        return;
      }
    } catch (error) {
      console.error('Login failed:', error);
      alert(error instanceof Error ? error.message : 'Login tidak dapat diproses.');
      return;
    }

    renderAll();
    setPage('dashboard');
  });
}

function renderAll() {
  populateSchoolSelect();
  renderDashboard();
  renderStudentTable();
  renderPaymentList();
  renderReport();
}

async function hydrateAppData() {
  const configured = hasSupabaseConfig();
  if (!configured || !window.supabase) {
    app.useSupabase = false;
    return;
  }

  app.supabase = initSupabase();
  if (!app.supabase) {
    app.useSupabase = false;
    return;
  }

  app.useSupabase = true;
  const supabaseData = await loadSupabaseData();
  if (supabaseData) {
    app.state = { ...app.state, ...supabaseData };
  }
}

function start() {
  app.state = loadLocalData();
  setupEvents();
  hydrateAppData().finally(() => {
    setPage('dashboard');
    populateSchoolSelect();
    renderAll();
    ui.sidebar.hidden = true;
    ui.loginScreen.classList.remove('hidden');
  });
}

start();
