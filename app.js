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
  adminCredentials: null
};

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
    const [schoolsRes, mastankRes, mastsppRes, pembayaranRes, bankSettingsRes, schoolSettingsRes, schoolClassesRes, vaSettingsRes] = await Promise.all([
      app.supabase.from('mastsek').select('*'),
      app.supabase.from('mastank').select('*'),
      app.supabase.from('mastspp').select('*'),
      app.supabase.from('pembayaran').select('*'),
      app.supabase.from('spp_app_bank_settings').select('bank_name').eq('setting_id', 1).maybeSingle(),
      app.supabase.from('spp_app_school_settings').select('school_code, school_name, va_school_code, is_active, is_custom'),
      app.supabase.from('spp_app_school_classes').select('school_code, class_name, is_active'),
      app.supabase.from('spp_app_va_settings').select('config_id, bank_name, va_prefix, is_active')
    ]);

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

    const fallbackSiswa = (tagihanData.length ? tagihanData : DEFAULT_DB.siswa)
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

    const fallbackTransaksi = (transaksiData.length ? transaksiData : DEFAULT_DB.transaksi)
      .map(normalizeSupabaseTransaction);

    return {
      schools: fallbackSchools,
      bankName: bankSettingsRes.data && bankSettingsRes.data.bank_name
        ? String(bankSettingsRes.data.bank_name).trim()
        : DEFAULT_DB.bankName,
      vaSettings: (vaSettingsRes.data || []).map(normalizeSupabaseVABank),
      classes: mergeSchoolClasses(
        (schoolClassesRes.data || []).map(normalizeSupabaseSchoolClass),
        fallbackSiswa
      ),
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
    number: `${bank.vaPrefix}${school.vaCode}${student.id}`
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
    ui.studentTableBody.innerHTML = '<tr><td colspan="8" class="empty-state">Tidak ada data siswa yang cocok.</td></tr>';
    return;
  }

  ui.studentTableBody.innerHTML = rows.map((row) => {
    const totalTagihan = Number(row.spp || 0) + Number(row.komp || 0);
    const totalBayar = app.state.transaksi
      .filter((tx) => tx.nospp === row.nospp)
      .reduce((sum, tx) => sum + Number(tx.nominal || 0), 0);
    const status = totalBayar >= totalTagihan ? 'Lunas' : 'Belum';
    const virtualAccounts = getStudentVirtualAccounts(row);
    const virtualAccountMarkup = virtualAccounts.length
      ? `<div class="student-va-list">${virtualAccounts.map((item) => `
        <div><span>${escapeHtml(item.bankName)}</span><strong>${escapeHtml(item.number)}</strong></div>
      `).join('')}</div>`
      : '<span class="empty-state">Belum diatur</span>';

    return `
      <tr>
        <td>${row.nospp}</td>
        <td>${row.nama}</td>
        <td>${escapeHtml(getSchoolName(row.kdsek))}</td>
        <td>${row.kdkls}</td>
        <td>${virtualAccountMarkup}</td>
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
        <td>${escapeHtml(getSchoolName(row.kdsek))}</td>
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
  populateStudentClassSelect();
  ui.studentSubmitBtn.textContent = 'Simpan Siswa';
}

function fillStudentForm(row) {
  ui.studentIdEdit.value = row.nospp;
  ui.studentNospp.value = row.nospp;
  ui.studentNama.value = row.nama;
  populateSchoolSelect(row.kdsek, row.kdkls);
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

  if (!/^\d{1,10}$/.test(id)) {
    alert('ID siswa hanya boleh berisi angka, maksimal 10 digit.');
    return;
  }

  const existingIndex = app.state.siswa.findIndex((item) => item.nospp === nospp);
  const existingStudent = existingIndex >= 0 ? app.state.siswa[existingIndex] : null;
  const duplicateStudentId = app.state.siswa.some((item) => item.id === id && item.nospp !== nospp);
  if (duplicateStudentId) {
    alert('ID siswa sudah digunakan. ID harus unik di seluruh sekolah.');
    return;
  }

  const selectedSchool = app.state.schools.find((item) => item.kdsek === kdsek);
  const existingSchool = existingStudent && existingStudent.kdsek === kdsek;
  if (!selectedSchool || (!selectedSchool.active && !existingSchool)) {
    alert('Pilih sekolah yang aktif.');
    return;
  }

  const needsNewVA = !existingStudent || existingStudent.kdsek !== kdsek || existingStudent.id !== id;
  if (needsNewVA && !/^\d{2}$/.test(selectedSchool.vaCode || '')) {
    alert('ID VA sekolah belum diatur. Atur kode dua digit di menu Sekolah terlebih dahulu.');
    return;
  }
  if (needsNewVA && !getActiveVABanks().length) {
    alert('Belum ada bank VA aktif. Atur minimal satu prefix di menu Bank terlebih dahulu.');
    return;
  }

  const activeClass = app.state.classes.some((item) => item.kdsek === kdsek && item.kdkls === kdkls && item.active);
  const retainingInactiveClass = existingStudent
    && existingStudent.kdsek === kdsek
    && existingStudent.kdkls === kdkls;
  if (!activeClass && !retainingInactiveClass) {
    alert('Pilih kelas aktif yang sudah diatur untuk sekolah ini.');
    return;
  }

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

  ui.searchStudent.addEventListener('input', renderStudentTable);
  ui.schoolFilter.addEventListener('change', renderStudentTable);
  ui.studentSekolah.addEventListener('change', () => populateStudentClassSelect());
  ui.studentForm.addEventListener('submit', addOrUpdateStudent);
  ui.studentResetBtn.addEventListener('click', resetStudentForm);
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
    list.innerHTML = '';
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
    list.appendChild(label);
    input.value = '';
    setSettingsStatus(ui.schoolSettingsStatus, 'Kelas ditambahkan. Klik "Simpan Sekolah dan Kelas" untuk menerapkan perubahan.', 'success');
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
  renderDashboard();
  renderStudentTable();
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
