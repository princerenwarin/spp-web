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
    { kdsek: 'T', nmsek: 'TK ST. Theresia', vaCode: '01', active: true, isCustom: false },
    { kdsek: 'M', nmsek: 'SD ST. Maria', vaCode: '02', active: true, isCustom: false },
    { kdsek: 'K', nmsek: 'SMP ST. Mikael', vaCode: '03', active: true, isCustom: false },
    { kdsek: 'Y', nmsek: 'SD ST. Yusuf', vaCode: '04', active: true, isCustom: false },
    { kdsek: 'P', nmsek: 'PG ST. Theresia', vaCode: '05', active: true, isCustom: false }
  ],
  bankName: 'BCA',
  vaSettings: [],
  classes: [
    { kdsek: 'M', kdkls: '3B', active: true },
    { kdsek: 'Y', kdkls: '5B', active: true },
    { kdsek: 'K', kdkls: '7C', active: true },
    { kdsek: 'T', kdkls: 'A2', active: true }
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
  useSupabase: false,
  settingsReady: false,
  adminCredentials: null,
  selectedStudents: new Set(),
  selectedNames: new Map(),
  pickerCache: new Map(),
  server: false,
  years: [],
  usedSchools: new Set(),
  paging: { students: 0, payments: 0, detail: 0 },
  totals: { students: 0, payments: 0, detail: 0 },
  dash: null,
  reportRows: null
};

const PAGE_SIZE = 25;

const pageMap = {
  dashboard: document.getElementById('dashboardPage'),
  siswa: document.getElementById('siswaPage'),
  pembayaran: document.getElementById('pembayaranPage'),
  laporan: document.getElementById('laporanPage'),
  sekolah: document.getElementById('sekolahPage'),
  bank: document.getElementById('bankPage')
};

const ui = {
  sidebar: document.getElementById('sidebar'),
  loginScreen: document.getElementById('loginScreen'),
  pageTitle: document.getElementById('pageTitle'),
  userName: document.getElementById('userName'),
  schoolFilter: document.getElementById('schoolFilter'),
  yearFilter: document.getElementById('yearFilter'),
  paymentSearch: document.getElementById('paymentSearch'),
  studentTableBody: document.getElementById('studentTableBody'),
  studentForm: document.getElementById('studentForm'),
  studentNama: document.getElementById('studentNama'),
  studentSekolah: document.getElementById('studentSekolah'),
  studentKelas: document.getElementById('studentKelas'),
  studentType: document.getElementById('studentType'),
  studentTahun: document.getElementById('studentTahun'),
  studentExisting: document.getElementById('studentExisting'),
  studentWa: document.getElementById('studentWa'),
  studentPeriode: document.getElementById('studentPeriode'),
  studentDpp: document.getElementById('studentDpp'),
  studentDsp: document.getElementById('studentDsp'),
  studentSeragam: document.getElementById('studentSeragam'),
  studentGiat: document.getElementById('studentGiat'),
  studentSpp: document.getElementById('studentSpp'),
  studentKomp: document.getElementById('studentKomp'),
  studentTools: document.getElementById('studentTools'),
  arrearsTools: document.getElementById('arrearsTools'),
  arrearStudent: document.getElementById('arrearStudent'),
  arrearTahun: document.getElementById('arrearTahun'),
  arrearJenis: document.getElementById('arrearJenis'),
  arrearNominal: document.getElementById('arrearNominal'),
  arrearKet: document.getElementById('arrearKet'),
  arrearsBody: document.getElementById('arrearsBody'),
  selectedCount: document.getElementById('selectedCount'),
  selectionBar: document.getElementById('selectionBar'),
  selectedChips: document.getElementById('selectedChips'),
  studentCount: document.getElementById('studentCount'),
  selectAllStudents: document.getElementById('selectAllStudents'),
  bulkGiat: document.getElementById('bulkGiat'),
  bulkStaffMode: document.getElementById('bulkStaffMode'),
  importFile: document.getElementById('importFile'),
  studentLogWrap: document.getElementById('studentLogWrap'),
  studentLogBody: document.getElementById('studentLogBody'),
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
  paymentBankName: document.getElementById('paymentBankName'),
  searchStudent: document.getElementById('searchStudent'),
  paymentForm: document.getElementById('paymentForm'),
  loginForm: document.getElementById('loginForm'),
  schoolSettingsForm: document.getElementById('schoolSettingsForm'),
  schoolSettingsTableBody: document.getElementById('schoolSettingsTableBody'),
  newSchoolName: document.getElementById('newSchoolName'),
  newSchoolVaCode: document.getElementById('newSchoolVaCode'),
  addSchoolBtn: document.getElementById('addSchoolBtn'),
  schoolClassSettings: document.getElementById('schoolClassSettings'),
  schoolSettingsStatus: document.getElementById('schoolSettingsStatus'),
  schoolSettingsSaveBtn: document.getElementById('schoolSettingsSaveBtn'),
  bankSettingsForm: document.getElementById('bankSettingsForm'),
  bankVaSettings: document.getElementById('bankVaSettings'),
  addVaBankBtn: document.getElementById('addVaBankBtn'),
  bankSettingsStatus: document.getElementById('bankSettingsStatus'),
  bankSettingsSaveBtn: document.getElementById('bankSettingsSaveBtn')
};

function clone(data) {
  return JSON.parse(JSON.stringify(data));
}

function normalizeSchoolClasses(rows) {
  const classes = new Map();
  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const kdsek = String(row.kdsek || row.school_code || '').trim();
    const kdkls = String(row.kdkls || row.class_name || '').trim();
    if (!kdsek || !kdkls) return;

    const key = `${kdsek.toLowerCase()}\u0000${kdkls.toLowerCase()}`;
    if (classes.has(key)) return;
    const activeValue = row.active === undefined ? row.is_active : row.active;
    classes.set(key, {
      kdsek,
      kdkls,
      active: activeValue === undefined || activeValue === null
        ? true
        : activeValue === true || activeValue === 1 || activeValue === 'true'
    });
  });

  return [...classes.values()].sort((a, b) => (
    a.kdsek.localeCompare(b.kdsek, 'id') || a.kdkls.localeCompare(b.kdkls, 'id')
  ));
}

function deriveSchoolClasses(students) {
  return normalizeSchoolClasses((students || []).map((student) => ({
    kdsek: student.kdsek,
    kdkls: student.kdkls,
    active: true
  })));
}

function mergeSchoolClasses(configuredClasses, students) {
  const classes = normalizeSchoolClasses(configuredClasses);
  const classKeys = new Set(classes.map((item) => `${item.kdsek.toLowerCase()}\u0000${item.kdkls.toLowerCase()}`));
  const inferredActive = classes.length === 0;
  deriveSchoolClasses(students).forEach((item) => {
    const key = `${item.kdsek.toLowerCase()}\u0000${item.kdkls.toLowerCase()}`;
    if (!classKeys.has(key)) {
      classes.push({ ...item, active: inferredActive });
      classKeys.add(key);
    }
  });
  return normalizeSchoolClasses(classes);
}

function normalizeLocalSchool(row) {
  const defaultSchool = DEFAULT_DB.schools.find((item) => item.kdsek === String(row.kdsek || ''));
  return {
    kdsek: String(row.kdsek || '').trim(),
    nmsek: String(row.nmsek || 'Sekolah').trim(),
    vaCode: String(row.vaCode || defaultSchool?.vaCode || '').trim(),
    active: row.active !== false,
    isCustom: row.isCustom === true
  };
}

function normalizeSupabaseVABank(row) {
  return {
    id: String(row.config_id || ''),
    bankName: String(row.bank_name || '').trim(),
    vaPrefix: String(row.va_prefix || '').trim(),
    active: row.is_active === true
  };
}

function loadLocalData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const defaults = clone(DEFAULT_DB);
      defaults.classes = mergeSchoolClasses(defaults.classes, defaults.siswa);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaults));
      return defaults;
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
      schools: (parsed.schools || clone(DEFAULT_DB.schools)).map(normalizeLocalSchool),
      bankName: parsed.bankName || DEFAULT_DB.bankName,
      vaSettings: Array.isArray(parsed.vaSettings) ? parsed.vaSettings : [],
      siswa: parsed.siswa || clone(DEFAULT_DB.siswa),
      classes: mergeSchoolClasses(parsed.classes, parsed.siswa || clone(DEFAULT_DB.siswa)),
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
    kdsek: String(row.kdsek || row.id_sekolah || row.kode_sekolah || '').trim(),
    nmsek: String(row.nmsek || row.nama_sekolah || row.nama || 'Sekolah').trim(),
    vaCode: String(row.va_school_code || '').trim(),
    active: row.is_active !== false,
    isCustom: row.is_custom === true
  };
}

function normalizeSupabaseSchoolClass(row) {
  return {
    kdsek: String(row.school_code || '').trim(),
    kdkls: String(row.class_name || '').trim(),
    active: row.is_active !== false
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

function buildRuleStudents(students, enrollments) {
  const byId = new Map((students || []).map((item) => [String(item.id_siswa), item]));
  const latest = new Map();
  (enrollments || []).forEach((item) => {
    const current = latest.get(item.id_siswa);
    if (!current || item.tahun_ajaran > current.tahun_ajaran) latest.set(item.id_siswa, item);
  });
  return [...latest.values()].map((item) => {
    const student = byId.get(String(item.id_siswa)) || {};
    return {
      nospp: item.nospp,
      nama: student.nama || 'Siswa',
      kdsek: item.kdsek,
      kdkls: item.kdkls,
      id: String(item.id_siswa),
      spp: Number(item.spp || 0),
      komp: Number(item.komp || 0),
      giat: Number(item.giat || 0),
      tahunAjaran: item.tahun_ajaran,
      noWa: student.no_wa || '',
      isStaffChild: student.is_staff_child === true,
      showInBilling: student.show_in_billing !== false,
      idpemakai: 'admin'
    };
  });
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
    const probe = await app.supabase.from('spp_app_student_overview').select('id_siswa').limit(1);
    app.server = !probe.error;
    const empty = Promise.resolve({ data: [], error: null });
    const [schoolsRes, mastankRes, mastsppRes, pembayaranRes, bankSettingsRes, schoolSettingsRes, schoolClassesRes, vaSettingsRes, appStudentsRes, appEnrollmentsRes, arrearsRes] = await Promise.all([
      app.supabase.from('mastsek').select('*'),
      app.server ? empty : app.supabase.from('mastank').select('*'),
      app.server ? empty : app.supabase.from('mastspp').select('*'),
      app.server ? empty : app.supabase.from('pembayaran').select('*'),
      app.supabase.from('spp_app_bank_settings').select('bank_name').eq('setting_id', 1).maybeSingle(),
      app.supabase.from('spp_app_school_settings').select('school_code, school_name, va_school_code, is_active, is_custom'),
      app.supabase.from('spp_app_school_classes').select('school_code, class_name, is_active'),
      app.supabase.from('spp_app_va_settings').select('config_id, bank_name, va_prefix, is_active'),
      app.server ? app.supabase.from('spp_app_students').select('id_siswa').limit(1) : app.supabase.from('spp_app_students').select('*'),
      app.server ? app.supabase.from('spp_app_enrollments').select('id_siswa').limit(1) : app.supabase.from('spp_app_enrollments').select('*'),
      app.server ? empty : app.supabase.from('spp_app_arrears').select('*').order('id')
    ]);
    let usedCatalog = { classes: [], schools: [] };
    if (app.server) {
      const [yearsRes, usedRes] = await Promise.all([
        app.supabase.rpc('spp_app_years_v1'),
        app.supabase.rpc('spp_app_used_catalog_v1')
      ]);
      app.years = yearsRes.data || [];
      usedCatalog = usedRes.data || usedCatalog;
    }
    app.usedSchools = new Set(usedCatalog.schools || []);
    const studentRulesRes = { students: appStudentsRes.data, enrollments: appEnrollmentsRes.data };
    app.studentRulesReady = !appStudentsRes.error && !appEnrollmentsRes.error;
    if (!app.studentRulesReady) {
      console.warn('Migration 010_student_rules.sql belum dijalankan; data siswa hanya dibaca dari tabel lama.');
    }

    const settingsErrors = [bankSettingsRes.error, schoolSettingsRes.error, schoolClassesRes.error, vaSettingsRes.error].filter(Boolean);
    app.settingsReady = settingsErrors.length === 0;
    if (settingsErrors.length) {
      console.warn('Supabase settings are unavailable. Ensure the legacy mapping schema, migration 008_spp_catalog_settings.sql, and migration 009_spp_school_classes.sql are available.', settingsErrors);
    }

    const schoolsData = schoolsRes.data || [];
    const studentMaster = mastankRes.data || [];
    const tagihanData = mastsppRes.data || [];
    const transaksiData = pembayaranRes.data || [];
    const schoolSettings = schoolSettingsRes.data || [];
    const schoolSettingsByCode = new Map(schoolSettings.map((row) => [String(row.school_code || '').trim(), row]));

    const studentById = new Map();
    studentMaster.forEach((student) => {
      const key = String(student.id || student.id_siswa || '').trim();
      if (key) studentById.set(key, student);
    });

    const baseSchools = (schoolsData.length ? schoolsData : [{ kdsek: 'T', nmsek: 'TK ST. Theresia' }, { kdsek: 'M', nmsek: 'SD ST. Maria' }, { kdsek: 'K', nmsek: 'SMP ST. Mikael' }, { kdsek: 'Y', nmsek: 'SD ST. Yusuf' }])
      .map((row) => normalizeSupabaseSchool({
        ...row,
        kdsek: row.kdsek || row.id_sekolah || row.kode_sekolah,
        nmsek: row.nmsek || row.nama_sekolah || row.nama
      }))
      .filter((school) => school.kdsek);
    const baseSchoolCodes = new Set(baseSchools.map((school) => school.kdsek));
    const fallbackSchools = baseSchools.map((school) => {
      const settings = schoolSettingsByCode.get(school.kdsek);
      return settings
        ? normalizeSupabaseSchool({ ...school, ...settings, nmsek: settings.school_name || school.nmsek })
        : school;
    }).concat(schoolSettings
      .filter((row) => row.is_custom && !baseSchoolCodes.has(String(row.school_code || '').trim()))
      .map((row) => normalizeSupabaseSchool({
        ...row,
        kdsek: row.school_code,
        nmsek: row.school_name
      })));

    const legacySiswa = (tagihanData.length || app.server ? tagihanData : DEFAULT_DB.siswa)
      .map((row) => {
        const master = studentById.get(String(row.id_siswa || row.id || '')) || {};
        return normalizeSupabaseStudent({
          ...master,
          ...row,
          nama: row.nama || master.nama || row.nama_siswa || master.nama_siswa || 'Siswa',
          kdsek: row.kdsek || master.id_sekolah || row.id_sekolah || '',
          kdkls: row.kdkls || master.kdkls || master.kelas_aktif || row.kelas_aktif || '',
          id: row.id || row.id_siswa || master.id || '',
          nospp: row.nospp || row.no_spp || String(row.id || row.id_siswa || '').padStart(5, '0')
        });
      })
      .filter((siswa) => siswa.nospp);
    const ruleStudents = buildRuleStudents(studentRulesRes.students, studentRulesRes.enrollments);
    const ruleIds = new Set(ruleStudents.map((item) => item.id));
    const fallbackSiswa = ruleStudents.concat(legacySiswa.filter((item) => !ruleIds.has(item.id)));

    const fallbackTransaksi = (transaksiData.length || app.server ? transaksiData : DEFAULT_DB.transaksi)
      .map(normalizeSupabaseTransaction);

    return {
      schools: fallbackSchools,
      bankName: bankSettingsRes.data && bankSettingsRes.data.bank_name
        ? String(bankSettingsRes.data.bank_name).trim()
        : DEFAULT_DB.bankName,
      vaSettings: (vaSettingsRes.data || []).map(normalizeSupabaseVABank),
      classes: mergeSchoolClasses(
        (schoolClassesRes.data || []).map(normalizeSupabaseSchoolClass),
        app.server ? usedCatalog.classes || [] : fallbackSiswa
      ),
      users: [],
      siswa: fallbackSiswa,
      arrears: arrearsRes.error ? [] : (arrearsRes.data || []).map((row) => ({
        id: row.id,
        idSiswa: String(row.id_siswa),
        tahunAjaran: row.tahun_ajaran,
        jenis: row.jenis,
        keterangan: row.keterangan || '',
        nominal: Number(row.nominal || 0)
      })),
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

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[character]));
}

function setSettingsStatus(element, message, tone = '') {
  element.textContent = message;
  element.className = `settings-status${tone ? ` ${tone}` : ''}`;
}

function getSettingsUnavailableMessage() {
  return 'Pengaturan Supabase belum siap. Pastikan schema legacy (migration 005) dan migration 008 sudah diterapkan, lalu jalankan 009_spp_school_classes.sql di SQL Editor.';
}

function showSettingsError(element, error, action) {
  console.error(`${action} failed:`, error);
  const detail = String(error && error.message ? error.message : '');
  const missingRpc = /save_spp_catalog_settings_v3|PGRST202|42883/i.test(`${error && error.code ? error.code : ''} ${detail}`);
  const message = missingRpc
    ? getSettingsUnavailableMessage()
    : `Gagal menyimpan ${action.toLowerCase()}: ${detail || 'terjadi kesalahan yang tidak diketahui.'}`;
  setSettingsStatus(element, message, 'error');
}

function renderSettings() {
  const canSave = canManageSettings() && (!app.useSupabase || app.settingsReady);
  ui.schoolSettingsTableBody.innerHTML = app.state.schools.map((school) => `
    <tr data-school-row="true" data-school-code="${escapeHtml(school.kdsek)}" data-school-active="${school.active ? 'true' : 'false'}" data-school-custom="${school.isCustom ? 'true' : 'false'}">
      <td>${escapeHtml(school.kdsek)}</td>
      <td><input type="text" data-school-va-code value="${escapeHtml(school.vaCode || '')}" inputmode="numeric" pattern="[0-9]{2}" maxlength="2" placeholder="01" /></td>
      <td><input type="text" data-school-name value="${escapeHtml(school.nmsek)}" maxlength="100" required /></td>
      <td>${school.active ? 'Aktif' : 'Nonaktif'}</td>
      <td><button type="button" class="action-btn ${school.active ? 'delete' : 'edit'}" data-school-action="${escapeHtml(school.kdsek)}">${school.active ? 'Hapus' : 'Aktifkan'}</button></td>
    </tr>
  `).join('');
  renderSchoolClassSettings();
  renderBankVASettings();
  const activeBanks = app.state.vaSettings.filter((item) => item.active).map((item) => item.bankName);
  ui.paymentBankName.textContent = activeBanks.length ? activeBanks.join(', ') : 'Belum diatur';
  ui.schoolSettingsForm.querySelectorAll('input, button').forEach((control) => {
    control.disabled = !canSave;
  });
  ui.newSchoolName.disabled = !canSave;
  ui.newSchoolVaCode.disabled = !canSave;
  ui.addSchoolBtn.disabled = !canSave;
  ui.bankSettingsForm.querySelectorAll('input, button').forEach((control) => {
    control.disabled = !canSave;
  });
  ui.addVaBankBtn.disabled = !canSave;
  ui.bankSettingsSaveBtn.disabled = !canSave;

  if (app.useSupabase && !app.settingsReady) {
    const message = getSettingsUnavailableMessage();
    setSettingsStatus(ui.schoolSettingsStatus, message, 'error');
    setSettingsStatus(ui.bankSettingsStatus, message, 'error');
  } else {
    setSettingsStatus(ui.schoolSettingsStatus, '');
    setSettingsStatus(ui.bankSettingsStatus, '');
  }
}

function renderBankVASettings() {
  if (!app.state.vaSettings.length) {
    ui.bankVaSettings.innerHTML = '<tr><td colspan="4" class="empty-state">Belum ada bank VA. Tambahkan konfigurasi bank.</td></tr>';
    return;
  }

  ui.bankVaSettings.innerHTML = app.state.vaSettings.map((item) => `
    <tr data-va-row="${escapeHtml(item.id)}">
      <td><input type="text" data-va-bank-name value="${escapeHtml(item.bankName)}" maxlength="100" required /></td>
      <td><input type="text" data-va-prefix value="${escapeHtml(item.vaPrefix)}" inputmode="numeric" pattern="[0-9]{5,50}" maxlength="50" placeholder="Minimal 5 digit" required /></td>
      <td><input type="checkbox" data-va-active ${item.active ? 'checked' : ''} aria-label="Aktifkan VA ${escapeHtml(item.bankName)}" /></td>
      <td><button type="button" class="action-btn delete" data-remove-va="${escapeHtml(item.id)}">Hapus</button></td>
    </tr>
  `).join('');
}

function getSchoolSettingsDraft() {
  return [...ui.schoolSettingsTableBody.querySelectorAll('[data-school-row]')].map((row) => ({
    kdsek: row.dataset.schoolCode,
    nmsek: row.querySelector('[data-school-name]').value.trim(),
    vaCode: row.querySelector('[data-school-va-code]').value.trim(),
    active: row.dataset.schoolActive === 'true',
    isCustom: row.dataset.schoolCustom === 'true'
  }));
}

function getSchoolClassesDraft() {
  return [...ui.schoolClassSettings.querySelectorAll('[data-class-name]')].map((input) => ({
    kdsek: input.dataset.classSchool,
    kdkls: input.dataset.className,
    active: input.checked
  }));
}

function getBankSettingsDraft() {
  return [...ui.bankVaSettings.querySelectorAll('[data-va-row]')].map((row) => ({
    id: row.dataset.vaRow,
    bankName: row.querySelector('[data-va-bank-name]').value.trim(),
    vaPrefix: row.querySelector('[data-va-prefix]').value.trim(),
    active: row.querySelector('[data-va-active]').checked
  }));
}

function getActiveVABanks() {
  return app.state.vaSettings.filter((item) => item.active && /^\d{5,50}$/.test(item.vaPrefix));
}

function getStudentVirtualAccounts(student) {
  const school = app.state.schools.find((item) => item.kdsek === student.kdsek);
  if (!school || !/^\d{2}$/.test(school.vaCode || '') || !/^\d+$/.test(String(student.id || ''))) return [];

  return getActiveVABanks().map((bank) => ({
    bankName: bank.bankName,
    number: `${bank.vaPrefix}${school.vaCode}${String(student.id).padStart(4, '0')}`
  }));
}

function renderSchoolClassSettings() {
  if (!app.state.schools.length) {
    ui.schoolClassSettings.innerHTML = '<p class="empty-state">Belum ada data sekolah.</p>';
    return;
  }

  ui.schoolClassSettings.innerHTML = app.state.schools.map((school) => {
    const classes = app.state.classes.filter((item) => item.kdsek === school.kdsek);
    const classRows = classes.length
      ? classes.map((item) => `
        <label class="school-class-item">
          <input type="checkbox" data-class-school="${escapeHtml(item.kdsek)}" data-class-name="${escapeHtml(item.kdkls)}" ${item.active ? 'checked' : ''} />
          <span>${escapeHtml(item.kdkls)}</span>
        </label>
      `).join('')
      : '<p class="empty-state">Belum ada kelas. Tambahkan kelas di bawah.</p>';

    return `
      <section class="school-class-card">
        <h4>${escapeHtml(school.nmsek)} <span>(${escapeHtml(school.kdsek)})</span></h4>
        <p class="school-class-hint">Centang kelas yang boleh dipilih untuk siswa baru.</p>
        <div class="school-class-list">${classRows}</div>
        <div class="school-class-add">
          <label>
            <span>Tambah kelas</span>
            <input type="text" data-new-class="${escapeHtml(school.kdsek)}" maxlength="100" placeholder="Contoh: 3B" />
          </label>
          <button type="button" class="secondary-button small-button" data-add-class="${escapeHtml(school.kdsek)}">Tambah</button>
        </div>
      </section>
    `;
  }).join('');
}

function parseMoney(value) {
  return Number(String(value || '').replace(/\D/g, '')) || 0;
}

function formatMoneyInput(input) {
  input.value = input.value.replace(/\D/g, '') === '' && input.id === 'bulkGiat' ? '' : formatRupiah(parseMoney(input.value));
}

function formatAllMoneyInputs() {
  document.querySelectorAll('.money-input').forEach((input) => {
    if (input.value !== '') formatMoneyInput(input);
  });
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
  if (!pageMap[pageName]) return;

  if (pageName === 'pembayaran' && !canAccessPayment()) {
    alert('Hanya Admin KKMS yang dapat mengakses halaman pembayaran.');
    return;
  }

  if (['sekolah', 'bank'].includes(pageName) && !canManageSettings()) {
    alert('Hanya Admin yang dapat mengubah pengaturan sekolah dan bank.');
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
    laporan: 'Laporan',
    sekolah: 'Sekolah',
    bank: 'Bank'
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

function canManageSettings() {
  return canAccessPayment();
}

function canAccessAllReports() {
  return !!app.user && (app.user.role === 'superadmin' || app.user.role === 'yayasan');
}

function applyUserAccess() {
  const paymentNav = document.querySelector('.nav[data-page="pembayaran"]');
  if (paymentNav) {
    paymentNav.style.display = canAccessPayment() ? 'block' : 'none';
  }
  ui.studentForm.hidden = !canManageSettings();
  ui.studentTools.hidden = !canManageSettings();
  ui.arrearsTools.hidden = !canManageSettings();
  document.querySelectorAll('.admin-only').forEach((button) => {
    button.hidden = !canManageSettings();
  });

  const allowedSchools = app.state.schools.filter((school) => getAllowedSchoolCodes().includes(school.kdsek));
  const schoolFilterOptions = ['<option value="all">Semua</option>']
    .concat(allowedSchools.map((school) => `<option value="${escapeHtml(school.kdsek)}">${escapeHtml(school.nmsek)}</option>`))
    .join('');
  ui.schoolFilter.innerHTML = schoolFilterOptions;

  if (app.user && app.user.role === 'unit') {
    ui.schoolFilter.value = app.user.unit;
  } else if (ui.schoolFilter.value === '') {
    ui.schoolFilter.value = 'all';
  }
}

function populateStudentClassSelect(selectedValue = '') {
  const schoolCode = ui.studentSekolah.value;
  const activeClasses = app.state.classes.filter((item) => item.kdsek === schoolCode && item.active);
  const options = [...activeClasses];
  if (selectedValue && !options.some((item) => item.kdkls === selectedValue)) {
    options.push({ kdsek: schoolCode, kdkls: selectedValue, active: false });
  }

  const placeholder = activeClasses.length ? 'Pilih kelas' : 'Belum ada kelas aktif untuk sekolah ini';
  ui.studentKelas.innerHTML = `<option value="">${placeholder}</option>${options.map((item) => (
    `<option value="${escapeHtml(item.kdkls)}">${escapeHtml(item.kdkls)}${item.active ? '' : ' (nonaktif)'}</option>`
  )).join('')}`;
  ui.studentKelas.disabled = options.length === 0;
  ui.studentKelas.value = selectedValue || '';
}

function populateSchoolSelect(selectedValue = '', selectedClass = '') {
  const allowedSchools = app.state.schools.filter((school) => (
    getAllowedSchoolCodes().includes(school.kdsek) && (school.active || school.kdsek === selectedValue)
  ));
  const currentValue = ui.studentSekolah.value;
  const nextValue = allowedSchools.some((school) => school.kdsek === selectedValue)
    ? selectedValue
    : allowedSchools.some((school) => school.kdsek === currentValue)
      ? currentValue
      : allowedSchools[0]?.kdsek || '';
  const options = allowedSchools
    .map((school) => `<option value="${escapeHtml(school.kdsek)}">${escapeHtml(school.nmsek)}</option>`)
    .join('');

  ui.studentSekolah.innerHTML = options;
  ui.studentSekolah.disabled = allowedSchools.length === 0;
  ui.studentSekolah.value = nextValue;
  populateStudentClassSelect(selectedClass);
  applyUserAccess();
}

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

function currentSchoolScope() {
  const value = app.user && app.user.role === 'unit' ? app.user.unit : ui.schoolFilter.value;
  return !value || value === 'all' ? null : value;
}

function currentYearScope() {
  return ui.yearFilter.value || null;
}

function cleanKeyword(value) {
  return String(value || '').replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim();
}

function skeletonRows(columns, count = 6) {
  return Array.from({ length: count }, () => (
    `<tr class="skeleton-row"><td colspan="${columns}"><span class="skeleton"></span></td></tr>`
  )).join('');
}

function normalizeOverviewRow(row) {
  return {
    nospp: row.nospp,
    nama: row.nama || 'Siswa',
    kdsek: row.kdsek,
    kdkls: row.kdkls,
    id: String(row.id_siswa),
    spp: Number(row.spp || 0),
    komp: Number(row.komp || 0),
    giat: Number(row.giat || 0),
    tahunAjaran: row.tahun_ajaran,
    noWa: row.no_wa || '',
    isStaffChild: row.is_staff_child === true,
    showInBilling: row.show_in_billing !== false,
    arrearsTotal: Number(row.arrears_total || 0),
    paidTotal: Number(row.paid_total || 0),
    lastPaid: row.last_paid || '',
    idpemakai: 'admin'
  };
}

function rowBilled(row) {
  return Number(row.spp || 0) + Number(row.komp || 0) + Number(row.arrearsTotal || 0);
}

function renderPager(key, total) {
  const element = document.querySelector(`[data-pager="${key}"]`);
  if (!element) return;
  const page = app.paging[key];
  const from = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min(total, (page + 1) * PAGE_SIZE);
  element.hidden = total <= PAGE_SIZE;
  element.innerHTML = `
    <button type="button" class="secondary-button small-button" data-page-dir="-1" ${page === 0 ? 'disabled' : ''}>&lsaquo; Sebelumnya</button>
    <span>${from.toLocaleString('id-ID')}&ndash;${to.toLocaleString('id-ID')} dari ${total.toLocaleString('id-ID')}</span>
    <button type="button" class="secondary-button small-button" data-page-dir="1" ${to >= total ? 'disabled' : ''}>Berikutnya &rsaquo;</button>`;
}

function populateYearFilter() {
  const wrap = ui.yearFilter.closest('.filter-pill');
  wrap.hidden = !app.server;
  if (!app.server) return;
  const previous = ui.yearFilter.value;
  ui.yearFilter.innerHTML = ['<option value="">Semua tahun</option>']
    .concat(app.years.map((year) => `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`)).join('');
  ui.yearFilter.value = app.years.includes(previous) || previous === '' && ui.yearFilter.dataset.ready
    ? previous
    : app.years[0] || '';
  ui.yearFilter.dataset.ready = '1';
}

let studentFetchSeq = 0;

async function fetchStudentPage() {
  if (!app.user) return;
  const seq = ++studentFetchSeq;
  ui.studentTableBody.innerHTML = skeletonRows(7);
  let query = app.supabase.from('spp_app_student_overview').select('*', { count: 'exact' });
  const year = currentYearScope();
  const school = currentSchoolScope();
  const keyword = cleanKeyword(ui.searchStudent.value);
  if (year) query = query.eq('tahun_ajaran', year);
  if (school) query = query.eq('kdsek', school);
  if (keyword) query = query.or(`nama.ilike.%${keyword}%,nospp.ilike.${keyword}%,kdkls.ilike.${keyword}%,id_siswa.eq.${keyword}`);
  const from = app.paging.students * PAGE_SIZE;
  const { data, count, error } = await query
    .order('nama').order('id_siswa').order('tahun_ajaran', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (seq !== studentFetchSeq) return;
  if (error) {
    ui.studentTableBody.innerHTML = `<tr class="empty-row"><td colspan="7" class="empty-state">Data gagal dimuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  app.state.siswa = (data || []).map(normalizeOverviewRow);
  app.state.siswa.forEach((row) => app.pickerCache.set(row.id, row));
  app.totals.students = count || 0;
  drawStudentTable();
}

const refreshStudentsSoon = debounce(() => fetchStudentPage(), 300);

function getFilteredStudents() {
  if (app.server) return app.state.siswa;
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
  if (app.server) return fetchStudentPage();
  return drawStudentTable();
}

function drawStudentTable() {
  const rows = getFilteredStudents();
  if (app.server) {
    const from = rows.length ? app.paging.students * PAGE_SIZE + 1 : 0;
    ui.studentCount.textContent = `${from}\u2013${from ? from + rows.length - 1 : 0} dari ${app.totals.students.toLocaleString('id-ID')} siswa`;
    renderPager('students', app.totals.students);
  } else {
    ui.studentCount.textContent = `${rows.length} dari ${app.state.siswa.length} siswa`;
  }
  if (!rows.length) {
    ui.studentTableBody.innerHTML = '<tr class="empty-row"><td colspan="7" class="empty-state">Tidak ada data siswa yang cocok.</td></tr>';
    updateSelectionUi(rows);
    return;
  }

  const admin = canManageSettings();
  ui.studentTableBody.innerHTML = rows.map((row) => {
    const arrearsTotal = app.server
      ? row.arrearsTotal
      : (app.state.arrears || [])
        .filter((item) => item.idSiswa === String(row.id))
        .reduce((sum, item) => sum + item.nominal, 0);
    const totalTagihan = Number(row.spp || 0) + Number(row.komp || 0) + arrearsTotal;
    const totalBayar = app.server
      ? row.paidTotal
      : app.state.transaksi
        .filter((tx) => tx.nospp === row.nospp)
        .reduce((sum, tx) => sum + Number(tx.nominal || 0), 0);
    const status = totalBayar >= totalTagihan ? 'Lunas' : 'Belum';
    const virtualAccounts = getStudentVirtualAccounts(row);
    const virtualAccountMarkup = virtualAccounts.length
      ? `<div class="student-va-list">${virtualAccounts.map((item) => `
        <div><span>${escapeHtml(item.bankName)}</span><strong>${escapeHtml(item.number)}</strong></div>
      `).join('')}</div>`
      : '<span class="empty-state">Belum diatur</span>';
    const selectable = /^\d+$/.test(row.id);
    const selected = app.selectedStudents.has(row.id);

    return `
      <tr class="${selected ? 'is-selected' : ''}">
        <td class="admin-only col-check" ${admin ? '' : 'hidden'}>${selectable ? `<input type="checkbox" data-select-id="${escapeHtml(row.id)}" ${selected ? 'checked' : ''} aria-label="Pilih ${escapeHtml(row.nama)}" />` : ''}</td>
        <td data-label="Siswa"><div class="student-name">${escapeHtml(row.nama)}</div><div class="student-sub">${escapeHtml(row.nospp)}${row.tahunAjaran ? ` &middot; ${escapeHtml(row.tahunAjaran)}` : ''}${row.isStaffChild ? ' &middot; <span class="badge-staff">Anak guru</span>' : ''}</div></td>
        <td data-label="Sekolah / Kelas"><div>${escapeHtml(getSchoolName(row.kdsek))}</div><div class="student-sub">Kelas ${escapeHtml(row.kdkls)}</div></td>
        <td data-label="Virtual Account">${virtualAccountMarkup}</td>
        <td data-label="Tagihan">${row.isStaffChild && row.showInBilling === false ? 'Tidak ditagih' : formatRupiah(totalTagihan)}${arrearsTotal ? `<div class="student-sub">termasuk tunggakan ${formatRupiah(arrearsTotal)}</div>` : ''}</td>
        <td data-label="Status"><span class="status-pill ${status === 'Lunas' ? 'lunas' : 'belum'}">${status}</span></td>
        <td data-label="Aksi" class="row-actions">
          ${admin && row.tahunAjaran ? `
            <button class="action-btn edit" data-action="edit-student" data-nospp="${escapeHtml(row.nospp)}">Ubah SPP</button>
          ` : ''}
          ${admin && selectable ? `<button class="action-btn edit" data-action="arrear-student" data-id="${escapeHtml(row.id)}">Tunggakan</button>` : ''}
          ${admin ? '' : '-'}
        </td>
      </tr>
    `;
  }).join('');
  updateSelectionUi(rows);
}

function updateSelectionUi(rows) {
  const ids = rows.map((row) => row.id).filter((id) => /^\d+$/.test(id));
  const count = app.selectedStudents.size;
  ui.selectedCount.textContent = String(count);
  ui.selectAllStudents.checked = ids.length > 0 && ids.every((id) => app.selectedStudents.has(id));
  ui.selectionBar.classList.toggle('has-selection', count > 0);
  const byId = new Map(app.state.siswa.map((item) => [String(item.id), item]));
  ui.selectedChips.innerHTML = [...app.selectedStudents].map((id) => {
    const student = byId.get(id);
    const label = student ? `${student.nama} (${student.kdkls})` : app.selectedNames.get(id) || id;
    return `<span class="chip">${escapeHtml(label)}<button type="button" data-unselect-id="${escapeHtml(id)}" aria-label="Hapus dari pilihan">&times;</button></span>`;
  }).join('');
}

function getSelectedStudentIds() {
  return [...app.selectedStudents];
}

function titleCase(value) {
  return value.toLowerCase().replace(/(^|[\s.'-])(\p{L})/gu, (_, sep, letter) => sep + letter.toUpperCase());
}

function applyNameCase(input) {
  const { selectionStart, selectionEnd } = input;
  const next = titleCase(input.value);
  if (next !== input.value) {
    input.value = next;
    input.setSelectionRange(selectionStart, selectionEnd);
  }
}

async function fetchArrears() {
  if (!app.user) return;
  const { data, error } = await app.supabase.from('spp_app_arrears_list').select('*').order('id', { ascending: false }).limit(100);
  app.state.arrears = error ? [] : (data || []).map((row) => ({
    id: row.id,
    idSiswa: String(row.id_siswa),
    nama: row.nama || '',
    tahunAjaran: row.tahun_ajaran,
    jenis: row.jenis,
    keterangan: row.keterangan || '',
    nominal: Number(row.nominal || 0)
  }));
  drawArrears();
}

function renderArrears() {
  if (app.server) return fetchArrears();
  return drawArrears();
}

function drawArrears() {
  const students = new Map(app.state.siswa.map((item) => [String(item.id), item]));
  const rows = app.state.arrears || [];
  ui.arrearsBody.innerHTML = rows.length
    ? rows.map((item) => {
      const student = students.get(item.idSiswa);
      return `
        <tr>
          <td>${escapeHtml(item.nama || (student ? student.nama : item.idSiswa))} (${escapeHtml(item.idSiswa)})</td>
          <td>${escapeHtml(item.tahunAjaran)}</td>
          <td>${escapeHtml(item.jenis)}</td>
          <td>${escapeHtml(item.keterangan)}</td>
          <td>${formatRupiah(item.nominal)}</td>
          <td><button type="button" class="action-btn delete" data-arrear-delete="${item.id}">Hapus</button></td>
        </tr>`;
    }).join('')
    : '<tr><td colspan="6" class="empty-state">Belum ada tagihan tahun lalu.</td></tr>';
}

async function addArrear() {
  const idSiswa = ui.arrearStudent.value;
  const nominal = parseMoney(ui.arrearNominal.value);
  const tahun = ui.arrearTahun.value.trim();
  if (!idSiswa || !/^\d{4}-\d{4}$/.test(tahun) || nominal <= 0) {
    alert('Pilih siswa, isi tahun ajaran (contoh 2025-2026) dan nominal lebih dari 0.');
    return;
  }
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('add_student_arrear_v1', {
      ...credentials,
      p_id_siswa: idSiswa,
      p_tahun_ajaran: tahun,
      p_jenis: ui.arrearJenis.value,
      p_nominal: nominal,
      p_keterangan: ui.arrearKet.value.trim()
    });
    if (error) throw error;
    ui.arrearNominal.value = formatRupiah(0);
    ui.arrearKet.value = '';
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'Tagihan tahun lalu gagal disimpan. Pastikan migration 011 sudah dijalankan.');
  }
}

async function deleteArrear(id) {
  if (!window.confirm('Hapus tagihan tahun lalu ini?')) return;
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('delete_student_arrear_v1', { ...credentials, p_id: Number(id) });
    if (error) throw error;
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'Tagihan gagal dihapus.');
  }
}

let paymentFetchSeq = 0;

async function fetchPaymentPage() {
  if (!app.user) return;
  const seq = ++paymentFetchSeq;
  ui.paymentList.innerHTML = skeletonRows(6);
  let query = app.supabase.from('spp_app_payment_list').select('*', { count: 'exact' });
  const school = currentSchoolScope();
  const keyword = cleanKeyword(ui.paymentSearch.value);
  if (school) query = query.eq('kdsek', school);
  if (keyword) query = query.or(`nospp.ilike.${keyword}%,nama.ilike.%${keyword}%`);
  const from = app.paging.payments * PAGE_SIZE;
  const { data, count, error } = await query
    .order('tglbyr', { ascending: false }).order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (seq !== paymentFetchSeq) return;
  if (error) {
    ui.paymentList.innerHTML = `<tr><td colspan="6" class="empty-state">Data gagal dimuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  app.state.transaksi = (data || []).map(normalizeSupabaseTransaction);
  app.totals.payments = count || 0;
  drawPaymentList();
}

const refreshPaymentsSoon = debounce(() => fetchPaymentPage(), 300);

function renderPaymentList() {
  if (app.server) return fetchPaymentPage();
  return drawPaymentList();
}

function drawPaymentList() {
  const rows = app.server
    ? app.state.transaksi
    : [...getAccessibleTransactionRows()].sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr));
  if (app.server) renderPager('payments', app.totals.payments);

  if (!rows.length) {
    ui.paymentList.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada riwayat pembayaran.</td></tr>';
    return;
  }

  ui.paymentList.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.nospp)}</td>
      <td>${escapeHtml(row.nama || '-')}</td>
      <td>${escapeHtml(row.periode || '-')}</td>
      <td>${escapeHtml(row.tglbyr)}</td>
      <td>${formatRupiah(row.nominal)}</td>
      <td>
        <button class="action-btn delete" data-action="delete-payment" data-id="${escapeHtml(row.id)}">Hapus</button>
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

async function fetchDashboard() {
  if (!app.user) return;
  const { data, error } = await app.supabase.rpc('spp_app_dashboard_v1', {
    p_tahun: currentYearScope(),
    p_kdsek: currentSchoolScope()
  });
  if (error || !data) return;
  ui.totalSiswa.textContent = Number(data.siswa || 0).toLocaleString('id-ID');
  ui.totalTagihan.textContent = formatRupiah(Number(data.tagihan || 0));
  ui.paymentThisMonth.textContent = formatRupiah(Number(data.bulan_ini || 0));
  ui.totalTransaksi.textContent = Number(data.transaksi || 0).toLocaleString('id-ID');
  ui.activityList.innerHTML = (data.terbaru || []).map((item) => `
      <li>
        <div>
          <strong>${escapeHtml(item.nospp)}</strong>
          <small>${escapeHtml(item.nama || 'Siswa')} &bull; ${escapeHtml(item.tglbyr)}</small>
        </div>
        <strong>${formatRupiah(Number(item.nominal))}</strong>
      </li>`).join('');
}

function renderDashboard() {
  if (app.server) return fetchDashboard();
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

function drawReportSummary(summary, totalStudents, totalTagihan, totalTerbayar) {
  const totalBelum = Math.max(totalTagihan - totalTerbayar, 0);

  const now = new Date();
  const period = app.server && currentYearScope()
    ? currentYearScope()
    : `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  ui.reportPeriod.textContent = period;
  ui.reportSummaryStudents.textContent = totalStudents.toLocaleString('id-ID');
  ui.reportSummaryStudentsMeta.textContent = `${summary.reduce((sum, row) => sum + row.jumlah, 0).toLocaleString('id-ID')} siswa aktif`;
  ui.reportSummaryTagihan.textContent = formatRupiah(totalTagihan);
  ui.reportSummaryTerbayar.textContent = formatRupiah(totalTerbayar);
  ui.reportSummaryBelum.textContent = formatRupiah(totalBelum);

  ui.reportList.innerHTML = summary.map((row) => `
    <div class="report-item">
      <div class="report-item-meta">
        <span class="report-badge">${row.jumlah} siswa</span>
        <strong>${escapeHtml(row.school)}</strong>
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
      <td>${escapeHtml(row.school)}</td>
      <td>${row.jumlah}</td>
      <td>${formatRupiah(row.totalTagihan)}</td>
      <td>${formatRupiah(row.totalTerbayar)}</td>
      <td>${formatRupiah(row.belum)}</td>
    </tr>
  `).join('');
}

function detailRowMarkup(row, totalTagihan, totalTerbayar, lastPaid) {
  const sisa = Math.max(totalTagihan - totalTerbayar, 0);
  const status = totalTerbayar >= totalTagihan ? 'Lunas' : 'Belum';
  return `
      <tr>
        <td>${escapeHtml(row.nospp)}</td>
        <td>${escapeHtml(row.nama)}</td>
        <td>${escapeHtml(getSchoolName(row.kdsek))}</td>
        <td>${escapeHtml(row.kdkls)}</td>
        <td>${formatRupiah(totalTagihan)}</td>
        <td>${formatRupiah(totalTerbayar)}</td>
        <td>${formatRupiah(sisa)}</td>
        <td><span class="status-pill ${status === 'Lunas' ? 'lunas' : 'belum'}">${status}</span></td>
        <td>${lastPaid || '-'}</td>
      </tr>
    `;
}

let reportFetchSeq = 0;
let detailFetchSeq = 0;

async function fetchDetailPage() {
  if (!app.user) return;
  const seq = ++detailFetchSeq;
  ui.detailReportTable.innerHTML = skeletonRows(9);
  let query = app.supabase.from('spp_app_student_overview').select('*', { count: 'exact' });
  const year = currentYearScope();
  const school = currentSchoolScope();
  if (year) query = query.eq('tahun_ajaran', year);
  if (school) query = query.eq('kdsek', school);
  const from = app.paging.detail * PAGE_SIZE;
  const { data, count, error } = await query
    .order('nama').order('id_siswa').order('tahun_ajaran', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (seq !== detailFetchSeq) return;
  if (error) {
    ui.detailReportTable.innerHTML = `<tr><td colspan="9" class="empty-state">Data gagal dimuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  app.totals.detail = count || 0;
  renderPager('detail', app.totals.detail);
  ui.detailReportTable.innerHTML = (data || []).map(normalizeOverviewRow)
    .map((row) => detailRowMarkup(row, rowBilled(row), row.paidTotal, row.lastPaid)).join('')
    || '<tr><td colspan="9" class="empty-state">Belum ada data.</td></tr>';
}

async function fetchReport() {
  if (!app.user) return;
  const seq = ++reportFetchSeq;
  const { data, error } = await app.supabase.rpc('spp_app_report_v1', {
    p_tahun: currentYearScope(),
    p_kdsek: currentSchoolScope()
  });
  if (seq !== reportFetchSeq || error) return;
  const byCode = new Map((data || []).map((row) => [row.kdsek, row]));
  const schools = canAccessAllReports() ? app.state.schools : app.state.schools.filter((school) => getAllowedSchoolCodes().includes(school.kdsek));
  const summary = schools.map((school) => {
    const row = byCode.get(school.kdsek) || {};
    const totalTagihan = Number(row.tagihan || 0);
    const totalTerbayar = Number(row.terbayar || 0);
    return {
      school: school.nmsek,
      jumlah: Number(row.jumlah || 0),
      totalTagihan,
      totalTerbayar,
      belum: Math.max(totalTagihan - totalTerbayar, 0)
    };
  });
  drawReportSummary(
    summary,
    summary.reduce((sum, row) => sum + row.jumlah, 0),
    summary.reduce((sum, row) => sum + row.totalTagihan, 0),
    summary.reduce((sum, row) => sum + row.totalTerbayar, 0)
  );
}

function renderReport() {
  if (app.server) {
    fetchReport();
    return fetchDetailPage();
  }
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
  drawReportSummary(
    summary,
    siswa.length,
    siswa.reduce((sum, item) => sum + Number(item.spp || 0) + Number(item.komp || 0), 0),
    getAccessibleTransactionRows().reduce((sum, item) => sum + Number(item.nominal || 0), 0)
  );

  ui.detailReportTable.innerHTML = getAccessibleStudentRows().map((row) => {
    const totalTagihan = Number(row.spp || 0) + Number(row.komp || 0);
    const payments = getAccessibleTransactionRows().filter((item) => item.nospp === row.nospp);
    const totalTerbayar = payments.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const terakhirBayar = [...payments].sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr))[0];
    return detailRowMarkup(row, totalTagihan, totalTerbayar, terakhirBayar ? terakhirBayar.tglbyr : '');
  }).join('');
}

function currentAcademicYear() {
  const now = new Date();
  const start = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${start}-${start + 1}`;
}

function toPeriode(monthValue) {
  const match = /^(\d{4})-(\d{2})$/.exec(monthValue || '');
  return match ? `${match[2]}${match[1]}` : '';
}

function updateStudentFormMode() {
  const isNew = ui.studentType.value === 'baru';
  document.querySelectorAll('[data-for="baru"]').forEach((item) => { item.hidden = !isNew; });
  document.querySelectorAll('[data-for="naik"]').forEach((item) => { item.hidden = isNew; });
  ui.studentNama.required = isNew;
  ui.studentWa.required = isNew;
  ui.studentPeriode.required = isNew;
  ui.studentExisting.required = !isNew;
  ui.studentNama.placeholder = isNew ? 'Nama lengkap' : 'Kosongkan jika tidak berubah';
}

function populateExistingStudents() {
  if (!ui.arrearTahun.value) {
    const [start] = currentAcademicYear().split('-').map(Number);
    ui.arrearTahun.value = `${start - 1}-${start}`;
  }
}

function studentPickerLabel(item) {
  return `${item.nama} - ${item.kdkls} (${item.id})`;
}

function setPickerValue(hiddenId, id) {
  const hidden = document.getElementById(hiddenId);
  const wrap = hidden.closest('.picker');
  const input = wrap.querySelector('.picker-input');
  const student = id
    ? app.pickerCache.get(String(id)) || app.state.siswa.find((item) => String(item.id) === String(id))
    : null;
  hidden.value = student ? String(student.id) : '';
  input.value = student ? studentPickerLabel(student) : '';
  wrap.querySelector('.picker-results').hidden = true;
}

let pickerSeq = 0;

async function renderPickerResults(wrap) {
  const input = wrap.querySelector('.picker-input');
  const results = wrap.querySelector('.picker-results');
  const keyword = input.value.trim().toLowerCase();
  let matches;
  if (app.server) {
    const seq = ++pickerSeq;
    const { data } = await app.supabase.rpc('spp_app_search_students_v1', { p_q: cleanKeyword(keyword), p_limit: 8 });
    if (seq !== pickerSeq) return;
    matches = (data || []).map((row) => ({
      id: String(row.id_siswa), nama: row.nama, kdsek: row.kdsek, kdkls: row.kdkls, nospp: row.nospp
    }));
    matches.forEach((item) => app.pickerCache.set(item.id, item));
  } else {
    matches = app.state.siswa
      .filter((item) => /^\d+$/.test(item.id))
      .filter((item) => !keyword || `${item.nama} ${item.id} ${item.kdkls} ${item.nospp}`.toLowerCase().includes(keyword))
      .slice(0, 8);
  }
  results.innerHTML = matches.length
    ? matches.map((item) => `
      <button type="button" class="picker-option" data-pick-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.nama)}</strong>
        <span>${escapeHtml(getSchoolName(item.kdsek))} &middot; ${escapeHtml(item.kdkls)} &middot; ID ${escapeHtml(item.id)}</span>
      </button>`).join('')
    : '<div class="picker-empty">Siswa tidak ditemukan</div>';
  results.hidden = false;
}

function setupStudentPickers() {
  document.querySelectorAll('.picker').forEach((wrap) => {
    const input = wrap.querySelector('.picker-input');
    const hidden = wrap.querySelector('input[type="hidden"]');
    const results = wrap.querySelector('.picker-results');
    const renderSoon = debounce(() => renderPickerResults(wrap), 200);
    input.addEventListener('input', () => {
      hidden.value = '';
      renderSoon();
    });
    input.addEventListener('focus', () => renderPickerResults(wrap));
    results.addEventListener('mousedown', (event) => {
      const option = event.target.closest('[data-pick-id]');
      if (!option) return;
      event.preventDefault();
      setPickerValue(hidden.id, option.dataset.pickId);
    });
    input.addEventListener('blur', () => { results.hidden = true; });
  });
}

function resetStudentForm() {
  ui.studentForm.reset();
  setPickerValue('studentExisting', '');
  ui.studentType.value = 'baru';
  ui.studentTahun.value = currentAcademicYear();
  ['studentDpp', 'studentDsp', 'studentSeragam', 'studentGiat', 'studentSpp', 'studentKomp'].forEach((key) => {
    ui[key].value = formatRupiah(0);
  });
  populateExistingStudents();
  populateStudentClassSelect();
  updateStudentFormMode();
  ui.studentSubmitBtn.textContent = 'Simpan Siswa';
}

function buildStudentRow(source) {
  return {
    jenis: source.jenis,
    tahun_ajaran: source.tahun_ajaran,
    id_siswa: source.id_siswa || '',
    nama: titleCase(String(source.nama || '').trim()),
    no_wa: source.no_wa || '',
    kdsek: source.kdsek,
    kdkls: source.kdkls,
    periode_masuk: source.periode_masuk || '',
    dpp: source.dpp || 0,
    dsp: source.dsp || 0,
    seragam: source.seragam || 0,
    giat: source.giat || 0,
    spp: source.spp || 0,
    komp: source.komp || 0
  };
}

function requireStudentRules() {
  if (!canManageSettings()) {
    throw new Error('Hanya Admin yang dapat mengubah data siswa.');
  }
  if (!app.useSupabase || !app.studentRulesReady) {
    throw new Error('Aturan data siswa memerlukan Supabase dan migration 010_student_rules.sql.');
  }
  if (!app.adminCredentials) {
    throw new Error('Silakan keluar lalu masuk kembali sebagai Admin untuk menyimpan perubahan.');
  }
  return { p_username: app.adminCredentials.username, p_password: app.adminCredentials.password };
}

async function reloadStudentData() {
  if (app.server) {
    const { data } = await app.supabase.rpc('spp_app_years_v1');
    app.years = data || app.years;
    populateYearFilter();
    populateExistingStudents();
    await Promise.all([renderStudentTable(), renderArrears(), renderDashboard(), renderReport(), renderPaymentList()]);
    return;
  }
  const data = await loadSupabaseData();
  if (data) app.state = { ...app.state, siswa: data.siswa, transaksi: data.transaksi, arrears: data.arrears };
  populateExistingStudents();
  renderStudentTable();
  renderArrears();
  renderDashboard();
  renderReport();
}

async function addOrUpdateStudent(event) {
  event.preventDefault();
  if (ui.studentType.value === 'naik' && !ui.studentExisting.value) {
    alert('Pilih siswa dari daftar pencarian terlebih dahulu.');
    return;
  }
  try {
    const credentials = requireStudentRules();
    const row = buildStudentRow({
      jenis: ui.studentType.value,
      tahun_ajaran: ui.studentTahun.value.trim(),
      id_siswa: ui.studentExisting.value,
      nama: ui.studentNama.value.trim(),
      no_wa: ui.studentWa.value.trim(),
      kdsek: ui.studentSekolah.value,
      kdkls: ui.studentKelas.value.trim(),
      periode_masuk: toPeriode(ui.studentPeriode.value),
      dpp: parseMoney(ui.studentDpp.value),
      dsp: parseMoney(ui.studentDsp.value),
      seragam: parseMoney(ui.studentSeragam.value),
      giat: parseMoney(ui.studentGiat.value),
      spp: parseMoney(ui.studentSpp.value),
      komp: parseMoney(ui.studentKomp.value)
    });
    const { data, error } = await app.supabase.rpc('save_student_v1', { ...credentials, p_row: row });
    if (error) throw error;
    await reloadStudentData();
    resetStudentForm();
    alert(`Tersimpan. No. SPP: ${data.nospp} (ID siswa ${data.id_siswa}).`);
  } catch (error) {
    alert(error.message || 'Data siswa tidak dapat disimpan.');
  }
}

async function changeStudentSpp(nospp) {
  const row = app.state.siswa.find((item) => item.nospp === nospp);
  if (!row || !row.tahunAjaran) {
    alert('Perubahan SPP hanya untuk siswa yang terdaftar lewat aturan baru.');
    return;
  }
  const spp = window.prompt(`SPP baru untuk ${row.nama} (sekarang ${row.spp}):`, row.spp);
  if (spp === null) return;
  const periode = window.prompt('Berlaku mulai periode (MMYYYY, contoh 012027). Bulan sebelumnya tidak berubah:', '');
  if (periode === null) return;
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('update_student_spp_v1', {
      ...credentials,
      p_id_siswa: row.id,
      p_tahun_ajaran: row.tahunAjaran,
      p_effective_period: periode.trim(),
      p_spp: Number(spp),
      p_komp: row.komp
    });
    if (error) throw error;
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'SPP tidak dapat diubah.');
  }
}

async function applyBulkActivity() {
  const giat = parseMoney(ui.bulkGiat.value);
  const ids = getSelectedStudentIds();
  const tahun = ui.studentTahun.value.trim();
  if (!ids.length) {
    alert('Centang siswa di tabel terlebih dahulu.');
    return;
  }
  if (ui.bulkGiat.value === '' || !(giat >= 0)) {
    alert('Isi nominal kegiatan.');
    return;
  }
  if (!window.confirm(`Set kegiatan ${formatRupiah(giat)} untuk ${ids.length} siswa terpilih (tahun ajaran ${tahun})?`)) return;
  try {
    const credentials = requireStudentRules();
    const { data, error } = await app.supabase.rpc('bulk_set_activity_fee_ids_v1', {
      ...credentials, p_tahun_ajaran: tahun, p_ids: ids, p_giat: giat
    });
    if (error) throw error;
    await reloadStudentData();
    alert(`${data} siswa diperbarui.`);
  } catch (error) {
    alert(error.message || 'Kegiatan gagal diterapkan. Pastikan migration 011 sudah dijalankan.');
  }
}

async function applyBulkStaff() {
  const ids = getSelectedStudentIds();
  if (!ids.length) {
    alert('Centang siswa di tabel terlebih dahulu.');
    return;
  }
  const mode = ui.bulkStaffMode.value;
  if (!window.confirm(`Terapkan ke ${ids.length} siswa terpilih?`)) return;
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('bulk_set_staff_child_v1', {
      ...credentials,
      p_ids: ids,
      p_is_staff_child: mode !== 'regular',
      p_show_in_billing: mode !== 'staff-hide'
    });
    if (error) throw error;
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'Status anak guru gagal diubah.');
  }
}

const IMPORT_COLUMNS = ['jenis', 'tahun_ajaran', 'id_siswa', 'nama', 'no_wa', 'kdsek', 'kdkls', 'periode_masuk', 'dpp', 'dsp', 'seragam', 'giat', 'spp', 'komp'];

const BACKUP_TABLES = ['mastsek', 'mastank', 'mastspp', 'pembayaran', 'spp_app_bank_settings', 'spp_app_school_settings',
  'spp_app_school_classes', 'spp_app_va_settings', 'spp_app_students', 'spp_app_enrollments', 'spp_app_arrears', 'spp_app_payments'];

async function backupData() {
  if (!app.supabase) {
    alert('Backup hanya tersedia saat terhubung ke Supabase.');
    return;
  }
  const button = document.getElementById('backupBtn');
  button.disabled = true;
  try {
    const tables = {};
    const skipped = [];
    for (const name of BACKUP_TABLES) {
      const rows = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await app.supabase.from(name).select('*').range(from, from + 999);
        if (error) {
          skipped.push(name);
          break;
        }
        rows.push(...data);
        if (data.length < 1000) break;
      }
      if (!skipped.includes(name)) tables[name] = rows;
    }
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const blob = new Blob([JSON.stringify({ createdAt: new Date().toISOString(), tables }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `backup-spp-${stamp}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    alert(skipped.length ? `Backup tersimpan. Tabel dilewati: ${skipped.join(', ')}` : 'Backup tersimpan di folder Download.');
  } finally {
    button.disabled = false;
  }
}

function downloadImportTemplate() {
  const year = currentAcademicYear();
  const lines = [
    IMPORT_COLUMNS.join(','),
    `baru,${year},,Contoh Siswa Baru,08123456789,M,1A,082026,1000000,500000,300000,100000,400000,50000`,
    `naik,${year},12,,,M,2A,,,,,100000,450000,50000`
  ];
  const blob = new Blob([`\uFEFF${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'template_data_siswa.csv';
  link.click();
  URL.revokeObjectURL(link.href);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const source = text.replace(/^\uFEFF/, '');
  const delimiter = (source.split(/\r?\n/)[0] || '').includes(';') ? ';' : ',';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ''; }
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); cell = '';
      if (row.some((value) => value.trim() !== '')) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((value) => value.trim() !== '')) rows.push(row);
  return rows;
}

async function importStudentsFile(file) {
  try {
    const credentials = requireStudentRules();
    const table = parseCsv(await file.text());
    const header = (table.shift() || []).map((item) => item.trim().toLowerCase());
    if (!IMPORT_COLUMNS.every((column) => header.includes(column))) {
      throw new Error(`Kolom template tidak sesuai. Gunakan: ${IMPORT_COLUMNS.join(', ')}`);
    }
    const rows = table.map((cells) => {
      const record = {};
      header.forEach((column, index) => { record[column] = (cells[index] || '').trim(); });
      return buildStudentRow(record);
    });
    if (!rows.length) throw new Error('File tidak berisi data.');
    if (!window.confirm(`Import ${rows.length} baris? Jika ada satu baris salah, semuanya dibatalkan.`)) return;
    const { error } = await app.supabase.rpc('import_students_v1', { ...credentials, p_rows: rows });
    if (error) throw error;
    await reloadStudentData();
    alert(`${rows.length} baris berhasil diimport.`);
  } catch (error) {
    alert(error.message || 'Import gagal.');
  } finally {
    ui.importFile.value = '';
  }
}

async function showStudentLog() {
  try {
    const credentials = requireStudentRules();
    const { data, error } = await app.supabase.rpc('get_student_log_v1', { ...credentials, p_limit: 200 });
    if (error) throw error;
    ui.studentLogWrap.hidden = false;
    ui.studentLogBody.innerHTML = (data || []).map((item) => `
      <tr>
        <td>${escapeHtml(new Date(item.logged_at).toLocaleString('id-ID'))}</td>
        <td>${escapeHtml(item.actor)}</td>
        <td>${escapeHtml(item.action)}</td>
        <td>${escapeHtml(item.id_siswa || '-')}</td>
        <td>${escapeHtml(JSON.stringify(item.detail))}</td>
      </tr>`).join('') || '<tr><td colspan="5" class="empty-state">Belum ada log.</td></tr>';
  } catch (error) {
    alert(error.message || 'Log tidak dapat dimuat.');
  }
}

async function deletePayment(id) {
  const confirmed = window.confirm('Hapus riwayat pembayarannya?');
  if (!confirmed) return;

  if (app.server) {
    try {
      const credentials = requireStudentRules();
      const { error } = await app.supabase.rpc('delete_payment_v1', { ...credentials, p_id: Number(id) });
      if (error) throw error;
      await reloadStudentData();
    } catch (error) {
      alert(error.message || 'Pembayaran gagal dihapus.');
    }
    return;
  }

  app.state.transaksi = app.state.transaksi.filter((item) => item.id !== id);
  saveLocalData();
  renderPaymentList();
  renderDashboard();
  renderReport();
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!canAccessPayment()) {
    alert('Hanya Admin KKMS yang dapat melakukan pembayaran.');
    return;
  }

  const form = event.currentTarget;
  const formData = new FormData(form);
  const nospp = String(formData.get('nospp') || '').trim();
  const nama = String(formData.get('nama') || '').trim();
  const periode = String(formData.get('periode') || '').trim();
  const nominal = parseMoney(formData.get('nominal'));

  if (!nospp || nominal <= 0) {
    alert('Nomor SPP dan nominal pembayaran harus diisi.');
    return;
  }

  if (app.server) {
    try {
      const credentials = requireStudentRules();
      const { error } = await app.supabase.rpc('add_payment_v1', {
        ...credentials,
        p_nospp: nospp,
        p_periode: periode || new Date().toISOString().slice(0, 7).replace('-', '').replace(/^(\d{4})(\d{2})$/, '$2$1'),
        p_nominal: nominal
      });
      if (error) throw error;
      form.reset();
      formatAllMoneyInputs();
      app.paging.payments = 0;
      await reloadStudentData();
      alert('Pembayaran berhasil disimpan.');
    } catch (error) {
      alert(error.message || 'Pembayaran gagal disimpan. Pastikan migration 012 sudah dijalankan.');
    }
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
    app.adminCredentials = mappedUser.role === 'superadmin'
      ? { username: username.trim(), password }
      : null;
    ui.userName.textContent = mappedUser.jabatan || mappedUser.idpemakai;
    ui.sidebar.hidden = false;
    applyUserAccess();
    ui.loginScreen.classList.add('hidden');
    return true;
  }

  const localUser = app.state.users.find((item) => matchLoginUser(item, username, true) && item.password === password);
  if (localUser) {
    app.user = localUser;
    app.adminCredentials = null;
    ui.userName.textContent = localUser.jabatan || localUser.idpemakai;
    ui.sidebar.hidden = false;
    applyUserAccess();
    ui.loginScreen.classList.add('hidden');
    return true;
  }

  return false;
}

function createVAConfigId() {
  return `va-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateInternalSchoolCode(schools) {
  const existingCodes = new Set(schools.map((school) => school.kdsek));
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (const first of characters) {
    for (const second of characters) {
      const code = `${first}${second}`;
      if (!existingCodes.has(code)) return code;
    }
  }
  throw new Error('Batas kode internal sekolah sudah tercapai.');
}

function isSchoolUsed(schoolCode) {
  if (app.server) return app.usedSchools.has(schoolCode);
  return app.state.siswa.some((student) => student.kdsek === schoolCode)
    || app.state.transaksi.some((transaction) => transaction.kdsek === schoolCode);
}

function validateVABanks(vaSettings) {
  if (vaSettings.length > 100) return 'Jumlah konfigurasi bank VA maksimal 100.';
  if (vaSettings.some((item) => !item.id || !item.bankName || item.bankName.length > 100 || !/^\d{5,50}$/.test(item.vaPrefix))) {
    return 'Setiap bank wajib memiliki nama dan prefix VA angka minimal 5 digit (maksimal 50).';
  }

  const activeBanks = vaSettings.filter((item) => item.active);
  if (activeBanks.length > 2) return 'Maksimal dua bank VA boleh aktif.';
  if (new Set(activeBanks.map((item) => item.vaPrefix)).size !== activeBanks.length) {
    return 'Prefix VA untuk setiap bank aktif harus berbeda.';
  }
  if (new Set(vaSettings.map((item) => item.id)).size !== vaSettings.length) {
    return 'ID konfigurasi bank VA tidak boleh berulang.';
  }
  return '';
}

async function saveCatalogSettings(schools, classes, vaSettings) {
  if (!canManageSettings()) {
    throw new Error('Hanya Admin yang dapat mengubah pengaturan sekolah dan bank.');
  }

  if (app.useSupabase) {
    if (!app.settingsReady) {
      throw new Error(getSettingsUnavailableMessage());
    }
    if (!app.adminCredentials) {
      throw new Error('Silakan keluar lalu masuk kembali sebagai Admin untuk menyimpan perubahan.');
    }

    const activeBank = vaSettings.find((item) => item.active);
    const { error } = await app.supabase.rpc('save_spp_catalog_settings_v3', {
      p_username: app.adminCredentials.username,
      p_password: app.adminCredentials.password,
      p_bank_name: activeBank ? activeBank.bankName : app.state.bankName || DEFAULT_DB.bankName,
      p_school_catalog: schools.map((school) => ({
        kdsek: school.kdsek,
        nmsek: school.nmsek,
        va_school_code: school.vaCode || null,
        is_active: school.active,
        is_custom: school.isCustom
      })),
      p_school_classes: classes.map((item) => ({
        school_code: item.kdsek,
        class_name: item.kdkls,
        is_active: item.active
      })),
      p_va_settings: vaSettings.map((item) => ({
        config_id: item.id,
        bank_name: item.bankName,
        va_prefix: item.vaPrefix,
        is_active: item.active
      }))
    });
    if (error) throw error;
  }

  const activeBank = vaSettings.find((item) => item.active);
  app.state.bankName = activeBank ? activeBank.bankName : app.state.bankName || DEFAULT_DB.bankName;
  app.state.vaSettings = clone(vaSettings);
  app.state.schools = schools.map(normalizeLocalSchool);
  app.state.classes = normalizeSchoolClasses(classes);
  saveLocalData();
  renderAll();
}

async function handleSchoolSettingsSubmit(event) {
  event.preventDefault();
  const schools = getSchoolSettingsDraft();
  const classes = getSchoolClassesDraft();
  const invalidSchool = schools.find((school) => (
    !school.kdsek || !school.nmsek || school.nmsek.length > 100
    || (school.active && !/^\d{2}$/.test(school.vaCode))
    || (school.vaCode && !/^\d{2}$/.test(school.vaCode))
  ));
  const schoolCodes = new Set(schools.map((school) => school.kdsek));
  const vaSchoolCodes = schools.map((school) => school.vaCode).filter(Boolean);
  const classKeys = new Set();
  const invalidClass = classes.find((item) => {
    const key = `${item.kdsek.toLowerCase()}\u0000${item.kdkls.toLowerCase()}`;
    if (!schoolCodes.has(item.kdsek) || !item.kdkls || item.kdkls.length > 100 || classKeys.has(key)) return true;
    classKeys.add(key);
    return false;
  });
  if (!schools.length || schools.length > 100 || !schools.some((school) => school.active) || invalidSchool) {
    setSettingsStatus(ui.schoolSettingsStatus, 'Setiap sekolah aktif wajib memiliki nama dan ID VA dua digit yang valid. Minimal satu sekolah harus aktif.', 'error');
    return;
  }
  if (new Set(vaSchoolCodes).size !== vaSchoolCodes.length) {
    setSettingsStatus(ui.schoolSettingsStatus, 'ID VA sekolah tidak boleh berulang, termasuk untuk sekolah nonaktif.', 'error');
    return;
  }
  const invalidBankSettings = validateVABanks(app.state.vaSettings);
  if (invalidBankSettings) {
    setSettingsStatus(ui.schoolSettingsStatus, `Selesaikan konfigurasi bank VA terlebih dahulu: ${invalidBankSettings}`, 'error');
    return;
  }
  if (invalidClass || classes.length > 500) {
    setSettingsStatus(ui.schoolSettingsStatus, 'Daftar kelas tidak valid. Pastikan setiap kelas memiliki sekolah, nama maksimal 100 karakter, dan tidak ada nama kelas ganda.', 'error');
    return;
  }

  ui.schoolSettingsSaveBtn.disabled = true;
  try {
    await saveCatalogSettings(schools, classes, app.state.vaSettings);
    setSettingsStatus(ui.schoolSettingsStatus, 'Pengaturan sekolah, ID VA, dan kelas berhasil disimpan.', 'success');
  } catch (error) {
    showSettingsError(ui.schoolSettingsStatus, error, 'Pengaturan sekolah');
  } finally {
    ui.schoolSettingsSaveBtn.disabled = app.useSupabase && !app.settingsReady;
  }
}

async function handleBankSettingsSubmit(event) {
  event.preventDefault();
  const vaSettings = getBankSettingsDraft();
  const invalidSettings = validateVABanks(vaSettings);
  if (invalidSettings) {
    setSettingsStatus(ui.bankSettingsStatus, invalidSettings, 'error');
    return;
  }
  const schoolCodes = app.state.schools
    .filter((school) => school.active)
    .map((school) => school.vaCode);
  const allSchoolCodes = app.state.schools.map((school) => school.vaCode).filter(Boolean);
  if (!schoolCodes.length || schoolCodes.some((code) => !/^\d{2}$/.test(code))
      || allSchoolCodes.some((code) => !/^\d{2}$/.test(code))
      || new Set(allSchoolCodes).size !== allSchoolCodes.length) {
    setSettingsStatus(ui.bankSettingsStatus, 'Atur dan simpan ID VA dua digit yang valid dan unik untuk sekolah terlebih dahulu.', 'error');
    return;
  }

  ui.bankSettingsSaveBtn.disabled = true;
  try {
    await saveCatalogSettings(app.state.schools, app.state.classes, vaSettings);
    setSettingsStatus(ui.bankSettingsStatus, 'Konfigurasi bank VA berhasil disimpan.', 'success');
  } catch (error) {
    showSettingsError(ui.bankSettingsStatus, error, 'Pengaturan bank');
  } finally {
    ui.bankSettingsSaveBtn.disabled = app.useSupabase && !app.settingsReady;
  }
}

function setupEvents() {
  document.querySelectorAll('.nav').forEach((button) => {
    button.addEventListener('click', () => setPage(button.dataset.page));
  });

  ui.searchStudent.addEventListener('input', () => {
    if (!app.server) {
      renderStudentTable();
      return;
    }
    app.paging.students = 0;
    refreshStudentsSoon();
  });
  ui.paymentSearch.addEventListener('input', () => {
    app.paging.payments = 0;
    if (app.server) refreshPaymentsSoon();
  });
  const handleScopeChange = () => {
    app.paging.students = 0;
    app.paging.payments = 0;
    app.paging.detail = 0;
    renderStudentTable();
    if (app.server) {
      renderDashboard();
      renderReport();
      renderPaymentList();
    }
  };
  ui.schoolFilter.addEventListener('change', handleScopeChange);
  ui.yearFilter.addEventListener('change', handleScopeChange);
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page-dir]');
    const pager = button && button.closest('[data-pager]');
    if (!pager) return;
    const key = pager.dataset.pager;
    app.paging[key] = Math.max(0, app.paging[key] + Number(button.dataset.pageDir));
    ({ students: fetchStudentPage, payments: fetchPaymentPage, detail: fetchDetailPage })[key]();
    if (key === 'students') ui.studentTableBody.closest('.students-scroll')?.scrollTo({ top: 0 });
  });
  ui.studentSekolah.addEventListener('change', () => populateStudentClassSelect());
  ui.studentForm.addEventListener('submit', addOrUpdateStudent);
  ui.studentResetBtn.addEventListener('click', resetStudentForm);
  ui.studentType.addEventListener('change', updateStudentFormMode);
  document.getElementById('bulkGiatBtn').addEventListener('click', applyBulkActivity);
  document.getElementById('bulkStaffBtn').addEventListener('click', applyBulkStaff);
  document.getElementById('templateBtn').addEventListener('click', downloadImportTemplate);
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('arrearAddBtn').addEventListener('click', addArrear);
  ui.arrearsBody.addEventListener('click', (event) => {
    const button = event.target.closest('[data-arrear-delete]');
    if (button) deleteArrear(button.dataset.arrearDelete);
  });
  ui.studentTableBody.addEventListener('change', (event) => {
    const id = event.target.dataset && event.target.dataset.selectId;
    if (!id) return;
    if (event.target.checked) {
      app.selectedStudents.add(id);
      const row = app.state.siswa.find((item) => String(item.id) === id);
      if (row) app.selectedNames.set(id, `${row.nama} (${row.kdkls})`);
    } else app.selectedStudents.delete(id);
    event.target.closest('tr').classList.toggle('is-selected', event.target.checked);
    updateSelectionUi(getFilteredStudents());
  });
  setupStudentPickers();
  document.querySelectorAll('[data-open]').forEach((button) => {
    button.addEventListener('click', () => {
      const section = document.getElementById(button.dataset.open);
      section.open = true;
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
  document.getElementById('clearSelectionBtn').addEventListener('click', () => {
    app.selectedStudents.clear();
    renderStudentTable();
  });
  ui.selectedChips.addEventListener('click', (event) => {
    const button = event.target.closest('[data-unselect-id]');
    if (!button) return;
    app.selectedStudents.delete(button.dataset.unselectId);
    renderStudentTable();
  });
  ui.selectAllStudents.addEventListener('change', () => {
    const checked = ui.selectAllStudents.checked;
    getFilteredStudents()
      .filter((row) => /^\d+$/.test(row.id))
      .forEach((row) => {
        if (checked) {
          app.selectedStudents.add(row.id);
          app.selectedNames.set(row.id, `${row.nama} (${row.kdkls})`);
        } else app.selectedStudents.delete(row.id);
      });
    drawStudentTable();
  });
  document.addEventListener('input', (event) => {
    if (event.target.classList && event.target.classList.contains('name-input')) applyNameCase(event.target);
  });
  document.addEventListener('input', (event) => {
    if (event.target.classList && event.target.classList.contains('money-input')) formatMoneyInput(event.target);
  });
  formatAllMoneyInputs();
  document.getElementById('logBtn').addEventListener('click', showStudentLog);
  ui.importFile.addEventListener('change', () => {
    if (ui.importFile.files[0]) importStudentsFile(ui.importFile.files[0]);
  });
  ui.paymentForm.addEventListener('submit', handlePaymentSubmit);
  ui.schoolSettingsForm.addEventListener('submit', handleSchoolSettingsSubmit);
  ui.bankSettingsForm.addEventListener('submit', handleBankSettingsSubmit);
  ui.addSchoolBtn.addEventListener('click', () => {
    const name = ui.newSchoolName.value.trim();
    const vaCode = ui.newSchoolVaCode.value.trim();
    const schools = getSchoolSettingsDraft();
    if (!name || name.length > 100 || !/^\d{2}$/.test(vaCode)) {
      setSettingsStatus(ui.schoolSettingsStatus, 'Nama sekolah wajib diisi dan ID VA harus tepat dua digit.', 'error');
      return;
    }
    if (schools.length >= 100) {
      setSettingsStatus(ui.schoolSettingsStatus, 'Jumlah sekolah maksimal 100.', 'error');
      return;
    }
    if (schools.some((school) => school.vaCode === vaCode)) {
      setSettingsStatus(ui.schoolSettingsStatus, 'ID VA tersebut sudah digunakan sekolah lain.', 'error');
      return;
    }

    let kdsek;
    try {
      kdsek = generateInternalSchoolCode(schools);
    } catch (error) {
      setSettingsStatus(ui.schoolSettingsStatus, error.message, 'error');
      return;
    }

    app.state.schools = [...schools, { kdsek, nmsek: name, vaCode, active: true, isCustom: true }];
    app.state.classes = normalizeSchoolClasses(getSchoolClassesDraft());
    ui.newSchoolName.value = '';
    ui.newSchoolVaCode.value = '';
    renderSettings();
    setSettingsStatus(ui.schoolSettingsStatus, 'Sekolah ditambahkan. Klik "Simpan Sekolah dan Kelas" untuk menerapkan perubahan.', 'success');
  });
  ui.addVaBankBtn.addEventListener('click', () => {
    const vaSettings = getBankSettingsDraft();
    if (vaSettings.length >= 100) {
      setSettingsStatus(ui.bankSettingsStatus, 'Jumlah konfigurasi bank VA maksimal 100.', 'error');
      return;
    }
    const activeCount = vaSettings.filter((item) => item.active).length;
    const activeId = createVAConfigId();
    app.state.vaSettings = [...vaSettings, {
      id: activeId,
      bankName: app.state.bankName || DEFAULT_DB.bankName,
      vaPrefix: '',
      active: activeCount < 2
    }];
    renderBankVASettings();
    setSettingsStatus(ui.bankSettingsStatus, 'Isi nama bank dan prefix VA angka minimal 5 digit, lalu simpan.', 'success');
  });
  ui.schoolSettingsForm.addEventListener('click', (event) => {
    const schoolAction = event.target.closest('[data-school-action]');
    if (schoolAction) {
      const schoolCode = schoolAction.dataset.schoolAction;
      const schools = getSchoolSettingsDraft();
      const school = schools.find((item) => item.kdsek === schoolCode);
      if (!school) return;

      const classes = getSchoolClassesDraft();
      const schoolUsed = isSchoolUsed(schoolCode);
      let removed = false;
      let message;
      if (!school.active) {
        school.active = true;
        message = 'Sekolah diaktifkan kembali. Simpan perubahan untuk menerapkannya.';
      } else if (schoolUsed) {
        school.active = false;
        message = 'Sekolah memiliki data siswa atau transaksi, jadi dinonaktifkan agar riwayat tetap utuh.';
      } else {
        schools.splice(schools.indexOf(school), 1);
        removed = true;
        message = 'Sekolah tanpa data berhasil dihapus dari daftar. Simpan perubahan untuk menerapkannya.';
      }

      app.state.schools = schools;
      app.state.classes = normalizeSchoolClasses(
        removed ? classes.filter((item) => item.kdsek !== schoolCode) : classes
      );
      renderSettings();
      setSettingsStatus(ui.schoolSettingsStatus, message, 'success');
      return;
    }

    const button = event.target.closest('[data-add-class]');
    if (!button) return;

    const schoolCode = button.dataset.addClass;
    const card = button.closest('.school-class-card');
    const input = card.querySelector('[data-new-class]');
    const className = input.value.trim();
    const duplicate = [...ui.schoolClassSettings.querySelectorAll('[data-class-name]')].some((item) => (
      item.dataset.classSchool === schoolCode
      && item.dataset.className.toLowerCase() === className.toLowerCase()
    ));
    if (!className || className.length > 100) {
      setSettingsStatus(ui.schoolSettingsStatus, 'Nama kelas wajib diisi dan maksimal 100 karakter.', 'error');
      return;
    }
    if (duplicate) {
      setSettingsStatus(ui.schoolSettingsStatus, 'Kelas tersebut sudah terdaftar untuk sekolah ini. Centang kelasnya untuk mengaktifkan.', 'error');
      return;
    }
    if (ui.schoolClassSettings.querySelectorAll('[data-class-name]').length >= 500) {
      setSettingsStatus(ui.schoolSettingsStatus, 'Jumlah kelas maksimal 500.', 'error');
      return;
    }

    const list = card.querySelector('.school-class-list');
    list.querySelector('.empty-state')?.remove();
    const label = document.createElement('label');
    label.className = 'school-class-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = true;
    checkbox.dataset.classSchool = schoolCode;
    checkbox.dataset.className = className;
    const name = document.createElement('span');
    name.textContent = className;
    label.append(checkbox, name);
    list.append(label);
    input.value = '';
    setSettingsStatus(ui.schoolSettingsStatus, 'Kelas ditambahkan. Klik "Simpan Sekolah dan Kelas" agar tersimpan dan bisa dipilih saat input siswa.', 'success');
  });
  ui.bankSettingsForm.addEventListener('click', (event) => {
    const button = event.target.closest('[data-remove-va]');
    if (!button) return;
    const removedId = button.dataset.removeVa;
    app.state.vaSettings = getBankSettingsDraft().filter((item) => item.id !== removedId);
    renderBankVASettings();
    setSettingsStatus(ui.bankSettingsStatus, 'Bank VA dihapus dari daftar. Simpan perubahan untuk menerapkannya.', 'success');
  });

  ui.studentTableBody.addEventListener('click', (event) => {
    const target = event.target.closest('button');
    if (!target) return;
    const { action, nospp, id } = target.dataset;
    if (action === 'edit-student') {
      changeStudentSpp(nospp);
    }
    if (action === 'arrear-student') {
      setPickerValue('arrearStudent', id);
      ui.arrearsTools.open = true;
      ui.arrearsTools.scrollIntoView({ behavior: 'smooth', block: 'start' });
      ui.arrearNominal.focus();
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
    app.adminCredentials = null;
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

    ui.loginForm.reset();
    renderAll();
    setPage('dashboard');
  });
}

function renderAll() {
  populateSchoolSelect();
  populateYearFilter();
  populateExistingStudents();
  if (!ui.studentTahun.value) ui.studentTahun.value = currentAcademicYear();
  updateStudentFormMode();
  renderDashboard();
  renderStudentTable();
  renderArrears();
  renderPaymentList();
  renderReport();
  renderSettings();
}

async function hydrateAppData() {
  const configured = hasSupabaseConfig();
  if (!configured || !window.supabase) {
    app.useSupabase = false;
    app.settingsReady = true;
    return;
  }

  app.supabase = initSupabase();
  if (!app.supabase) {
    app.useSupabase = false;
    app.settingsReady = true;
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
