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
  operatorCodes: {},
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
  provisionalEnrollmentReady: false,
  adminCredentials: null,
  dashboardCredentials: null,
  cardPrintCredentials: null,
  studentCardPrintContext: null,
  paymentHistoryRequest: 0,
  selectedStudents: new Set(),
  selectedNames: new Map(),
  pickerCache: new Map(),
  server: false,
  years: [],
  usedSchools: new Set(),
  selectedPaymentStudent: null,
  pendingPaymentCorrection: null,
  paymentBilling: null,
  paymentBillingError: '',
  paymentBillingCache: new Map(),
  paymentImportRows: [],
  paging: { students: 0, payments: 0 },
  studentSort: { key: 'nama', ascending: true },
  totals: { students: 0, payments: 0 },
  dash: null,
  reportRows: null,
  arrearsOffset: 0,
  arrearsTotal: 0,
  arrearsRows: [],
  arrearsExporting: false,
  userAccounts: [],
  passwordResetTarget: null
};

const PAGE_SIZE = 25;
const ARREARS_PAGE_SIZE = 100;
const PAYMENT_COMPONENTS = [
  ['spp', 'SPP bulanan'],
  ['komp', 'Komputer bulanan'],
  ['giat', 'Kegiatan'],
  ['dpp', 'DPP'],
  ['dsp', 'DPS'],
  ['seragam', 'Seragam'],
  ['spp_tl', 'SPP tahun lalu'],
  ['komp_tl', 'Komputer tahun lalu'],
  ['lainnya', 'Lainnya']
];
const STUDENT_CARD_ROW_COUNT = 16;
const REVENUE_COLORS = ['#176b55', '#4968d4', '#b26b1c', '#7652a8', '#c34c5b', '#267d91', '#7b7f25', '#a05083'];

const pageMap = {
  dashboard: document.getElementById('dashboardPage'),
  siswa: document.getElementById('siswaPage'),
  pembayaran: document.getElementById('pembayaranPage'),
  laporan: document.getElementById('laporanPage'),
  sekolah: document.getElementById('sekolahPage'),
  bank: document.getElementById('bankPage'),
  operator: document.getElementById('operatorPage')
};

const ui = {
  sidebar: document.getElementById('sidebar'),
  loginScreen: document.getElementById('loginScreen'),
  pageTitle: document.getElementById('pageTitle'),
  userName: document.getElementById('userName'),
  schoolFilter: document.getElementById('schoolFilter'),
  yearFilter: document.getElementById('yearFilter'),
  dashboardClassFilter: document.getElementById('dashboardClassFilter'),
  paymentSearch: document.getElementById('paymentSearch'),
  dailyPaymentDate: document.getElementById('dailyPaymentDate'),
  dailyPaymentSummary: document.getElementById('dailyPaymentSummary'),
  dailyPaymentSummaryTotal: document.getElementById('dailyPaymentSummaryTotal'),
  dailyPaymentBreakdown: document.getElementById('dailyPaymentBreakdown'),
  dailyPaymentBreakdownTotal: document.getElementById('dailyPaymentBreakdownTotal'),
  dailyPaymentSummaryStatus: document.getElementById('dailyPaymentSummaryStatus'),
  dailyCashPrint: document.getElementById('printDailyCashBtn'),
  dailyCashPrintSheet: document.getElementById('dailyCashPrintSheet'),
  studentCardPrintSheet: document.getElementById('studentCardPrintSheet'),
  studentCardPrintDialog: document.getElementById('studentCardPrintDialog'),
  studentCardPrintStudent: document.getElementById('studentCardPrintStudent'),
  studentCardPrintStatus: document.getElementById('studentCardPrintStatus'),
  studentCardPrintOptions: document.getElementById('studentCardPrintOptions'),
  studentCardPrintPreview: document.getElementById('studentCardPrintPreview'),
  studentCardPrintPreviewCaption: document.getElementById('studentCardPrintPreviewCaption'),
  studentCardPrintSubmit: document.getElementById('studentCardPrintSubmit'),
  studentCardPrintClose: document.getElementById('studentCardPrintClose'),
  studentCardPrintCancel: document.getElementById('studentCardPrintCancel'),
  paymentHistoryDialog: document.getElementById('paymentHistoryDialog'),
  paymentHistoryStudent: document.getElementById('paymentHistoryStudent'),
  paymentHistoryYear: document.getElementById('paymentHistoryYear'),
  paymentPeriodHistory: document.getElementById('paymentPeriodHistory'),
  paymentOneTimeHistory: document.getElementById('paymentOneTimeHistory'),
  paymentTransactionHistory: document.getElementById('paymentTransactionHistory'),
  paymentHistoryClose: document.getElementById('paymentHistoryClose'),
  paymentHistoryCancel: document.getElementById('paymentHistoryCancel'),
  studentTableBody: document.getElementById('studentTableBody'),
  studentForm: document.getElementById('studentForm'),
  studentNama: document.getElementById('studentNama'),
  studentSekolah: document.getElementById('studentSekolah'),
  studentKelas: document.getElementById('studentKelas'),
  studentType: document.getElementById('studentType'),
  studentDialog: document.getElementById('studentFormSection'),
  studentEditSummary: document.getElementById('studentEditSummary'),
  studentEffective: document.getElementById('studentEffective'),
  studentModalEyebrow: document.getElementById('studentModalEyebrow'),
  studentModalTitle: document.getElementById('studentModalTitle'),
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
  arrearCutoffYear: document.getElementById('arrearCutoffYear'),
  arrearCutoffBtn: document.getElementById('arrearCutoffBtn'),
  arrearCutoffStatus: document.getElementById('arrearCutoffStatus'),
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
  downloadStudentsBtn: document.getElementById('downloadStudentsBtn'),
  studentExportStatus: document.getElementById('studentExportStatus'),
  studentSortSelect: document.getElementById('studentSortSelect'),
  selectAllStudents: document.getElementById('selectAllStudents'),
  bulkGiat: document.getElementById('bulkGiat'),
  bulkStaffMode: document.getElementById('bulkStaffMode'),
  importFile: document.getElementById('importFile'),
  studentLogWrap: document.getElementById('studentLogWrap'),
  studentLogBody: document.getElementById('studentLogBody'),
  studentSubmitBtn: document.getElementById('studentSubmitBtn'),
  studentResetBtn: document.getElementById('studentResetBtn'),
  studentCloseBtn: document.getElementById('studentCloseBtn'),
  activityList: document.getElementById('activityList'),
  reportPeriod: document.getElementById('reportPeriod'),
  reportSchoolFilter: document.getElementById('reportSchoolFilter'),
  reportYearFilter: document.getElementById('reportYearFilter'),
  reportPeriodFilter: document.getElementById('reportPeriodFilter'),
  reportClassFilter: document.getElementById('reportClassFilter'),
  arrearsReportTable: document.getElementById('arrearsReportTable'),
  arrearsReportCount: document.getElementById('arrearsReportCount'),
  arrearsPageInfo: document.getElementById('arrearsPageInfo'),
  loadMoreArrears: document.getElementById('loadMoreArrears'),
  downloadArrearsSchoolBtn: document.getElementById('downloadArrearsSchoolBtn'),
  downloadArrearsClassBtn: document.getElementById('downloadArrearsClassBtn'),
  arrearsExportStatus: document.getElementById('arrearsExportStatus'),
  legacyPaymentNote: document.getElementById('legacyPaymentNote'),
  arrearsPrintSheet: document.getElementById('arrearsPrintSheet'),
  paymentList: document.getElementById('paymentList'),
  totalSiswa: document.getElementById('totalSiswa'),
  totalTagihan: document.getElementById('totalTagihan'),
  paymentThisMonth: document.getElementById('paymentThisMonth'),
  totalTransaksi: document.getElementById('totalTransaksi'),
  financeDashboard: document.getElementById('financeDashboard'),
  unitDashboard: document.getElementById('unitDashboard'),
  unitDashboardYear: document.getElementById('unitDashboardYear'),
  unitDashboardStudents: document.getElementById('unitDashboardStudents'),
  unitDashboardStatus: document.getElementById('unitDashboardStatus'),
  revenueLegend: document.getElementById('revenueLegend'),
  revenueChart: document.getElementById('revenueChart'),
  revenueTableHead: document.getElementById('revenueTableHead'),
  revenueTableBody: document.getElementById('revenueTableBody'),
  activityYearTarget: document.getElementById('activityYearTarget'),
  activityYearPaid: document.getElementById('activityYearPaid'),
  activityYearBalance: document.getElementById('activityYearBalance'),
  activityYearChart: document.getElementById('activityYearChart'),
  activityYearBody: document.getElementById('activityYearBody'),
  activityYearStatus: document.getElementById('activityYearStatus'),
  priorYearRevenueBody: document.getElementById('priorYearRevenueBody'),
  paymentBankName: document.getElementById('paymentBankName'),
  searchStudent: document.getElementById('searchStudent'),
  paymentForm: document.getElementById('paymentForm'),
  paymentDate: document.getElementById('paymentDate'),
  paymentPrintSheet: document.getElementById('paymentPrintSheet'),
  paymentCorrectionDialog: document.getElementById('paymentCorrectionDialog'),
  paymentCorrectionReason: document.getElementById('paymentCorrectionReason'),
  paymentCorrectionSubmit: document.getElementById('paymentCorrectionSubmit'),
  operatorCodesTableBody: document.getElementById('operatorCodesTableBody'),
  operatorCodesStatus: document.getElementById('operatorCodesStatus'),
  userCreateForm: document.getElementById('userCreateForm'),
  newUserName: document.getElementById('newUserName'),
  newUserUsername: document.getElementById('newUserUsername'),
  newUserPassword: document.getElementById('newUserPassword'),
  newUserRole: document.getElementById('newUserRole'),
  newUserSchoolField: document.getElementById('newUserSchoolField'),
  newUserSchool: document.getElementById('newUserSchool'),
  createUserSubmit: document.getElementById('createUserSubmit'),
  userCreateStatus: document.getElementById('userCreateStatus'),
  userPasswordDialog: document.getElementById('userPasswordDialog'),
  userPasswordForm: document.getElementById('userPasswordForm'),
  userPasswordTarget: document.getElementById('userPasswordTarget'),
  userPasswordNew: document.getElementById('userPasswordNew'),
  userPasswordConfirm: document.getElementById('userPasswordConfirm'),
  userPasswordStatus: document.getElementById('userPasswordStatus'),
  userPasswordSubmit: document.getElementById('userPasswordSubmit'),
  userPasswordClose: document.getElementById('userPasswordClose'),
  userPasswordCancel: document.getElementById('userPasswordCancel'),
  paymentComponentRows: document.getElementById('paymentComponentRows'),
  paymentBosTotal: document.getElementById('paymentBosTotal'),
  paymentAllocationTotal: document.getElementById('paymentAllocationTotal'),
  paymentBillingStatus: document.getElementById('paymentBillingStatus'),
  addPaymentComponent: document.getElementById('addPaymentComponent'),
  paymentImportFile: document.getElementById('paymentImportFile'),
  paymentImportReview: document.getElementById('paymentImportReview'),
  paymentImportStatus: document.getElementById('paymentImportStatus'),
  paymentImportRows: document.getElementById('paymentImportRows'),
  importPaymentsBtn: document.getElementById('importPaymentsBtn'),
  downloadPaymentTemplate: document.getElementById('downloadPaymentTemplate'),
  addOneTimePaymentComponent: document.getElementById('addOneTimePaymentComponent'),
  refreshRevenue: document.getElementById('refreshRevenue'),
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

function getCurrentOperatorCode() {
  const idpemakai = app.user?.idpemakai || 'ADMIN';
  return app.state.operatorCodes?.[idpemakai] || app.user?.operatorCode || idpemakai;
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
      operatorCodes: parsed.operatorCodes && typeof parsed.operatorCodes === 'object' ? parsed.operatorCodes : {},
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
    component: row.component || 'legacy',
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
    if (app.server) {
      const featureProbe = await app.supabase.rpc('spp_app_search_students_v2', { p_q: '', p_limit: 1 });
      app.provisionalEnrollmentReady = !featureProbe.error;
    } else {
      app.provisionalEnrollmentReady = false;
    }
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

function matchingSchoolCodes(keyword) {
  const needle = String(keyword).toLowerCase();
  return app.state.schools
    .filter((school) => `${school.nmsek || ''} ${school.kdsek}`.toLowerCase().includes(needle))
    .map((school) => String(school.kdsek).replace(/[^\w-]/g, ''));
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

function formatRupiahCompact(value) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(Number(value || 0));
}

function setPage(pageName) {
  if (!pageMap[pageName]) return;

  if (pageName === 'pembayaran' && !canAccessPayment()) {
    alert('Hanya Admin KKMS yang dapat mengakses halaman pembayaran.');
    return;
  }

  if (['sekolah', 'bank', 'operator'].includes(pageName) && !canManageSettings()) {
    alert('Hanya Admin yang dapat mengubah pengaturan.');
    return;
  }

  app.currentPage = pageName;
  Object.entries(pageMap).forEach(([key, element]) => {
    element.classList.toggle('active', key === pageName);
  });

  document.querySelectorAll('.nav').forEach((button) => {
    const isCurrentPage = button.dataset.page === pageName;
    button.classList.toggle('active', isCurrentPage);
    if (isCurrentPage) {
      button.setAttribute('aria-current', 'page');
    } else {
      button.removeAttribute('aria-current');
    }
  });
  requestAnimationFrame(updateCourseIndicator);

  ui.pageTitle.textContent = {
    dashboard: 'Dashboard',
    siswa: 'Data Siswa',
    pembayaran: 'Pembayaran',
    laporan: 'Laporan',
    sekolah: 'Sekolah',
    bank: 'Bank',
    operator: 'Pengguna'
  }[pageName];

  if (pageName === 'operator') {
    populateNewUserSchoolOptions();
    loadUserAccounts();
  }
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

function updateCourseIndicator() {
  const workflowPath = document.querySelector('.workflow-path');
  if (!workflowPath) return;

  const stages = Array.from(workflowPath.querySelectorAll('.nav[data-stage]'))
    .filter((button) => !button.hidden && button.getClientRects().length > 0);
  if (!stages.length) return;

  const trackRect = workflowPath.getBoundingClientRect();
  const firstRect = stages[0].getBoundingClientRect();
  const lastRect = stages[stages.length - 1].getBoundingClientRect();
  const activeStage = stages.find((button) => button.classList.contains('active'));
  const activeRect = activeStage ? activeStage.getBoundingClientRect() : firstRect;
  const center = (rect) => rect.left - trackRect.left + rect.width / 2;
  const courseStart = center(firstRect);
  const courseEnd = center(activeRect);
  const courseTrackEnd = center(lastRect);

  workflowPath.style.setProperty('--course-start', `${courseStart}px`);
  workflowPath.style.setProperty('--course-end', `${courseEnd}px`);
  workflowPath.style.setProperty('--course-track-end', `${courseTrackEnd}px`);
  workflowPath.style.setProperty(
    '--course-progress',
    String(courseTrackEnd > courseStart ? (courseEnd - courseStart) / (courseTrackEnd - courseStart) : 0)
  );
  workflowPath.classList.toggle('has-active-stage', !!activeStage);
}

window.addEventListener('resize', updateCourseIndicator);
document.fonts.ready.then(updateCourseIndicator);

function applyUserAccess() {
  const paymentNav = document.querySelector('.nav[data-page="pembayaran"]');
  if (paymentNav) {
    paymentNav.hidden = !canAccessPayment();
  }
  ui.studentForm.hidden = !canManageSettings();
  ui.studentTools.hidden = !canManageSettings();
  ui.arrearsTools.hidden = !canManageSettings();
  document.querySelectorAll('.admin-only').forEach((button) => {
    button.hidden = !canManageSettings();
  });
  const dailyPaymentPanel = document.querySelector('.daily-summary-panel');
  if (dailyPaymentPanel) dailyPaymentPanel.hidden = !['superadmin', 'yayasan'].includes(app.user?.role);
  requestAnimationFrame(updateCourseIndicator);

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
  populateDashboardClassFilter();
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

function currentDashboardClassScope() {
  const value = ui.dashboardClassFilter?.value || 'all';
  return value === 'all' ? null : value;
}

function populateDashboardClassFilter() {
  if (!ui.dashboardClassFilter) return;
  const wrap = ui.dashboardClassFilter.closest('.filter-pill');
  const available = app.server && app.user && app.user.role !== 'unit';
  wrap.hidden = !available;
  if (!available) return;

  const previous = ui.dashboardClassFilter.value;
  const school = currentSchoolScope();
  const classes = app.state.classes
    .filter((item) => item.active && (!school || item.kdsek === school))
    .map((item) => item.kdkls);
  const unique = [...new Set(classes)].sort((a, b) => a.localeCompare(b, 'id'));
  ui.dashboardClassFilter.innerHTML = ['<option value="all">Semua kelas</option>']
    .concat(unique.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`))
    .join('');
  ui.dashboardClassFilter.value = unique.includes(previous) ? previous : 'all';
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
    dpp: Number(row.dpp || 0),
    dsp: Number(row.dsp || 0),
    seragam: Number(row.seragam || 0),
    periodeMasuk: row.periode_masuk || '',
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

const FEE_LABELS = [
  ['spp', 'SPP'], ['komp', 'Komputer'], ['dpp', 'DPP'],
  ['dsp', 'DPS'], ['giat', 'Kegiatan'], ['seragam', 'Seragam']
];

function billBreakdownMarkup(row, arrearsTotal) {
  const feeRows = FEE_LABELS.filter(([key]) => Number(row[key] || 0) > 0);
  const lines = feeRows
    .map(([key, label]) => {
      const detailLabel = key === 'spp' || key === 'komp' ? `${label} · per bulan` : label;
      return `<div class="bill-line"><span>${detailLabel}</span><strong>${formatRupiah(row[key])}</strong></div>`;
    })
    .join('');
  const arrears = arrearsTotal
    ? `<div class="bill-arrears"><span>Tunggakan tahun lalu</span></div>
       <div class="bill-arrears-list" data-arrears-for="${escapeHtml(row.id)}"><span class="student-sub">Memuat rincian...</span></div>`
    : '';
  if (!feeRows.length && !arrears) return '<span class="student-sub">Belum ada tagihan.</span>';
  const summary = feeRows.length ? `${feeRows.length} komponen` : 'Tunggakan tahun lalu';
  return `<details class="bill-detail">
    <summary><span>Rincian tagihan</span><strong>${summary}</strong></summary>
    <div class="bill-lines" aria-label="Rincian tagihan per komponen">${lines}${arrears}</div>
  </details>`;
}

async function hydrateArrearsBreakdown() {
  const boxes = [...ui.studentTableBody.querySelectorAll('[data-arrears-for]')];
  if (!boxes.length) return;
  const ids = [...new Set(boxes.map((box) => box.dataset.arrearsFor))];
  let items;
  if (app.server) {
    const { data, error } = await app.supabase.from('spp_app_arrears_list').select('*')
      .in('id_siswa', ids).order('tahun_ajaran');
    if (error) { boxes.forEach((box) => { box.textContent = 'Rincian gagal dimuat.'; }); return; }
    items = (data || []).map((a) => ({ idSiswa: String(a.id_siswa), tahunAjaran: a.tahun_ajaran, jenis: a.jenis, keterangan: a.keterangan, nominal: Number(a.nominal) }));
  } else {
    items = app.state.arrears || [];
  }
  boxes.forEach((box) => {
    const mine = items.filter((a) => String(a.idSiswa) === box.dataset.arrearsFor);
    box.innerHTML = mine.map((a) => `<div class="bill-line bill-sub"><span>${escapeHtml(a.jenis)} ${escapeHtml(a.tahunAjaran)}${a.keterangan ? ` &middot; ${escapeHtml(a.keterangan)}` : ''}</span><strong>${formatRupiah(a.nominal)}</strong></div>`).join('')
      || '<span class="student-sub">Tidak ada rincian.</span>';
  });
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

function createStudentOverviewQuery(includeCount = false) {
  let query = app.supabase.from('spp_app_student_overview').select(
    '*',
    includeCount ? { count: 'exact' } : undefined
  );
  const year = currentYearScope();
  const school = currentSchoolScope();
  const keyword = cleanKeyword(ui.searchStudent.value);
  if (year) query = query.eq('tahun_ajaran', year);
  if (school) query = query.eq('kdsek', school);
  if (keyword) {
    const schoolCodes = matchingSchoolCodes(keyword).map((code) => `kdsek.eq.${code}`);
    query = query.or([
      `nama.ilike.%${keyword}%`,
      `nospp.ilike.${keyword}%`,
      `kdkls.ilike.${keyword}%`,
      `id_siswa.eq.${keyword}`,
      ...schoolCodes
    ].join(','));
  }
  return query;
}

function orderStudentOverviewQuery(query) {
  const sort = app.studentSort || { key: 'nama', ascending: true };
  if (sort.key === 'school') {
    return query.order('school_name', { ascending: sort.ascending })
      .order('kdsek').order('kdkls').order('nama').order('id_siswa')
      .order('tahun_ajaran', { ascending: false });
  }
  if (sort.key === 'class') {
    return query.order('class_sort', { ascending: sort.ascending })
      .order('school_name').order('kdkls').order('nama').order('id_siswa')
      .order('tahun_ajaran', { ascending: false });
  }
  return query.order('nama', { ascending: sort.ascending })
    .order('id_siswa').order('tahun_ajaran', { ascending: false });
}

function sortStudentRows(rows) {
  const sort = app.studentSort || { key: 'nama', ascending: true };
  const value = (row) => {
    if (sort.key === 'school') return getSchoolName(row.kdsek);
    if (sort.key === 'class') return row.kdkls || '';
    return row.nama || '';
  };
  const direction = sort.ascending ? 1 : -1;
  return [...rows].sort((a, b) => (
    value(a).localeCompare(value(b), 'id', { numeric: true, sensitivity: 'base' }) * direction
      || String(a.nama || '').localeCompare(String(b.nama || ''), 'id', { numeric: true, sensitivity: 'base' })
      || String(a.id || '').localeCompare(String(b.id || ''), 'id', { numeric: true })
  ));
}

function updateStudentSortHeaders() {
  document.querySelectorAll('[data-student-sort]').forEach((button) => {
    const active = app.studentSort.key === button.dataset.studentSort;
    button.classList.toggle('is-sort-ascending', active && app.studentSort.ascending);
    button.classList.toggle('is-sort-descending', active && !app.studentSort.ascending);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `Urutkan ${button.dataset.sortLabel} ${active && app.studentSort.ascending ? 'menurun' : 'menaik'}`);
  });
  if (ui.studentSortSelect) {
    const key = app.studentSort.key === 'school' || app.studentSort.key === 'class' ? app.studentSort.key : 'nama';
    ui.studentSortSelect.value = `${key}-${app.studentSort.ascending ? 'asc' : 'desc'}`;
  }
}

async function fetchAllStudentRows() {
  const rows = [];
  const batchSize = 1000;
  for (let from = 0; ; from += batchSize) {
    const { data, error } = await orderStudentOverviewQuery(createStudentOverviewQuery())
      .range(from, from + batchSize - 1);
    if (error) throw error;
    const page = (data || []).map(normalizeOverviewRow);
    rows.push(...page);
    if (page.length < batchSize) break;
  }
  return rows;
}

function fileNamePart(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'data';
}

function downloadXlsxSheet(sheetName, headers, rows, widths, fileName) {
  if (!window.XLSX?.utils) throw new Error('Fitur Excel tidak tersedia. Muat ulang aplikasi lalu coba lagi.');
  const workbook = window.XLSX.utils.book_new();
  const sheet = window.XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet['!cols'] = widths.map((wch) => ({ wch }));
  if (sheet['!ref']) sheet['!autofilter'] = { ref: sheet['!ref'] };
  window.XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  window.XLSX.writeFile(workbook, fileName);
}

async function downloadStudents() {
  ui.downloadStudentsBtn.disabled = true;
  ui.studentExportStatus.textContent = 'Menyiapkan data siswa...';
  try {
    const rows = app.server ? await fetchAllStudentRows() : sortStudentRows(getFilteredStudents());
    if (!rows.length) {
      ui.studentExportStatus.textContent = 'Tidak ada data siswa pada filter ini.';
      return;
    }
    const values = rows.map((row) => [
      row.nospp || '',
      row.nama,
      getSchoolName(row.kdsek),
      row.kdkls || '',
      row.tahunAjaran || '',
      row.periodeMasuk || '',
      row.spp,
      row.komp,
      row.dpp,
      row.dsp,
      row.seragam,
      row.giat,
      row.arrearsTotal,
      row.paidTotal
    ]);
    const year = currentYearScope();
    const suffix = year ? `-${fileNamePart(year)}` : '';
    downloadXlsxSheet(
      'Data Siswa',
      ['No. SPP', 'Nama', 'Sekolah', 'Kelas', 'Tahun ajaran', 'Periode masuk', 'SPP/bulan', 'Komputer/bulan', 'DPP', 'DPS', 'Seragam', 'Kegiatan', 'Tagihan tahun lalu (bruto)', 'Total dibayar'],
      values,
      [18, 30, 26, 12, 16, 16, 16, 18, 16, 16, 16, 16, 22, 18],
      `data-siswa${suffix}-${localDateInputValue().replace(/-/g, '')}.xlsx`
    );
    ui.studentExportStatus.textContent = `${rows.length.toLocaleString('id-ID')} siswa berhasil diunduh.`;
  } catch (error) {
    ui.studentExportStatus.textContent = `Unduhan gagal: ${error.message || 'Periksa koneksi dan coba lagi.'}`;
  } finally {
    ui.downloadStudentsBtn.disabled = false;
  }
}

let studentFetchSeq = 0;

async function fetchStudentPage() {
  if (!app.user) return;
  const seq = ++studentFetchSeq;
  ui.studentTableBody.innerHTML = skeletonRows(7);
  const from = app.paging.students * PAGE_SIZE;
  const { data, count, error } = await orderStudentOverviewQuery(createStudentOverviewQuery(true))
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

  return sortStudentRows(app.state.siswa.filter((row) => {
    const matchSchool = schoolFilter === 'all' || row.kdsek === schoolFilter;
    const haystack = `${row.nospp || ''} ${row.nama || ''} ${row.kdkls || ''} ${row.id || ''} ${row.kdsek || ''} ${getSchoolName(row.kdsek)}`.toLowerCase();
    const matchKeyword = !keyword || haystack.includes(keyword);
    return matchSchool && matchKeyword;
  }));
}

function renderStudentTable() {
  if (app.server) return fetchStudentPage();
  return drawStudentTable();
}

function drawStudentTable() {
  const rows = getFilteredStudents();
  updateStudentSortHeaders();
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
    const totalBayar = app.server
      ? row.paidTotal
      : app.state.transaksi
        .filter((tx) => tx.nospp === row.nospp)
        .reduce((sum, tx) => sum + Number(tx.nominal || 0), 0);
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
        <td data-label="Siswa"><div class="student-name">${escapeHtml(row.nama)}</div><div class="student-sub">${row.nospp ? escapeHtml(row.nospp) : 'Menunggu kelas untuk No. SPP'}${row.tahunAjaran ? ` &middot; ${escapeHtml(row.tahunAjaran)}` : ''}${row.isStaffChild ? ' &middot; <span class="badge-staff">Anak guru</span>' : ''}</div></td>
        <td data-label="Sekolah / Kelas"><div>${escapeHtml(getSchoolName(row.kdsek))}</div><div class="student-sub">${row.kdkls ? `Kelas ${escapeHtml(row.kdkls)}` : 'Kelas belum ditentukan'}</div></td>
        <td data-label="Virtual Account">${virtualAccountMarkup}</td>
        <td data-label="Rincian tagihan">${row.isStaffChild && row.showInBilling === false ? 'Tidak ditagih' : billBreakdownMarkup(row, arrearsTotal)}</td>
        <td data-label="Riwayat pembayaran">
          <span class="payment-history-note">${totalBayar > 0 ? `Transaksi tercatat ${formatRupiah(totalBayar)}` : 'Belum ada transaksi'}</span>
          <button type="button" class="secondary-button small-button" data-action="payment-history"
            data-id="${escapeHtml(row.id)}" data-nospp="${escapeHtml(row.nospp)}" data-kdsek="${escapeHtml(row.kdsek)}"
            data-nama="${escapeHtml(row.nama)}" data-kdkls="${escapeHtml(row.kdkls)}" data-year="${escapeHtml(row.tahunAjaran || '')}">
            Lihat rincian
          </button>
        </td>
        <td data-label="Aksi" class="row-actions">
          ${row.nospp ? `<button class="action-btn edit" data-action="print-spp-card" data-id="${escapeHtml(row.id)}" data-nospp="${escapeHtml(row.nospp)}" data-kdsek="${escapeHtml(row.kdsek)}" data-nama="${escapeHtml(row.nama)}" data-kdkls="${escapeHtml(row.kdkls)}">Cetak Kartu</button>` : ''}
          ${admin && !row.nospp && row.tahunAjaran ? `<button class="action-btn edit" data-action="place-student" data-id="${escapeHtml(row.id)}">Tentukan kelas</button>` : ''}
          ${admin && row.tahunAjaran ? `
            <button class="action-btn edit" data-action="edit-student" data-nospp="${escapeHtml(row.nospp)}">Ubah Tagihan</button>
          ` : ''}
          ${admin && selectable ? `<button class="action-btn edit" data-action="arrear-student" data-id="${escapeHtml(row.id)}">Tunggakan</button>` : ''}
          ${admin && selectable ? `<button class="action-btn edit" data-action="rename-student" data-id="${escapeHtml(row.id)}" data-name="${escapeHtml(row.nama)}">Ubah Nama</button>` : ''}
        </td>
      </tr>
    `;
  }).join('');
  hydrateArrearsBreakdown();
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
    nominal: Number(row.nominal || 0),
    periode: row.periode || '',
    source: row.source || 'manual'
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
          <td>${escapeHtml(item.nama || (student ? student.nama : item.idSiswa))} (${escapeHtml(item.idSiswa)})${canManageSettings() ? ` <button type="button" class="action-btn edit" data-rename-id="${escapeHtml(item.idSiswa)}" data-rename-name="${escapeHtml(item.nama || (student ? student.nama : ''))}">Ubah nama</button>` : ''}</td>
          <td>${escapeHtml(item.tahunAjaran)}</td>
          <td>${escapeHtml(item.jenis)}</td>
          <td>${item.periode ? `<strong>${escapeHtml(formatPeriodLabel(item.periode))}</strong> · ` : ''}${escapeHtml(item.keterangan)}</td>
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

function populateArrearCutoffYears() {
  const selected = ui.arrearCutoffYear.value;
  const currentStart = Number(currentAcademicYear().slice(0, 4));
  const years = [...new Set([...(app.years || []), currentAcademicYear(), selected])]
    .filter((year) => /^\d{4}-\d{4}$/.test(String(year || ''))
      && Number(String(year).slice(0, 4)) <= currentStart)
    .sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)));
  ui.arrearCutoffYear.innerHTML = years.map((year) => (
    `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`
  )).join('');
  ui.arrearCutoffYear.value = years.includes(selected)
    ? selected
    : (years.includes(currentAcademicYear()) ? currentAcademicYear() : (years[0] || ''));
  ui.arrearCutoffBtn.disabled = years.length === 0;
}

async function cutoffAcademicYear() {
  if (!canManageSettings()) {
    alert('Hanya Admin yang dapat menutup tahun ajaran.');
    return;
  }
  if (!app.server) {
    alert('Cut-off memerlukan Supabase aktif dan migration 022.');
    return;
  }
  const year = ui.arrearCutoffYear.value;
  if (!year) {
    alert('Pilih tahun ajaran yang akan di-cut-off.');
    return;
  }
  const availableFrom = `${year.slice(5, 9)}-07-01`;
  if (localDateInputValue() < availableFrom) {
    alert(`Cut-off tahun ajaran ${year} baru tersedia setelah Juni ${year.slice(5, 9)}.`);
    return;
  }
  if (!window.confirm(
    `Tutup tahun ajaran ${year}? Sisa SPP dan Komputer akan dipindahkan satu kali ke tunggakan tahun lalu, dengan rincian per periode.`
  )) return;

  ui.arrearCutoffBtn.disabled = true;
  ui.arrearCutoffStatus.textContent = `Memproses cut-off ${year}...`;
  try {
    const credentials = requireStudentRules();
    const { data, error } = await app.supabase.rpc('cutoff_academic_year_v1', {
      ...credentials,
      p_tahun_ajaran: year
    });
    if (error) throw error;
    app.paymentBillingCache.clear();
    await reloadStudentData();
    const result = data || {};
    if (result.already_closed) {
      ui.arrearCutoffStatus.textContent = `Tahun ajaran ${year} sudah pernah di-cut-off; tidak ada tunggakan yang ditambahkan ulang.`;
      alert(`Tahun ajaran ${year} sudah pernah di-cut-off. Tidak ada tagihan yang digandakan.`);
    } else {
      ui.arrearCutoffStatus.textContent = `Cut-off ${year} selesai: ${Number(result.period_count || 0)} rincian periode dibuat.`;
      alert(
        `Cut-off ${year} selesai.\nSPP: ${formatRupiah(result.spp_total || 0)}\nKomputer: ${formatRupiah(result.komputer_total || 0)}\nRincian periode: ${Number(result.period_count || 0)}`
      );
    }
  } catch (error) {
    ui.arrearCutoffStatus.textContent = `Cut-off ${year} gagal.`;
    alert(error.message || 'Cut-off tahun ajaran gagal. Pastikan migration 022 sudah dijalankan.');
  } finally {
    populateArrearCutoffYears();
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
  ui.paymentList.innerHTML = skeletonRows(7);
  let query = app.supabase.from('spp_app_payment_batch_list').select('*', { count: 'exact' });
  const school = currentSchoolScope();
  const keyword = cleanKeyword(ui.paymentSearch.value);
  if (school) query = query.eq('kdsek', school);
  if (keyword) query = query.or(`receipt_no.ilike.${keyword}%,nospp.ilike.${keyword}%,nama.ilike.%${keyword}%`);
  const from = app.paging.payments * PAGE_SIZE;
  const { data, count, error } = await query
    .order('tglbyr', { ascending: false }).order('id', { ascending: false })
    .range(from, from + PAGE_SIZE - 1);
  if (seq !== paymentFetchSeq) return;
  if (error) {
    ui.paymentList.innerHTML = `<tr><td colspan="7" class="empty-state">Data gagal dimuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }
  app.state.transaksi = (data || []).map(normalizeSupabasePaymentBatch);
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
    : getLocalPaymentBatches().sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr));
  if (app.server) renderPager('payments', app.totals.payments);

  if (!rows.length) {
    ui.paymentList.innerHTML = '<tr><td colspan="7" class="empty-state">Belum ada riwayat pembayaran.</td></tr>';
    return;
  }

  ui.paymentList.innerHTML = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.receipt_no || `LEGACY-${row.id}`)}</td>
      <td>${escapeHtml(row.nama || '-')}
        ${row.source === 'bos' ? `<small>${Number(row.student_count || row.items?.length || 0)} siswa</small>` : ''}
      </td>
      <td>${escapeHtml(getPaymentBatchSourceLabel(row))}${row.voided_at ? '<small>Dikoreksi</small>' : ''}</td>
      <td>${escapeHtml(row.tglbyr)}</td>
      <td>${escapeHtml(formatDateTime(row.created_at))}</td>
      <td>${formatRupiah(row.source === 'bos' ? row.nominal : (row.parent_nominal ?? row.nominal))}
        ${row.source !== 'bos' && Number(row.bos_nominal || 0) > 0
          ? `<small>Termasuk BOS ${formatRupiah(row.bos_nominal)}</small>` : ''}
      </td>
      <td>
        ${row.source !== 'bos' && row.nospp
          ? `<button class="secondary-button small-button" data-action="print-spp-card" data-id="${escapeHtml(row.id_siswa || '')}" data-nospp="${escapeHtml(row.nospp)}" data-kdsek="${escapeHtml(row.kdsek || '')}" data-nama="${escapeHtml(row.nama || '')}">Cetak Kartu</button>`
          : ''}
        <button class="secondary-button small-button" data-action="print-payment" data-id="${escapeHtml(row.id)}">Cetak slip</button>
        ${row.voided_at
          ? `<button class="secondary-button small-button" data-action="print-correction" data-id="${escapeHtml(row.id)}">Cetak koreksi</button>`
          : `<button class="action-btn delete" data-action="correct-payment" data-id="${escapeHtml(row.id)}">Koreksi</button>`}
      </td>
    </tr>
  `).join('');
}

function getStudentCardAcademicYearRange() {
  const year = currentYearScope() || currentAcademicYear();
  const match = /^(\d{4})-(\d{4})$/.exec(year);
  if (!match || Number(match[2]) !== Number(match[1]) + 1) {
    throw new Error('Tahun ajaran aktif tidak valid untuk cetak kartu.');
  }
  return {
    year,
    start: `${match[1]}-07-01`,
    end: `${match[2]}-07-01`
  };
}

async function loadStudentCardTransactions(student, range) {
  if (!app.server) {
    throw new Error('Cetak kartu bersama memerlukan koneksi Supabase aktif dan migration cetak kartu terbaru.');
  }

  const rows = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let query = app.supabase.from('spp_app_payment_batch_items')
      .select('batch_id,payment_id,tglbyr,id_siswa,nospp,nama,kdsek,kdkls,component,periode,nominal,voided_at')
      .eq('nospp', student.nospp)
      .eq('kdsek', student.kdsek)
      .gte('tglbyr', range.start)
      .lt('tglbyr', range.end)
      .is('voided_at', null)
      .order('tglbyr', { ascending: true })
      .order('payment_id', { ascending: true });
    if (/^\d+$/.test(student.id)) query = query.eq('id_siswa', student.id);
    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function formatStudentCardDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  return match ? `${match[3]}/${match[2]}` : '';
}

function formatStudentCardPeriod(value) {
  const period = String(value || '').trim();
  if (/^(0[1-9]|1[0-2])\d{4}$/.test(period)) return period;
  const month = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(period);
  return month ? `${month[2]}${month[1]}` : '';
}

function buildStudentCardRows(items) {
  const oneTimeRows = new Map();
  const monthlyRows = new Map();
  let unallocatedCount = 0;

  items.forEach((item, index) => {
    const amount = Number(item.nominal || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Nominal transaksi tidak valid; kartu SPP tidak dicetak.');
    }
    if (!amount) return;

    const sortDate = String(item.tglbyr || '').slice(0, 10);
    const date = formatStudentCardDate(sortDate);
    const period = formatStudentCardPeriod(item.periode);
    const component = String(item.component || 'legacy');
    const batchId = String(item.batch_id || item.payment_id || item.id || `row-${index}`);
    const itemKey = `${batchId}|${period || 'once'}`;

    let monthlyColumn = '';
    if (['spp', 'spp_bos', 'spp_tl'].includes(component)) monthlyColumn = 'spp';
    if (['komp', 'komp_tl'].includes(component)) monthlyColumn = 'komp';
    if (component === 'giat' && period) monthlyColumn = 'giat';

    if (monthlyColumn) {
      if (!period) {
        unallocatedCount += 1;
        return;
      }
      if (!monthlyRows.has(itemKey)) {
        monthlyRows.set(itemKey, {
          date,
          sortDate,
          period,
          section: 'monthly',
          batchId,
          periodOrder: Number(period.slice(2)) * 100 + Number(period.slice(0, 2)),
          spp: 0,
          komp: 0,
          giat: 0,
          orderId: batchId
        });
      }
      const row = monthlyRows.get(itemKey);
      row[monthlyColumn] += amount;
      if (sortDate && (!row.sortDate || sortDate < row.sortDate)) {
        row.sortDate = sortDate;
        row.date = date;
      }
      return;
    }

    let oneTimeColumn = '';
    if (component === 'dpp' || component === 'dpp_tl') oneTimeColumn = 'dpp';
    if (component === 'dsp') oneTimeColumn = 'dps';
    if (component === 'giat' || component === 'seragam' || component === 'lainnya') {
      oneTimeColumn = component === 'giat' ? 'giat' : 'admin';
    }
    if (!oneTimeColumn) {
      unallocatedCount += 1;
      return;
    }

    const oneTimeKey = `${batchId}|once`;
    if (!oneTimeRows.has(oneTimeKey)) {
      oneTimeRows.set(oneTimeKey, {
        date,
        sortDate,
        section: 'one_time',
        batchId,
        period: '',
        dpp: 0,
        dps: 0,
        giat: 0,
        admin: 0,
        orderId: batchId
      });
    }
    const row = oneTimeRows.get(oneTimeKey);
    row[oneTimeColumn] += amount;
    if (sortDate && (!row.sortDate || sortDate < row.sortDate)) {
      row.sortDate = sortDate;
      row.date = date;
    }
  });

  const compareDateThenId = (a, b) => (
    a.sortDate.localeCompare(b.sortDate) || a.orderId.localeCompare(b.orderId)
  );
  return {
    oneTimeRows: [...oneTimeRows.values()].sort(compareDateThenId),
    monthlyRows: [...monthlyRows.values()].sort((a, b) => (
      a.periodOrder - b.periodOrder || compareDateThenId(a, b)
    )),
    unallocatedCount
  };
}

function formatStudentCardAmount(value) {
  return value ? Number(value).toLocaleString('id-ID') : '';
}

function renderStudentCardGrid(rows, fields) {
  const gridRows = Array.from({ length: STUDENT_CARD_ROW_COUNT }, () => null);
  rows.forEach((row) => {
    const rowIndex = Number(row.rowNumber) - 1;
    if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex >= STUDENT_CARD_ROW_COUNT) {
      throw new Error('Nomor baris cetak kartu tidak valid. Posisi cetak tidak diubah; silakan muat ulang.');
    }
    gridRows[rowIndex] = row;
  });
  return gridRows.map((row) => `
    <div class="spp-card-row">
      ${fields.map(({ key, align = 'amount' }) => {
        const value = row
          ? (key === 'date' ? row.date : key === 'period' ? row.period : formatStudentCardAmount(row[key]))
          : '';
        return `<span class="spp-card-cell spp-card-cell-${align}">${escapeHtml(value || '')}</span>`;
      }).join('')}
    </div>
  `).join('');
}

function studentSppCardMarkup(rows) {
  return `
    <article class="spp-card">
      <section class="spp-card-grid spp-card-grid-one-time" aria-label="Pembayaran nonbulanan">
        ${renderStudentCardGrid(rows.oneTimeRows, [
          { key: 'date', align: 'date' },
          { key: 'dpp' },
          { key: 'dps' },
          { key: 'giat' },
          { key: 'admin' },
          { key: 'ortu', align: 'blank' },
          { key: 'kkms', align: 'blank' }
        ])}
      </section>
      <section class="spp-card-grid spp-card-grid-monthly" aria-label="Pembayaran per periode">
        ${renderStudentCardGrid(rows.monthlyRows, [
          { key: 'date', align: 'date' },
          { key: 'period', align: 'period' },
          { key: 'spp' },
          { key: 'komp' },
          { key: 'giat' },
          { key: 'ortu', align: 'blank' },
          { key: 'kkms', align: 'blank' }
        ])}
      </section>
    </article>`;
}

function renderStudentSppCard(rows) {
  ui.studentCardPrintSheet.innerHTML = studentSppCardMarkup(rows);
  ui.studentCardPrintSheet.hidden = false;
  document.body.classList.add('printing-spp-card');
  window.print();
}

function studentCardPrintRowKey(section, batchId, period) {
  return `${section}|${batchId}|${period || ''}`;
}

function studentCardPrintErrorMessage(error) {
  const message = String(error && error.message || '');
  if ((error && error.code === 'PGRST202') || /could not find the function|function .* does not exist/i.test(message)) {
    return 'Fitur posisi cetak kartu belum tersedia di Supabase. Jalankan migration 020_card_print_tracking.sql dan 021_card_print_cursor.sql, lalu muat ulang aplikasi.';
  }
  return message || 'Kartu SPP gagal dimuat.';
}

function formatStudentCardOptionSummary(row, section) {
  const columns = section === 'monthly'
    ? [['SPP', row.spp], ['Komputer', row.komp], ['Kegiatan', row.giat]]
    : [['DPP', row.dpp], ['DPS', row.dps], ['Kegiatan', row.giat], ['Adm./Seragam', row.admin]];
  return columns
    .filter(([, amount]) => Number(amount) > 0)
    .map(([label, amount]) => `${label} Rp${Number(amount).toLocaleString('id-ID')}`)
    .join(' · ');
}

function renderStudentCardPrintGroup(title, section, rows, statusByKey, nextRow, selectedKeys = null) {
  const tableName = section === 'monthly' ? 'tabel periode' : 'tabel pembayaran lainnya';
  const positionLabel = nextRow > STUDENT_CARD_ROW_COUNT
    ? `Penuh · baris terakhir #${STUDENT_CARD_ROW_COUNT}`
    : `Baris berikutnya #${nextRow} · ${nextRow > 1 ? `terakhir #${nextRow - 1}` : 'belum ada cetakan'}`;
  const body = rows.length
    ? rows.map((row) => {
      const key = studentCardPrintRowKey(section, row.batchId, row.period);
      const state = statusByKey.get(key);
      const checked = selectedKeys ? selectedKeys.has(key) : !state;
      const status = state
        ? `Sudah dicetak ${state.count} kali · baris terakhir #${state.lastRow}`
        : 'Belum pernah dicetak';
      const details = formatStudentCardOptionSummary(row, section) || 'Rincian nominal tidak tersedia';
      const periodLabel = section === 'monthly' ? `Periode ${row.period}` : 'Pembayaran nonperiode';
      const index = row.optionIndex;
      return `
        <label class="card-print-option">
          <input type="checkbox" data-card-print-index="${index}"${checked ? ' checked' : ''}>
          <span class="card-print-option-copy">
            <strong>${escapeHtml(periodLabel)} <span>${escapeHtml(row.date || '-')}</span></strong>
            <small>${escapeHtml(details)}</small>
            <small class="card-print-option-status${state ? ' is-printed' : ''}">${escapeHtml(status)}</small>
            <small class="card-print-option-slot" data-card-print-slot="${index}">Tidak dipilih</small>
          </span>
        </label>`;
    }).join('')
    : '<p class="card-print-empty">Belum ada pembayaran yang dapat dicetak.</p>';

  return `
    <section class="card-print-group" aria-label="${escapeHtml(title)}">
      <div class="card-print-group-heading">
        <h3>${escapeHtml(title)}</h3>
        <div class="card-print-group-meta">
          <p data-card-cursor="${section}">${positionLabel}</p>
          <button type="button" class="secondary-button small-button" data-card-reset="${section}" aria-label="Atur baris awal ${escapeHtml(tableName)}">Atur baris awal</button>
        </div>
      </div>
      <div class="card-print-options">${body}</div>
    </section>`;
}

function renderStudentCardPrintOptions(context, printHistory, preserveSelection = false, resetSection = '') {
  const selectedKeys = new Set();
  if (preserveSelection) {
    ui.studentCardPrintOptions.querySelectorAll('[data-card-print-index]:checked').forEach((input) => {
      const row = context.rows[Number(input.dataset.cardPrintIndex)];
      if (row) selectedKeys.add(studentCardPrintRowKey(row.section, row.batchId, row.period));
    });
  }

  const statusByKey = new Map();
  const nextRows = { one_time: 1, monthly: 1 };
  printHistory.forEach((entry) => {
    const section = String(entry.section || '');
    if (!Object.prototype.hasOwnProperty.call(nextRows, section)) return;
    const nextRow = Number(entry.next_row);
    if (Number.isInteger(nextRow) && nextRow >= 1 && nextRow <= STUDENT_CARD_ROW_COUNT + 1) {
      nextRows[section] = nextRow;
    }
    if (entry.batch_id == null) return;
    const rowNumber = Number(entry.last_row || 0);
    const key = studentCardPrintRowKey(section, String(entry.batch_id || ''), String(entry.period || '').trim());
    statusByKey.set(key, {
      count: Number(entry.print_count || 0),
      lastRow: rowNumber
    });
  });

  context.statusByKey = statusByKey;
  context.nextRows = nextRows;
  const oneTimeRows = context.rows.filter((row) => row.section === 'one_time');
  const monthlyRows = context.rows.filter((row) => row.section === 'monthly');
  ui.studentCardPrintOptions.innerHTML = [
    `<div class="card-print-selection-toolbar">
      <p>Pilih semua juga mencakup transaksi yang sudah pernah dicetak.</p>
      <div class="card-print-selection-actions">
        <button type="button" class="secondary-button small-button" data-card-selection="all"${context.rows.length ? '' : ' disabled'}>Pilih semua</button>
        <button type="button" class="secondary-button small-button" data-card-selection="none"${context.rows.length ? '' : ' disabled'}>Kosongkan pilihan</button>
      </div>
    </div>`,
    renderStudentCardPrintGroup(
      'Pembayaran nonperiode',
      'one_time',
      oneTimeRows,
      statusByKey,
      nextRows.one_time,
      preserveSelection && resetSection !== 'one_time' ? selectedKeys : null
    ),
    renderStudentCardPrintGroup(
      'Pembayaran per periode',
      'monthly',
      monthlyRows,
      statusByKey,
      nextRows.monthly,
      preserveSelection && resetSection !== 'monthly' ? selectedKeys : null
    )
  ].join('');
  updateStudentCardPrintSelectionUi();
}

function updateStudentCardPrintSelectionUi() {
  const context = app.studentCardPrintContext;
  if (!context) return;

  const selected = [...ui.studentCardPrintOptions.querySelectorAll('[data-card-print-index]:checked')]
    .map((input) => context.rows[Number(input.dataset.cardPrintIndex)])
    .filter(Boolean);
  ui.studentCardPrintOptions.querySelectorAll('[data-card-selection]').forEach((button) => {
    button.disabled = !context.rows.length;
  });
  const counts = { one_time: 0, monthly: 0 };
  const scheduledRows = new Map();
  selected.forEach((row) => {
    const rowNumber = context.nextRows[row.section] + counts[row.section];
    counts[row.section] += 1;
    scheduledRows.set(row.optionIndex, rowNumber);
  });
  ui.studentCardPrintOptions.querySelectorAll('[data-card-print-slot]').forEach((slot) => {
    const rowNumber = scheduledRows.get(Number(slot.dataset.cardPrintSlot));
    slot.textContent = rowNumber
      ? (rowNumber <= STUDENT_CARD_ROW_COUNT ? `Akan dicetak di baris #${rowNumber}` : `Melebihi kapasitas · baris #${rowNumber}`)
      : 'Tidak dipilih';
  });

  const overCapacity = Object.keys(counts).some((section) => (
    context.nextRows[section] - 1 + counts[section] > STUDENT_CARD_ROW_COUNT
  ));
  const previewRows = { oneTimeRows: [], monthlyRows: [] };
  const previewCounts = { one_time: 0, monthly: 0 };
  selected.forEach((row) => {
    const section = row.section;
    const rowNumber = context.nextRows[section] + previewCounts[section];
    previewCounts[section] += 1;
    if (rowNumber <= STUDENT_CARD_ROW_COUNT) {
      previewRows[section === 'one_time' ? 'oneTimeRows' : 'monthlyRows'].push({ ...row, rowNumber });
    }
  });
  ui.studentCardPrintPreview.innerHTML = studentSppCardMarkup(previewRows);
  fitStudentCardPreview();
  ui.studentCardPrintPreviewCaption.textContent = selected.length
    ? `${selected.length} pembayaran dipilih · ${counts.one_time} nonperiode · ${counts.monthly} per periode`
    : 'Pilih pembayaran untuk melihat hasil cetak.';
  ui.studentCardPrintSubmit.disabled = !selected.length || overCapacity;
  ui.studentCardPrintSubmit.textContent = `Cetak pilihan (${selected.length})`;
  if (overCapacity) {
    ui.studentCardPrintStatus.textContent = 'Pilihan melebihi sisa baris pada salah satu tabel. Kurangi pilihan sebelum mencetak.';
    ui.studentCardPrintStatus.className = 'card-print-status is-error';
  } else if (selected.length) {
    ui.studentCardPrintStatus.textContent = 'Pratinjau menunjukkan baris yang akan diisi. Cetakan dimulai pada nomor baris berikutnya di masing-masing tabel.';
    ui.studentCardPrintStatus.className = 'card-print-status';
  } else {
    ui.studentCardPrintStatus.textContent = context.rows.length
      ? `Pilih pembayaran yang ingin dicetak. Pembayaran yang belum pernah dicetak sudah dipilih.${context.unallocatedCount ? ` ${context.unallocatedCount} transaksi lama tanpa rincian komponen tidak dapat dicetak.` : ''}`
      : `Tidak ada pembayaran dengan rincian komponen yang dapat dicetak pada tahun ajaran ini.${context.unallocatedCount ? ` ${context.unallocatedCount} transaksi lama tanpa rincian komponen tidak dapat dicetak.` : ''}`;
    ui.studentCardPrintStatus.className = 'card-print-status';
  }
}

function fitStudentCardPreview() {
  const viewport = ui.studentCardPrintPreview.closest('.card-print-preview-viewport');
  const card = ui.studentCardPrintPreview.querySelector('.spp-card');
  if (!viewport || !card || !viewport.clientWidth || !card.offsetWidth) return;
  const scale = Math.min(viewport.clientWidth / card.offsetWidth, 1);
  card.style.transform = `scale(${scale})`;
}

async function loadStudentCardPrintStatus(student, year) {
  const credentials = app.cardPrintCredentials;
  if (!credentials) throw new Error('Sesi login tidak tersedia untuk menyimpan posisi cetak bersama. Silakan masuk kembali.');
  const { data, error } = await app.supabase.rpc('get_spp_card_print_state_v2', {
    p_username: credentials.username,
    p_password: credentials.password,
    p_id_siswa: student.id,
    p_nospp: student.nospp,
    p_kdsek: student.kdsek,
    p_tahun_ajaran: year
  });
  if (error) throw error;
  return data || [];
}

async function resetStudentCardPrintPosition(section) {
  const context = app.studentCardPrintContext;
  const credentials = app.cardPrintCredentials;
  if (!context || !credentials) return;

  const tableName = section === 'monthly' ? 'tabel periode' : 'tabel pembayaran nonperiode';
  const confirmed = window.confirm(
    `Atur ulang posisi ${tableName} untuk ${context.student.nama || context.student.nospp}? ` +
    'Ini memulai putaran cetak baru. Riwayat cetak sebelumnya tetap tersimpan.'
  );
  if (!confirmed) return;
  const rowInput = window.prompt(
    `Masukkan nomor BARIS BERIKUTNYA untuk ${tableName} (1–${STUDENT_CARD_ROW_COUNT}).`,
    String(Math.min(context.nextRows[section] || 1, STUDENT_CARD_ROW_COUNT))
  );
  if (rowInput === null) return;
  const rowValue = rowInput.trim();
  if (!/^(?:[1-9]|1[0-6])$/.test(rowValue)) {
    window.alert(`Nomor baris harus berupa angka 1 sampai ${STUDENT_CARD_ROW_COUNT}.`);
    return;
  }
  const nextRow = Number(rowValue);
  if (!window.confirm(
    `Konfirmasi posisi ${tableName}: pembayaran terpilih berikutnya dimulai dari baris #${nextRow}. ` +
    'Transaksi pada putaran baru akan tersedia untuk dipilih kembali.'
  )) return;

  ui.studentCardPrintStatus.textContent = `Mereset posisi ${tableName}…`;
  ui.studentCardPrintStatus.className = 'card-print-status';
  ui.studentCardPrintSubmit.disabled = true;
  ui.studentCardPrintOptions.querySelectorAll('[data-card-reset]').forEach((button) => { button.disabled = true; });
  try {
    const { error } = await app.supabase.rpc('reset_spp_card_print_position_v2', {
      p_username: credentials.username,
      p_password: credentials.password,
      p_id_siswa: context.student.id,
      p_nospp: context.student.nospp,
      p_kdsek: context.student.kdsek,
      p_tahun_ajaran: context.range.year,
      p_section: section,
      p_next_row: nextRow
    });
    if (error) throw error;

    const printHistory = await loadStudentCardPrintStatus(context.student, context.range.year);
    renderStudentCardPrintOptions(context, printHistory, true, section);
    ui.studentCardPrintStatus.textContent = `Posisi ${tableName} diatur. Pembayaran yang dipilih dimulai dari baris #${nextRow}; riwayat cetak lama tetap tersimpan.`;
    ui.studentCardPrintStatus.className = 'card-print-status is-success';
  } catch (error) {
    console.error('Unable to reset SPP card print position:', error);
    ui.studentCardPrintOptions.querySelectorAll('[data-card-reset]').forEach((button) => { button.disabled = false; });
    updateStudentCardPrintSelectionUi();
    ui.studentCardPrintStatus.textContent = studentCardPrintErrorMessage(error);
    ui.studentCardPrintStatus.className = 'card-print-status is-error';
  }
}

async function openStudentCardPrintDialog(candidate) {
  if (!app.user) {
    alert('Silakan masuk terlebih dahulu untuk mencetak kartu SPP.');
    return;
  }
  if (!app.server || !app.cardPrintCredentials) {
    alert('Cetak kartu dengan posisi bersama memerlukan koneksi Supabase aktif. Silakan masuk kembali setelah migration cetak kartu diterapkan.');
    return;
  }
  const currentStudent = app.state.siswa.find((row) => (
    String(row.nospp || '') === String(candidate.nospp || '')
    && String(row.kdsek || '') === String(candidate.kdsek || '')
  ));
  const student = {
    id: String(candidate.id || candidate.id_siswa || (currentStudent && currentStudent.id) || ''),
    nospp: String(candidate.nospp || (currentStudent && currentStudent.nospp) || '').trim(),
    kdsek: String(candidate.kdsek || (currentStudent && currentStudent.kdsek) || '').trim(),
    nama: String(candidate.nama || (currentStudent && currentStudent.nama) || '').trim(),
    kdkls: String(candidate.kdkls || (currentStudent && currentStudent.kdkls) || '').trim()
  };
  if (!student.nospp || !student.kdsek) {
    alert('Identitas siswa belum lengkap untuk mencetak kartu SPP.');
    return;
  }
  if (app.user.role === 'unit' && student.kdsek !== app.user.unit) {
    alert('Anda tidak memiliki akses ke kartu siswa dari unit lain.');
    return;
  }

  if (!student.id) {
    alert('ID siswa tidak tersedia untuk menyimpan posisi cetak bersama.');
    return;
  }

  ui.studentCardPrintStudent.textContent = `${student.nama || 'Siswa'} · No. SPP ${student.nospp} · Tahun ajaran ${currentYearScope() || currentAcademicYear()}`;
  ui.studentCardPrintStatus.textContent = 'Memuat transaksi dan posisi cetak bersama…';
  ui.studentCardPrintStatus.className = 'card-print-status';
  ui.studentCardPrintOptions.innerHTML = '<p class="card-print-loading">Memuat daftar pembayaran…</p>';
  ui.studentCardPrintPreview.replaceChildren();
  ui.studentCardPrintPreviewCaption.textContent = 'Memuat pratinjau kartu…';
  ui.studentCardPrintSubmit.disabled = true;
  ui.studentCardPrintSubmit.textContent = 'Memuat…';
  app.studentCardPrintContext = null;
  if (!ui.studentCardPrintDialog.open) ui.studentCardPrintDialog.showModal();

  try {
    const range = getStudentCardAcademicYearRange();
    const [items, printHistory] = await Promise.all([
      loadStudentCardTransactions(student, range),
      loadStudentCardPrintStatus(student, range.year)
    ]);
    const firstItem = items[0] || {};
    student.nama = student.nama || firstItem.nama || '';
    student.kdkls = student.kdkls || firstItem.kdkls || '';
    const rowGroups = buildStudentCardRows(items);
    const rows = [...rowGroups.oneTimeRows, ...rowGroups.monthlyRows];
    rows.forEach((row, index) => { row.optionIndex = index; });
    app.studentCardPrintContext = {
      student,
      range,
      rows,
      nextRows: { one_time: 1, monthly: 1 },
      statusByKey: new Map(),
      unallocatedCount: rowGroups.unallocatedCount
    };

    renderStudentCardPrintOptions(app.studentCardPrintContext, printHistory);
  } catch (error) {
    console.error('Unable to load SPP card print options:', error);
    ui.studentCardPrintStatus.textContent = studentCardPrintErrorMessage(error);
    ui.studentCardPrintStatus.className = 'card-print-status is-error';
    ui.studentCardPrintPreviewCaption.textContent = 'Pratinjau tersedia setelah transaksi dan posisi cetak berhasil dimuat.';
    ui.studentCardPrintOptions.replaceChildren();
    ui.studentCardPrintSubmit.disabled = true;
    ui.studentCardPrintSubmit.textContent = 'Cetak pilihan';
  }
}

async function submitStudentCardPrint() {
  const context = app.studentCardPrintContext;
  if (!context) return;
  const selected = [...ui.studentCardPrintOptions.querySelectorAll('[data-card-print-index]:checked')]
    .map((input) => context.rows[Number(input.dataset.cardPrintIndex)])
    .filter(Boolean);
  if (!selected.length) return;

  const credentials = app.cardPrintCredentials;
  if (!credentials) {
    ui.studentCardPrintStatus.textContent = 'Sesi login tidak tersedia. Silakan masuk kembali sebelum mencetak.';
    ui.studentCardPrintStatus.className = 'card-print-status is-error';
    return;
  }

  ui.studentCardPrintSubmit.disabled = true;
  ui.studentCardPrintSubmit.textContent = 'Menyimpan posisi…';
  ui.studentCardPrintStatus.textContent = 'Mengunci baris berikutnya di Supabase…';
  ui.studentCardPrintStatus.className = 'card-print-status';
  try {
    const requestRows = selected.map((row) => {
      const state = context.statusByKey.get(studentCardPrintRowKey(row.section, row.batchId, row.period));
      return {
        section: row.section,
        batch_id: row.batchId,
        period: row.period || null,
        reprint: Boolean(state)
      };
    });
    const { data, error } = await app.supabase.rpc('reserve_spp_card_print_rows_v2', {
      p_username: credentials.username,
      p_password: credentials.password,
      p_id_siswa: context.student.id,
      p_nospp: context.student.nospp,
      p_kdsek: context.student.kdsek,
      p_tahun_ajaran: context.range.year,
      p_rows: requestRows,
      p_expected_one_time_next_row: selected.some((row) => row.section === 'one_time')
        ? context.nextRows.one_time : null,
      p_expected_monthly_next_row: selected.some((row) => row.section === 'monthly')
        ? context.nextRows.monthly : null
    });
    if (error && error.code === '40001') {
      const printHistory = await loadStudentCardPrintStatus(context.student, context.range.year);
      renderStudentCardPrintOptions(context, printHistory, true);
      ui.studentCardPrintStatus.textContent = 'Posisi cetak berubah karena ada proses lain. Pratinjau sudah diperbarui; periksa kembali sebelum mencetak.';
      ui.studentCardPrintStatus.className = 'card-print-status is-warning';
      return;
    }
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== selected.length) {
      throw new Error('Posisi cetak tidak lengkap dikembalikan Supabase. Muat ulang sebelum mencoba lagi.');
    }

    const printedRows = { oneTimeRows: [], monthlyRows: [] };
    const historyUpdates = [];
    selected.forEach((row, index) => {
      const assignment = data.find((entry) => Number(entry.request_index) === index + 1);
      if (!assignment || Number(assignment.row_no) < 1 || Number(assignment.row_no) > STUDENT_CARD_ROW_COUNT) {
        throw new Error('Supabase mengembalikan nomor baris kartu yang tidak valid.');
      }
      const rowNumber = Number(assignment.row_no);
      const key = studentCardPrintRowKey(row.section, row.batchId, row.period);
      const previousState = context.statusByKey.get(key);
      historyUpdates.push({
        key,
        row,
        rowNumber,
        count: (previousState ? previousState.count : 0) + 1
      });
      const assignedRow = { ...row, rowNumber };
      printedRows[row.section === 'one_time' ? 'oneTimeRows' : 'monthlyRows'].push(assignedRow);
    });
    historyUpdates.forEach(({ key, row, rowNumber, count }) => {
      context.statusByKey.set(key, { count, lastRow: rowNumber });
      context.nextRows[row.section] = Math.max(context.nextRows[row.section], rowNumber + 1);
    });
    renderStudentSppCard(printedRows);
  } catch (error) {
    console.error('Unable to reserve SPP card print rows:', error);
    ui.studentCardPrintStatus.textContent = studentCardPrintErrorMessage(error);
    ui.studentCardPrintStatus.className = 'card-print-status is-error';
    ui.studentCardPrintSubmit.disabled = false;
    updateStudentCardPrintSelectionUi();
  }
}

function normalizeSupabasePaymentBatch(row) {
  return {
    ...row,
    id: String(row.id),
    nominal: Number(row.nominal || 0),
    bos_nominal: Number(row.bos_nominal || 0),
    parent_nominal: Number(row.parent_nominal ?? row.nominal ?? 0),
    item_count: Number(row.item_count || 0),
    student_count: Number(row.student_count || 0)
  };
}

function getLocalPaymentBatches() {
  const batches = new Map();
  getAccessibleTransactionRows(true).forEach((item) => {
    const id = String(item.batch_id || item.id);
    if (!batches.has(id)) {
      batches.set(id, {
        ...item,
        id,
        receipt_no: item.receipt_no || `LEGACY-${item.id}`,
        source: item.source || 'legacy',
        created_at: item.created_at || item.tglbyr,
        items: [],
        nominal: 0,
        bos_nominal: 0,
        parent_nominal: 0,
        item_count: 0,
        student_count: 1
      });
    }
    const batch = batches.get(id);
    batch.items.push(item);
    const amount = Number(item.nominal || 0);
    const isBosItem = item.source === 'bos' || item.component === 'spp_bos';
    batch.nominal += amount;
    if (isBosItem) batch.bos_nominal += amount;
    else batch.parent_nominal += amount;
    batch.item_count += 1;
    if (item.voided_at) Object.assign(batch, {
      voided_at: item.voided_at,
      void_reason: item.void_reason,
      correction_no: item.correction_no,
      correction_created_at: item.correction_created_at,
      correction_operator_code: item.correction_operator_code
    });
  });
  return [...batches.values()];
}

function getPaymentSourceLabel(source) {
  return ({
    manual: 'Manual',
    upload: 'Impor',
    bos: 'BOS',
    legacy: 'Riwayat lama'
  })[source] || 'Tidak diketahui';
}

function getPaymentBatchSourceLabel(batch) {
  const source = getPaymentSourceLabel(batch.source);
  return batch.source !== 'bos' && Number(batch.bos_nominal || 0) > 0
    ? `${source} + BOS`
    : source;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' });
}

function getDailyPaymentSummaryRows(summary) {
  return [
    ['Manual', summary.manual_transaksi, Number(summary.manual || 0)],
    ['Impor', summary.upload_transaksi, Number(summary.upload || 0)],
    ['BOS · pengurang penerimaan orang tua', summary.bos_transaksi, -Number(summary.bos || 0)],
    ['Riwayat lama · sumber belum tercatat', summary.legacy_transaksi, Number(summary.legacy || 0)]
  ];
}

function renderDailyPaymentSummary(summary) {
  const rows = getDailyPaymentSummaryRows(summary);
  ui.dailyPaymentSummary.innerHTML = rows.map(([label, count, amount]) => `
    <tr>
      <th>${escapeHtml(label)}</th>
      <td>${Number(count || 0).toLocaleString('id-ID')}</td>
      <td>${formatRupiah(amount)}</td>
    </tr>
  `).join('');
  ui.dailyPaymentSummaryTotal.innerHTML = `
    <tr class="net-row">
      <th colspan="2">Net setelah alokasi BOS</th>
      <th>${formatRupiah(Number(summary.net_orang_tua || 0))}</th>
    </tr>`;
  ui.dailyPaymentSummaryStatus.textContent = '';
}

const PAYMENT_RECEIPT_CATEGORIES = [
  { key: 'sppKomp', label: 'SPP + Komputer' },
  { key: 'dpp', label: 'DPP' },
  { key: 'dps', label: 'DPS' },
  { key: 'seragam', label: 'Seragam' },
  { key: 'giat', label: 'Kegiatan' },
  { key: 'bos', label: 'Potongan BOS' },
  { key: 'lainnya', label: 'Lainnya' }
];
const DAILY_PAYMENT_LEDGER_COLUMN_COUNT = 14;

function getPaymentReceiptAllocations(item, source) {
  const component = String(item.component || 'legacy');
  const amount = Math.abs(Number(item.nominal || 0));
  if (!amount) return [];
  if (source === 'bos') return [{ category: 'bos', amount }];
  if (component === 'spp_bos') {
    return [{ category: 'sppKomp', amount }, { category: 'bos', amount }];
  }
  if (['spp', 'komp', 'spp_tl', 'komp_tl'].includes(component)) {
    return [{ category: 'sppKomp', amount }];
  }
  if (['dpp', 'dpp_tl'].includes(component)) return [{ category: 'dpp', amount }];
  if (component === 'dsp') return [{ category: 'dps', amount }];
  if (component === 'seragam') return [{ category: 'seragam', amount }];
  if (component === 'giat') return [{ category: 'giat', amount }];
  return [{ category: 'lainnya', amount }];
}

function formatPaymentPeriodSpan(periods) {
  const sorted = [...new Set(periods.filter((period) => /^(0[1-9]|1[0-2])\d{4}$/.test(period)))]
    .sort((a, b) => paymentPeriodSequence(a) - paymentPeriodSequence(b));
  if (!sorted.length) return '';
  if (sorted.length === 1) return formatPeriodLabel(sorted[0]);
  const firstSequence = paymentPeriodSequence(sorted[0]);
  const lastSequence = paymentPeriodSequence(sorted[sorted.length - 1]);
  if (lastSequence - firstSequence + 1 !== sorted.length) {
    return sorted.map(formatPeriodLabel).join(', ');
  }
  const firstYear = sorted[0].slice(2);
  const lastYear = sorted[sorted.length - 1].slice(2);
  if (firstYear === lastYear) {
    const firstMonth = formatPeriodLabel(sorted[0]).replace(/\s+\d{4}$/, '');
    const lastMonth = formatPeriodLabel(sorted[sorted.length - 1]).replace(/\s+\d{4}$/, '');
    return `${firstMonth} s.d. ${lastMonth} ${lastYear} (${sorted.length} bulan)`;
  }
  return `${formatPeriodLabel(sorted[0])} s.d. ${formatPeriodLabel(sorted[sorted.length - 1])} (${sorted.length} bulan)`;
}

function getPaymentReceiptRows(items, batchSource = '') {
  const rows = PAYMENT_RECEIPT_CATEGORIES.map((category) => ({
    ...category,
    amount: 0,
    periods: [],
    activityAllocations: new Map()
  }));
  const byCategory = new Map(rows.map((row) => [row.key, row]));
  items.forEach((item) => {
    const source = item.source || batchSource || 'legacy';
    getPaymentReceiptAllocations(item, source).forEach(({ category, amount }) => {
      const row = byCategory.get(category);
      if (!row) return;
      row.amount += amount;
      if (item.periode) row.periods.push(String(item.periode));
      if (category === 'giat' && Array.isArray(item.activity_allocations)) {
        item.activity_allocations.forEach((allocation) => {
          const year = String(allocation.tahun_ajaran || '');
          const nominal = Number(allocation.nominal || 0);
          if (year && nominal > 0) {
            row.activityAllocations.set(year, (row.activityAllocations.get(year) || 0) + nominal);
          }
        });
      }
    });
  });
  return rows.map((row) => {
    const activityDetails = [...row.activityAllocations.entries()]
      .sort(([yearA], [yearB]) => yearA.localeCompare(yearB))
      .map(([year, nominal]) => `TA ${year}: ${formatRupiah(nominal)}`);
    return {
      ...row,
      detail: activityDetails.length
        ? activityDetails.join(' · ')
        : formatPaymentPeriodSpan(row.periods) || '-'
    };
  });
}

function getDailyPaymentLedgerRows(items) {
  const groups = new Map();
  items.forEach((item) => {
    const batchId = String(item.batch_id || item.receipt_no || item.id || '');
    const studentId = String(item.id_siswa || item.nospp || item.nama || 'tanpa-siswa');
    const key = `${batchId}|${studentId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        batchId,
        receiptNo: item.receipt_no || `LEGACY-${batchId}`,
        date: item.tglbyr || '',
        studentId,
        studentName: item.nama || 'Siswa',
        schoolCode: item.kdsek || '',
        className: item.kdkls || '',
        sources: new Set(),
        notes: new Set(),
        amounts: Object.fromEntries(PAYMENT_RECEIPT_CATEGORIES.map(({ key: category }) => [category, 0])),
        periods: Object.fromEntries(PAYMENT_RECEIPT_CATEGORIES.map(({ key: category }) => [category, []]))
      });
    }
    const row = groups.get(key);
    const source = item.source || 'legacy';
    row.sources.add(source);
    if (item.notes || item.ket) row.notes.add(String(item.notes || item.ket).trim());
    const student = app.state.siswa.find((candidate) => (
      String(candidate.id_siswa || '') === studentId
      || String(candidate.nospp || '') === String(item.nospp || '')
    ));
    if (!row.className && student?.kdkls) row.className = student.kdkls;
    if (row.studentName === 'Siswa' && student?.nama) row.studentName = student.nama;
    if (!row.schoolCode) row.schoolCode = item.kdsek || student?.kdsek || '';

    getPaymentReceiptAllocations(item, source).forEach(({ category, amount }) => {
      row.amounts[category] += amount;
      if (item.periode) row.periods[category].push(String(item.periode));
    });
  });

  return [...groups.values()].map((row) => {
      const amounts = {
        sppKomp: row.amounts.sppKomp,
        dpp: row.amounts.dpp,
        dps: row.amounts.dps,
        seragam: row.amounts.seragam,
        giat: row.amounts.giat,
        bos: -row.amounts.bos,
        lainnya: row.amounts.lainnya
      };
      const totalReceived = Object.entries(amounts)
        .reduce((total, [category, amount]) => total + (category === 'bos' ? amount : Math.abs(amount)), 0);
      const periodDetails = PAYMENT_RECEIPT_CATEGORIES
        .map(({ key, label }) => {
          const span = formatPaymentPeriodSpan(row.periods[key]);
          return span ? `${label}: ${span}` : '';
        })
        .filter(Boolean);
      const sourceDetails = [...row.sources].map(getPaymentSourceLabel);
      return {
        ...row,
        schoolName: getSchoolName(row.schoolCode),
        ...amounts,
        totalReceived,
        notes: [...new Set([...sourceDetails, ...periodDetails, ...row.notes])].join(' · ') || '-'
      };
    });
}

function getDailyPaymentLedgerTotals(rows) {
  return rows.reduce((totals, row) => {
    PAYMENT_RECEIPT_CATEGORIES.forEach(({ key }) => {
      totals[key] += row[key];
    });
    totals.totalReceived += row.totalReceived;
    return totals;
  }, {
    ...Object.fromEntries(PAYMENT_RECEIPT_CATEGORIES.map(({ key }) => [key, 0])),
    totalReceived: 0
  });
}

function renderDailyPaymentBreakdown(items) {
  const rows = getDailyPaymentLedgerRows(items);
  const cellAmount = (value) => `<td>${formatReportAmount(value)}</td>`;
  ui.dailyPaymentBreakdown.innerHTML = rows.length
    ? rows.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatLongDate(row.date))}</td>
        <td>${escapeHtml(row.receiptNo)}</td>
        <td>${escapeHtml(row.studentName)}</td>
        <td>${escapeHtml(row.className || '-')}</td>
        ${cellAmount(row.sppKomp)}
        ${cellAmount(row.dpp)}
        ${cellAmount(row.dps)}
        ${cellAmount(row.seragam)}
        ${cellAmount(row.giat)}
        <td class="cash-bos-amount">${formatReportAmount(row.bos)}</td>
        ${cellAmount(row.lainnya)}
        <td class="cash-total-amount">${formatRupiah(row.totalReceived)}</td>
        <td>${escapeHtml(row.notes)}</td>
      </tr>
    `).join('')
    : `<tr><td colspan="${DAILY_PAYMENT_LEDGER_COLUMN_COUNT}" class="empty-state">Tidak ada transaksi pada tanggal ini.</td></tr>`;

  const totals = getDailyPaymentLedgerTotals(rows);
  ui.dailyPaymentBreakdownTotal.innerHTML = rows.length ? `
    <tr>
      <th colspan="5">TOTAL PENERIMAAN</th>
      <th>${formatReportAmount(totals.sppKomp)}</th>
      <th>${formatReportAmount(totals.dpp)}</th>
      <th>${formatReportAmount(totals.dps)}</th>
      <th>${formatReportAmount(totals.seragam)}</th>
      <th>${formatReportAmount(totals.giat)}</th>
      <th class="cash-bos-amount">${formatReportAmount(totals.bos)}</th>
      <th>${formatReportAmount(totals.lainnya)}</th>
      <th class="cash-total-amount">${formatReportAmount(totals.totalReceived)}</th>
      <th></th>
    </tr>` : '';
}

function formatReportAmount(value) {
  return Number(value || 0) === 0 ? '-' : formatRupiah(value);
}

let dailyPaymentSummaryData = null;
let dailyPaymentBreakdownData = null;
let dailyPaymentSummaryFetchSeq = 0;

function indonesianNumberWords(value) {
  const number = Math.floor(Math.abs(Number(value) || 0));
  const units = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan'];
  const spell = (amount) => {
    if (amount === 0) return '';
    if (amount < 10) return units[amount];
    if (amount < 12) return amount === 10 ? 'sepuluh' : 'sebelas';
    if (amount < 20) return `${spell(amount - 10)} belas`;
    if (amount < 100) return `${spell(Math.floor(amount / 10))} puluh ${spell(amount % 10)}`.trim();
    if (amount < 200) return `seratus ${spell(amount - 100)}`.trim();
    if (amount < 1000) return `${spell(Math.floor(amount / 100))} ratus ${spell(amount % 100)}`.trim();
    if (amount < 2000) return `seribu ${spell(amount - 1000)}`.trim();
    if (amount < 1000000) return `${spell(Math.floor(amount / 1000))} ribu ${spell(amount % 1000)}`.trim();
    if (amount < 1000000000) return `${spell(Math.floor(amount / 1000000))} juta ${spell(amount % 1000000)}`.trim();
    if (amount < 1000000000000) {
      return `${spell(Math.floor(amount / 1000000000))} miliar ${spell(amount % 1000000000)}`.trim();
    }
    return `${number.toLocaleString('id-ID')} rupiah`;
  };
  const words = spell(number).replace(/\s+/g, ' ').trim() || 'nol';
  return `${Number(value) < 0 ? 'minus ' : ''}${words} rupiah`;
}

function printDailyCashReport() {
  if (!dailyPaymentSummaryData || !dailyPaymentBreakdownData || !ui.dailyPaymentDate.value) {
    ui.dailyPaymentSummaryStatus.textContent = 'Muat rekap dan rincian tanggal terlebih dahulu sebelum mencetak.';
    return;
  }
  const date = ui.dailyPaymentDate.value;
  const schoolLabel = (row) => row.schoolName && row.schoolName !== '-'
    ? row.schoolName
    : (row.schoolCode ? `Sekolah ${row.schoolCode}` : 'Sekolah belum terdaftar');
  const rows = getDailyPaymentLedgerRows(dailyPaymentBreakdownData).sort((a, b) => (
    schoolLabel(a).localeCompare(schoolLabel(b), 'id', { numeric: true, sensitivity: 'base' })
    || String(a.schoolCode || '').localeCompare(String(b.schoolCode || ''), 'id', { numeric: true, sensitivity: 'base' })
    || String(a.className || '').localeCompare(String(b.className || ''), 'id', { numeric: true, sensitivity: 'base' })
    || String(a.studentName || '').localeCompare(String(b.studentName || ''), 'id', { sensitivity: 'base' })
    || String(a.receiptNo || '').localeCompare(String(b.receiptNo || ''), 'id', { numeric: true, sensitivity: 'base' })
  ));
  const totals = getDailyPaymentLedgerTotals(rows);
  let previousSchool = null;
  const itemRows = rows.map((row, index) => {
    const schoolName = schoolLabel(row);
    const schoolKey = `${row.schoolCode || ''}|${schoolName}`;
    const schoolHeading = schoolKey !== previousSchool
      ? `<tr class="cash-school-group"><th colspan="${DAILY_PAYMENT_LEDGER_COLUMN_COUNT}">Sekolah: ${escapeHtml(schoolName)}</th></tr>`
      : '';
    previousSchool = schoolKey;
    return `${schoolHeading}
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(formatLongDate(row.date))}</td>
        <td>${escapeHtml(row.receiptNo)}</td>
        <td>${escapeHtml(row.studentName)}</td>
        <td>${escapeHtml(row.className || '-')}</td>
        <td>${formatReportAmount(row.sppKomp)}</td>
        <td>${formatReportAmount(row.dpp)}</td>
        <td>${formatReportAmount(row.dps)}</td>
        <td>${formatReportAmount(row.seragam)}</td>
        <td>${formatReportAmount(row.giat)}</td>
        <td class="cash-bos-amount">${formatReportAmount(row.bos)}</td>
        <td>${formatReportAmount(row.lainnya)}</td>
        <td class="cash-total-amount">${formatReportAmount(row.totalReceived)}</td>
        <td>${escapeHtml(row.notes)}</td>
      </tr>`;
  }).join('');
  const printedAt = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
  const cashTotal = Number(dailyPaymentSummaryData.net_orang_tua || 0);
  const sourceSummary = getDailyPaymentSummaryRows(dailyPaymentSummaryData)
    .map(([label, count, amount]) => `${label}: ${Number(count || 0).toLocaleString('id-ID')} transaksi, ${formatRupiah(amount)}`)
    .join(' · ');
  const accountSummaryRows = [
    ['SPP + Komputer', totals.sppKomp, 'Penerimaan rutin bulanan'],
    ['DPP (Dana Pengembangan Pendidikan)', totals.dpp, 'Dana pengembangan siswa'],
    ['DPS (Dana Pembangunan Sekolah)', totals.dps, 'Dana pembangunan sekolah'],
    ['Seragam', totals.seragam, 'Pembayaran seragam sekolah'],
    ['Kegiatan', totals.giat, 'Dana kegiatan siswa dan ujian'],
    ['Lainnya', totals.lainnya, 'Pembayaran lain-lain'],
    ['Potongan BOS (Pengurang)', Math.abs(totals.bos), 'Subsidi dana BOS']
  ].map(([label, amount, description]) => `
    <tr><td>${escapeHtml(label)}</td><td>${formatReportAmount(amount)}</td><td>${escapeHtml(description)}</td></tr>
  `).join('');

  ui.dailyCashPrintSheet.innerHTML = `
    <article class="print-cash-report">
      <header class="cash-report-header">
        <div>
          <h1>LAPORAN PENERIMAAN PEMBAYARAN SPP &amp; BIAYA SEKOLAH</h1>
          <p>Yayasan Santo Dominikus Cimahi · Semua sekolah · Tanggal: ${escapeHtml(formatLongDate(date))}</p>
        </div>
        <dl>
          <dt>No.</dt><dd>LKH-${escapeHtml(date.replace(/-/g, ''))}</dd>
          <dt>Dicetak</dt><dd>${escapeHtml(printedAt)}</dd>
        </dl>
      </header>
      <p class="cash-report-sources"><strong>Sumber:</strong> ${escapeHtml(sourceSummary)}</p>
      <table>
        <thead><tr>
          <th>No.</th><th>Tanggal</th><th>No. Kwitansi</th><th>Nama Siswa</th><th>Kelas</th>
          <th>SPP + Komp<br>(Rp)</th><th>DPP<br>(Rp)</th><th>DPS<br>(Rp)</th><th>Seragam<br>(Rp)</th>
          <th>Kegiatan<br>(Rp)</th><th>Potongan BOS<br>(Rp)</th><th>Lainnya<br>(Rp)</th>
          <th>Total Diterima<br>(Rp)</th><th>Keterangan</th>
        </tr></thead>
        <tbody>${itemRows || `<tr><td colspan="${DAILY_PAYMENT_LEDGER_COLUMN_COUNT}">Tidak ada transaksi pada tanggal ini.</td></tr>`}</tbody>
        <tfoot>
          <tr><th colspan="5">TOTAL PENERIMAAN</th>
            <th>${formatReportAmount(totals.sppKomp)}</th><th>${formatReportAmount(totals.dpp)}</th>
            <th>${formatReportAmount(totals.dps)}</th><th>${formatReportAmount(totals.seragam)}</th>
            <th>${formatReportAmount(totals.giat)}</th><th class="cash-bos-amount">${formatReportAmount(totals.bos)}</th>
            <th>${formatReportAmount(totals.lainnya)}</th><th class="cash-total-amount">${formatReportAmount(cashTotal)}</th><th></th>
          </tr>
        </tfoot>
      </table>
      <section class="print-account-summary">
        <h2>REKAPITULASI PENERIMAAN PER POS AKUN</h2>
        <table>
          <thead><tr><th>Pos Penerimaan / Pengurang</th><th>Total Nominal (Rp)</th><th>Keterangan</th></tr></thead>
          <tbody>${accountSummaryRows}</tbody>
          <tfoot><tr><th>TOTAL KAS BERSIH DITERIMA</th><th>${formatReportAmount(cashTotal)}</th><th>Cocok dengan total diterima</th></tr></tfoot>
        </table>
      </section>
    </article>`;
  ui.dailyCashPrintSheet.hidden = false;
  document.body.classList.add('printing-daily-cash');
  window.print();
}

async function fetchDailyPaymentSummary() {
  if (!ui.dailyPaymentDate || !app.user || app.user.role === 'unit') return;
  const seq = ++dailyPaymentSummaryFetchSeq;
  dailyPaymentSummaryData = null;
  dailyPaymentBreakdownData = null;
  ui.dailyCashPrint.disabled = true;
  if (!ui.dailyPaymentDate.value) ui.dailyPaymentDate.value = localDateInputValue();
  ui.dailyPaymentSummaryStatus.textContent = 'Memuat rekap...';
  ui.dailyPaymentSummary.innerHTML = '<tr><td colspan="3" class="empty-state">Memuat rekap...</td></tr>';
  ui.dailyPaymentSummaryTotal.replaceChildren();
  ui.dailyPaymentBreakdownTotal.replaceChildren();
  ui.dailyPaymentBreakdown.innerHTML = `<tr><td colspan="${DAILY_PAYMENT_LEDGER_COLUMN_COUNT}" class="empty-state">Memuat rincian...</td></tr>`;
  try {
    let summary;
    let detailItems;
    if (app.server) {
      if (!app.dashboardCredentials) throw new Error('Silakan keluar lalu masuk kembali sebagai Admin atau Yayasan.');
      const { data, error } = await app.supabase.rpc('spp_app_daily_payment_summary_v1', {
        p_username: app.dashboardCredentials.username,
        p_password: app.dashboardCredentials.password,
        p_tanggal: ui.dailyPaymentDate.value
      });
      if (error) throw error;
      summary = data;
      const pageSize = 1000;
      detailItems = [];
      for (let from = 0; ; from += pageSize) {
        const { data: page, error: detailError } = await app.supabase
          .from('spp_app_payment_batch_items')
          .select('batch_id,receipt_no,tglbyr,id_siswa,nospp,nama,kdsek,kdkls,source,component,periode,nominal,notes,voided_at')
          .eq('tglbyr', ui.dailyPaymentDate.value)
          .is('voided_at', null)
          .order('payment_id')
          .range(from, from + pageSize - 1);
        if (detailError) throw detailError;
        detailItems.push(...(page || []));
        if (!page || page.length < pageSize) break;
      }
    } else {
      const daily = getLocalPaymentBatches().filter((batch) => (
        batch.tglbyr === ui.dailyPaymentDate.value && !batch.voided_at
      ));
      summary = { manual: 0, upload: 0, bos: 0, legacy: 0, manual_transaksi: 0,
        upload_transaksi: 0, bos_transaksi: 0, legacy_transaksi: 0 };
      daily.forEach((batch) => {
        const source = ['manual', 'upload', 'bos', 'legacy'].includes(batch.source) ? batch.source : 'legacy';
        summary[source] += Number(batch.nominal || 0);
        summary[`${source}_transaksi`] += 1;
        if (source !== 'bos' && Number(batch.bos_nominal || 0) > 0) {
          summary.bos += Number(batch.bos_nominal || 0);
          summary.bos_transaksi += 1;
        }
      });
      summary.net_orang_tua = summary.manual + summary.upload + summary.legacy - summary.bos;
      detailItems = daily.flatMap((batch) => (batch.items || []).map((item) => ({
        ...item,
        batch_id: batch.id,
        receipt_no: batch.receipt_no,
        tglbyr: batch.tglbyr,
        id_siswa: item.id_siswa || batch.id_siswa,
        nama: item.nama || batch.nama,
        kdkls: item.kdkls || batch.kdkls,
        source: batch.source,
        notes: item.notes || item.ket || batch.notes || ''
      })));
    }
    if (seq !== dailyPaymentSummaryFetchSeq) return;
    dailyPaymentSummaryData = summary || {};
    dailyPaymentBreakdownData = detailItems || [];
    renderDailyPaymentSummary(dailyPaymentSummaryData);
    renderDailyPaymentBreakdown(dailyPaymentBreakdownData);
    ui.dailyCashPrint.disabled = false;
  } catch (error) {
    if (seq !== dailyPaymentSummaryFetchSeq) return;
    ui.dailyPaymentSummary.innerHTML = `<tr><td colspan="3" class="empty-state">Rekap gagal dimuat: ${escapeHtml(error.message || 'Kesalahan tidak diketahui.')}</td></tr>`;
    ui.dailyPaymentBreakdown.innerHTML = `<tr><td colspan="${DAILY_PAYMENT_LEDGER_COLUMN_COUNT}" class="empty-state">Rincian gagal dimuat: ${escapeHtml(error.message || 'Kesalahan tidak diketahui.')}</td></tr>`;
    ui.dailyPaymentBreakdownTotal.replaceChildren();
    ui.dailyPaymentSummaryStatus.textContent = 'Pastikan migration 018 sudah dijalankan dan akun memiliki akses Admin/Yayasan.';
  }
}

const USER_ROLE_OPTIONS = [
  ['superadmin', 'Admin'],
  ['yayasan', 'Yayasan'],
  ['unit', 'Unit']
];

function populateNewUserSchoolOptions() {
  const activeSchools = app.state.schools.filter((school) => school.active !== false);
  ui.newUserSchool.innerHTML = activeSchools.map((school) => (
    `<option value="${escapeHtml(school.kdsek)}">${escapeHtml(school.nmsek)}</option>`
  )).join('') || '<option value="">Belum ada sekolah aktif</option>';
  ui.newUserSchool.disabled = activeSchools.length === 0;
  updateNewUserSchoolVisibility();
}

function updateNewUserSchoolVisibility() {
  const isUnit = ui.newUserRole.value === 'unit';
  ui.newUserSchoolField.hidden = !isUnit;
  ui.newUserSchool.required = isUnit;
}

function renderUserAccounts() {
  const schools = app.state.schools;
  const currentUserId = normalizeLoginValue(app.user?.idpemakai || '');
  const roleOptions = (selected) => USER_ROLE_OPTIONS.map(([value, label]) => (
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
  )).join('');
  const schoolOptions = (selected, allowAll) => [
    ...(allowAll ? [`<option value="ALL" ${selected === 'ALL' ? 'selected' : ''}>Semua sekolah</option>`] : []),
    ...schools
      .filter((school) => school.active !== false || school.kdsek === selected)
      .map((school) => (
      `<option value="${escapeHtml(school.kdsek)}" ${selected === school.kdsek ? 'selected' : ''}>${escapeHtml(school.nmsek)}${school.active === false ? ' (nonaktif)' : ''}</option>`
      ))
  ].join('');

  ui.operatorCodesTableBody.innerHTML = app.userAccounts.map((account) => {
    const idpemakai = String(account.idpemakai || '');
    const role = String(account.role || 'unit').toLowerCase();
    const isActive = account.is_active !== false;
    const isCurrentUser = normalizeLoginValue(idpemakai) === currentUserId;
    const unit = account.id_sekolah || account.unit || 'ALL';
    const isUnit = role === 'unit';
    return `
      <tr data-user-id="${escapeHtml(idpemakai)}" data-active="${isActive}">
        <td class="user-account-cell">
          <strong>${escapeHtml(idpemakai)}</strong>
          <input type="text" maxlength="100" value="${escapeHtml(account.nama_lengkap || account.jabatan || '')}"
            data-user-name aria-label="Nama pengguna ${escapeHtml(idpemakai)}" />
        </td>
        <td><select data-user-role aria-label="Role ${escapeHtml(idpemakai)}" ${isCurrentUser ? 'disabled' : ''}>${roleOptions(role)}</select></td>
        <td><select data-user-school aria-label="Sekolah ${escapeHtml(idpemakai)}" ${isCurrentUser || !isUnit ? 'disabled' : ''}>${schoolOptions(unit, !isUnit)}</select></td>
        <td><input class="operator-code-input" type="text" maxlength="20" value="${escapeHtml(account.kode_operator || '')}"
          data-user-operator-code aria-label="Kode operator ${escapeHtml(idpemakai)}" /></td>
        <td><span class="user-status-pill ${isActive ? 'is-active' : 'is-blocked'}">${isActive ? 'Aktif' : 'Diblokir'}</span></td>
        <td class="user-row-actions">
          <button type="button" class="secondary-button small-button" data-save-user>Simpan</button>
          <button type="button" class="secondary-button small-button" data-reset-user-password>Reset password</button>
          <button type="button" class="${isActive ? 'danger-button' : 'secondary-button'} small-button"
            data-toggle-user-active ${isCurrentUser ? 'disabled' : ''}>${isActive ? 'Blokir' : 'Buka akses'}</button>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="6" class="empty-state">Belum ada pengguna. Tambahkan akun melalui formulir di atas.</td></tr>';
}

async function loadUserAccounts() {
  ui.operatorCodesStatus.textContent = 'Memuat pengguna...';
  ui.operatorCodesTableBody.innerHTML = '<tr><td colspan="6" class="empty-state">Memuat pengguna...</td></tr>';
  try {
    if (app.server) {
      const { data, error } = await app.supabase.rpc('spp_app_user_accounts_v1', requireStudentRules());
      if (error) throw error;
      app.userAccounts = data || [];
    } else {
      const codes = app.state.operatorCodes || {};
      app.userAccounts = (app.state.users || []).map((user) => ({
        idpemakai: user.idpemakai,
        nama_lengkap: user.nama_lengkap || user.jabatan,
        jabatan: user.jabatan,
        role: user.role,
        id_sekolah: user.id_sekolah || user.unit || 'ALL',
        is_active: user.is_active !== false,
        kode_operator: codes[user.idpemakai] || user.operatorCode || user.idpemakai
      }));
    }
    renderUserAccounts();
    ui.operatorCodesStatus.textContent = '';
    return true;
  } catch (error) {
    app.userAccounts = [];
    ui.operatorCodesTableBody.innerHTML = `<tr><td colspan="6" class="empty-state">Pengguna gagal dimuat: ${escapeHtml(error.message || 'Kesalahan tidak diketahui.')}</td></tr>`;
    ui.operatorCodesStatus.textContent = `Pastikan migration 025 pengelolaan pengguna sudah dijalankan. ${error.message || ''}`.trim();
    return false;
  }
}

function localOperatorCode() {
  const codes = Object.values(app.state.operatorCodes || {}).map((code) => String(code).toUpperCase());
  for (let sequence = 1; sequence < 1000000; sequence += 1) {
    const candidate = `USR-${String(sequence).padStart(6, '0')}`;
    if (!codes.includes(candidate)) return candidate;
  }
  throw new Error('Kode operator otomatis tidak tersedia.');
}

async function createUserAccount(event) {
  event.preventDefault();
  const idpemakai = ui.newUserUsername.value.trim();
  const nama = ui.newUserName.value.trim();
  const password = ui.newUserPassword.value;
  const role = ui.newUserRole.value;
  const school = role === 'unit' ? ui.newUserSchool.value : 'ALL';
  if (!/^[A-Za-z0-9._-]{3,50}$/.test(idpemakai)) {
    ui.userCreateStatus.textContent = 'Username harus 3–50 karakter: huruf, angka, titik, garis bawah, atau tanda hubung.';
    return;
  }
  if (!nama || nama.length > 100 || password.length < 8 || password.length > 128
      || password !== password.trim()) {
    ui.userCreateStatus.textContent = 'Isi nama pengguna dan password awal 8–128 karakter tanpa spasi di awal atau akhir.';
    return;
  }
  if (!USER_ROLE_OPTIONS.some(([value]) => value === role) || (role === 'unit' && !school)) {
    ui.userCreateStatus.textContent = 'Pilih role dan sekolah yang valid untuk akun Unit.';
    return;
  }

  ui.createUserSubmit.disabled = true;
  ui.userCreateStatus.textContent = 'Membuat akun pengguna...';
  try {
    let operatorCode;
    if (app.server) {
      const { data, error } = await app.supabase.rpc('spp_app_create_user_v1', {
        ...requireStudentRules(),
        p_idpemakai: idpemakai,
        p_nama_lengkap: nama,
        p_password_baru: password,
        p_role: role,
        p_id_sekolah: school
      });
      if (error) throw error;
      operatorCode = data;
    } else {
      if (app.state.users.some((user) => normalizeLoginValue(user.idpemakai) === normalizeLoginValue(idpemakai))) {
        throw new Error('Username sudah digunakan.');
      }
      operatorCode = localOperatorCode();
      app.state.users.push({
        idpemakai,
        password,
        jabatan: nama,
        nama_lengkap: nama,
        role,
        unit: school,
        id_sekolah: school,
        is_active: true,
        operatorCode
      });
      app.state.operatorCodes[idpemakai] = operatorCode;
      saveLocalData();
    }
    ui.userCreateForm.reset();
    updateNewUserSchoolVisibility();
    const loaded = await loadUserAccounts();
    ui.userCreateStatus.textContent = loaded
      ? `Akun ${idpemakai} dibuat dengan kode operator ${operatorCode || 'tersimpan'}.`
      : `Akun ${idpemakai} dibuat, tetapi daftar pengguna gagal dimuat. Muat ulang halaman untuk memastikan hasilnya.`;
  } catch (error) {
    ui.userCreateStatus.textContent = error.message || 'Akun gagal dibuat.';
  } finally {
    ui.createUserSubmit.disabled = false;
  }
}

async function saveUserAccount(button) {
  const row = button.closest('tr');
  const idpemakai = row?.dataset.userId;
  const nama = row?.querySelector('[data-user-name]')?.value.trim();
  const role = row?.querySelector('[data-user-role]')?.value;
  const schoolSelect = row?.querySelector('[data-user-school]');
  const school = role === 'unit' ? schoolSelect?.value : 'ALL';
  const operatorCode = String(row?.querySelector('[data-user-operator-code]')?.value || '').trim().toUpperCase();
  const isActive = row?.dataset.active === 'true';
  if (!idpemakai || !nama || nama.length > 100 || !/^[A-Z0-9-]{2,20}$/.test(operatorCode)) {
    ui.operatorCodesStatus.textContent = 'Nama wajib diisi; kode operator harus 2–20 karakter berupa huruf, angka, atau tanda hubung.';
    return;
  }
  if (!USER_ROLE_OPTIONS.some(([value]) => value === role) || (role === 'unit' && !school)) {
    ui.operatorCodesStatus.textContent = 'Pilih role dan sekolah yang valid untuk akun Unit.';
    return;
  }

  button.disabled = true;
  try {
    if (app.server) {
      const { error } = await app.supabase.rpc('spp_app_update_user_v1', {
        ...requireStudentRules(),
        p_idpemakai: idpemakai,
        p_nama_lengkap: nama,
        p_role: role,
        p_id_sekolah: school,
        p_kode_operator: operatorCode,
        p_is_active: isActive
      });
      if (error) throw error;
    } else {
      const user = app.state.users.find((item) => normalizeLoginValue(item.idpemakai) === normalizeLoginValue(idpemakai));
      if (!user) throw new Error('Pengguna tidak ditemukan.');
      if (normalizeLoginValue(idpemakai) === normalizeLoginValue(app.user.idpemakai)
          && (role !== 'superadmin' || !isActive)) {
        throw new Error('Role atau status akun Admin yang sedang digunakan tidak dapat diubah.');
      }
      const duplicate = Object.entries(app.state.operatorCodes || {}).some(([key, code]) => (
        normalizeLoginValue(key) !== normalizeLoginValue(idpemakai)
          && String(code || '').toUpperCase() === operatorCode
      ));
      if (duplicate) throw new Error('Kode operator sudah dipakai akun lain.');
      user.jabatan = nama;
      user.nama_lengkap = nama;
      user.role = role;
      user.unit = school;
      user.id_sekolah = school;
      app.state.operatorCodes[idpemakai] = operatorCode;
      user.operatorCode = operatorCode;
      saveLocalData();
    }
    const loaded = await loadUserAccounts();
    ui.operatorCodesStatus.textContent = loaded
      ? `Pengaturan akun ${idpemakai} berhasil disimpan.`
      : `Pengaturan akun ${idpemakai} tersimpan, tetapi daftar gagal dimuat. Muat ulang halaman.`;
  } catch (error) {
    ui.operatorCodesStatus.textContent = error.message || 'Pengaturan akun gagal disimpan.';
  } finally {
    button.disabled = false;
  }
}

async function toggleUserActive(button) {
  const row = button.closest('tr');
  const idpemakai = row?.dataset.userId;
  const isActive = row?.dataset.active === 'true';
  if (!idpemakai) return;
  if (normalizeLoginValue(idpemakai) === normalizeLoginValue(app.user?.idpemakai || '')) {
    ui.operatorCodesStatus.textContent = 'Akun Admin yang sedang digunakan tidak dapat diblokir.';
    return;
  }
  const nextActive = !isActive;
  if (!nextActive && !window.confirm(`Blokir akun ${idpemakai}? Login dan permintaan berikutnya akan ditolak.`)) return;
  button.disabled = true;
  try {
    if (app.server) {
      const { error } = await app.supabase.rpc('spp_app_set_user_active_v1', {
        ...requireStudentRules(),
        p_idpemakai: idpemakai,
        p_is_active: nextActive
      });
      if (error) throw error;
    } else {
      const user = app.state.users.find((item) => normalizeLoginValue(item.idpemakai) === normalizeLoginValue(idpemakai));
      if (!user) throw new Error('Pengguna tidak ditemukan.');
      user.is_active = nextActive;
      saveLocalData();
    }
    const loaded = await loadUserAccounts();
    ui.operatorCodesStatus.textContent = loaded
      ? (nextActive ? `Akun ${idpemakai} dibuka kembali.` : `Akun ${idpemakai} diblokir.`)
      : `Status akun ${idpemakai} tersimpan, tetapi daftar gagal dimuat. Muat ulang halaman.`;
  } catch (error) {
    ui.operatorCodesStatus.textContent = error.message || 'Status akun gagal diubah.';
  } finally {
    button.disabled = false;
  }
}

function openUserPasswordDialog(button) {
  const idpemakai = button.closest('tr')?.dataset.userId;
  if (!idpemakai) return;
  app.passwordResetTarget = idpemakai;
  ui.userPasswordTarget.textContent = `Pengguna: ${idpemakai}`;
  ui.userPasswordNew.value = '';
  ui.userPasswordConfirm.value = '';
  ui.userPasswordStatus.textContent = '';
  ui.userPasswordDialog.showModal();
  ui.userPasswordNew.focus();
}

async function resetUserPassword(event) {
  event.preventDefault();
  const password = ui.userPasswordNew.value;
  if (!app.passwordResetTarget || password.length < 8 || password.length > 128
      || password !== password.trim()) {
    ui.userPasswordStatus.textContent = 'Password harus 8–128 karakter tanpa spasi di awal atau akhir.';
    return;
  }
  if (password !== ui.userPasswordConfirm.value) {
    ui.userPasswordStatus.textContent = 'Konfirmasi password tidak sama.';
    return;
  }
  ui.userPasswordSubmit.disabled = true;
  ui.userPasswordStatus.textContent = 'Menyimpan password baru...';
  try {
    if (app.server) {
      const { error } = await app.supabase.rpc('spp_app_reset_user_password_v1', {
        ...requireStudentRules(),
        p_idpemakai: app.passwordResetTarget,
        p_password_baru: password
      });
      if (error) throw error;
    } else {
      const user = app.state.users.find((item) => normalizeLoginValue(item.idpemakai) === normalizeLoginValue(app.passwordResetTarget));
      if (!user) throw new Error('Pengguna tidak ditemukan.');
      user.password = password;
      saveLocalData();
    }
    const target = app.passwordResetTarget;
    const isCurrentUser = normalizeLoginValue(target) === normalizeLoginValue(app.user?.idpemakai || '');
    ui.userPasswordDialog.close();
    ui.operatorCodesStatus.textContent = isCurrentUser
      ? 'Password akun Admin berhasil direset. Keluar lalu masuk kembali dengan password baru.'
      : `Password akun ${target} berhasil direset.`;
  } catch (error) {
    ui.userPasswordStatus.textContent = error.message || 'Password gagal disimpan.';
  } finally {
    ui.userPasswordSubmit.disabled = false;
  }
}

async function printPaymentBatch(batchId, correction) {
  let batch;
  let items;
  if (app.server) {
    const [batchResult, itemsResult] = await Promise.all([
      app.supabase.from('spp_app_payment_batch_list').select('*').eq('id', batchId).single(),
      app.supabase.from('spp_app_payment_batch_items').select('*').eq('batch_id', batchId).order('payment_id')
    ]);
    if (batchResult.error) throw batchResult.error;
    if (itemsResult.error) throw itemsResult.error;
    batch = batchResult.data;
    items = itemsResult.data || [];
  } else {
    batch = getLocalPaymentBatches().find((item) => item.id === String(batchId));
    if (!batch) throw new Error('Data slip tidak ditemukan.');
    items = batch.items || [];
  }
  if (!batch || !items.length) throw new Error('Rincian slip tidak tersedia.');
  if (correction && !batch.correction_no) throw new Error('Nomor slip koreksi belum tersedia.');
  ui.paymentPrintSheet.innerHTML = renderPaymentReceipt(batch, items, correction);
  document.body.classList.add('printing-payment');
  window.print();
}

async function printPaymentBatches(batchIds) {
  const ids = [...new Set((batchIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!ids.length) throw new Error('Tidak ada transaksi untuk dicetak.');

  const receipts = [];
  if (app.server) {
    const itemsByBatch = new Map(ids.map((id) => [id, []]));
    for (let offset = 0; offset < ids.length; offset += 100) {
      const chunk = ids.slice(offset, offset + 100);
      const { data: batches, error: batchError } = await app.supabase
        .from('spp_app_payment_batch_list')
        .select('*')
        .in('id', chunk);
      if (batchError) throw batchError;

      const chunkItems = [];
      for (let from = 0; ; from += 1000) {
        const { data: page, error: itemsError } = await app.supabase
          .from('spp_app_payment_batch_items')
          .select('*')
          .in('batch_id', chunk)
          .order('payment_id')
          .range(from, from + 999);
        if (itemsError) throw itemsError;
        chunkItems.push(...(page || []));
        if (!page || page.length < 1000) break;
      }

      chunkItems.forEach((item) => {
        const key = String(item.batch_id);
        if (itemsByBatch.has(key)) itemsByBatch.get(key).push(item);
      });
      const batchesById = new Map((batches || []).map((batch) => [String(batch.id), batch]));
      chunk.forEach((id) => {
        const batch = batchesById.get(id);
        const items = itemsByBatch.get(id) || [];
        if (!batch) throw new Error(`Data transaksi ${id} tidak ditemukan.`);
        if (!items.length) throw new Error(`Rincian slip transaksi ${id} tidak tersedia.`);
        receipts.push({ batch, items });
      });
    }
  } else {
    const batches = getLocalPaymentBatches();
    ids.forEach((id) => {
      const batch = batches.find((item) => item.id === id);
      if (!batch) throw new Error(`Data transaksi ${id} tidak ditemukan.`);
      if (!batch.items?.length) throw new Error(`Rincian slip transaksi ${id} tidak tersedia.`);
      receipts.push({ batch, items: batch.items });
    });
  }

  ui.paymentPrintSheet.innerHTML = receipts.map(({ batch, items }, index) => (
    renderPaymentReceipt(batch, items, false, index < receipts.length - 1)
  )).join('');
  document.body.classList.add('printing-payment');
  window.print();
}

function renderPaymentReceipt(batch, items, correction, pageBreak = false) {
  const isCorrection = correction === true;
  const students = [...new Map(items.map((item) => {
    const student = app.state.siswa.find((candidate) => (
      String(candidate.id_siswa || '') === String(item.id_siswa || '')
      || String(candidate.nospp || '') === String(item.nospp || '')
    ));
    const name = item.nama || student?.nama || batch.nama || 'Siswa';
    const className = item.kdkls || student?.kdkls || '';
    return [`${name}|${className}`, { name, className }];
  })).values()];
  const studentName = students.length === 1 ? students[0].name : `Alokasi untuk ${students.length} siswa`;
  const className = students.length === 1 ? students[0].className : (students.length ? 'Beberapa kelas' : '-');
  const receiptRows = getPaymentReceiptRows(items, batch.source);
  const itemRows = receiptRows.map((row, index) => {
    const bosCategory = row.key === 'bos';
    const amount = bosCategory
      ? (batch.source === 'bos' ? row.amount : -row.amount)
      : row.amount;
    const signedAmount = isCorrection ? -amount : amount;
    const label = bosCategory && batch.source === 'bos' ? 'Alokasi BOS' : row.label;
    return `
      <tr>
        <td>${index + 1}.</td>
        <td>${escapeHtml(label)}</td>
        <td>${escapeHtml(row.detail)}</td>
        <td>${formatReportAmount(signedAmount)}</td>
      </tr>
    `;
  }).join('');
  const issuedAt = isCorrection ? batch.correction_created_at : batch.created_at;
  const operatorCode = isCorrection ? batch.correction_operator_code : batch.operator_code;
  const total = items.reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  const bosTotal = items.reduce((sum, item) => (
    sum + (batch.source === 'bos' || item.component === 'spp_bos' ? Number(item.nominal || 0) : 0)
  ), 0);
  const parentTotal = total - bosTotal;
  const schoolName = getSchoolName(batch.kdsek);
  const schoolLabel = schoolName && schoolName !== '-' ? schoolName : (batch.source === 'bos' ? 'Semua sekolah' : '');
  const receiptTotal = batch.source === 'bos' ? bosTotal : parentTotal;
  const receiptNote = batch.notes || [...new Set(
    items.map((item) => String(item.notes || '').trim()).filter(Boolean)
  )].join(' · ');
  const totalLabel = isCorrection
    ? (batch.source === 'bos' ? 'Total alokasi BOS dikoreksi' : 'Total pembayaran dikoreksi')
    : (batch.source === 'bos' ? 'Total alokasi BOS' : 'Total pembayaran');
  const correctionDetails = isCorrection ? `
    <p><strong>Mengoreksi bukti:</strong> ${escapeHtml(batch.receipt_no)}</p>
    <p><strong>Alasan:</strong> ${escapeHtml(batch.void_reason || '')}</p>
  ` : '';
  return `
    <article class="payment-receipt${pageBreak ? ' payment-receipt-page-break' : ''}">
      <header class="receipt-header">
        <div class="receipt-heading">
          <h1>${isCorrection ? 'SLIP KOREKSI PENERIMAAN' : 'KWITANSI / SLIP PENERIMAAN'}</h1>
          <p>YAYASAN SANTO DOMINIKUS CIMAHI</p>
          ${schoolLabel ? `<strong>${escapeHtml(schoolLabel)}</strong>` : ''}
        </div>
        <dl class="receipt-number">
          <dt>No.</dt><dd>${escapeHtml(isCorrection ? batch.correction_no : batch.receipt_no)}</dd>
          <dt>Tanggal</dt><dd>${escapeHtml(formatLongDate(batch.tglbyr))}</dd>
        </dl>
      </header>
      <section class="receipt-student">
        <p><strong>Nama Siswa</strong><span>: ${escapeHtml(studentName)}</span></p>
        <p><strong>Kelas</strong><span>: ${escapeHtml(className || '-')}</span></p>
      </section>
      ${correctionDetails}
      ${receiptNote ? `<p class="receipt-note"><strong>Keterangan:</strong> ${escapeHtml(receiptNote)}</p>` : ''}
      <table class="receipt-table">
        <thead><tr><th>No.</th><th>Jenis Pembayaran</th><th>Bulan / Keterangan</th><th>Jumlah (Rp)</th></tr></thead>
        <tbody>${itemRows}</tbody>
        <tfoot><tr>
          <th colspan="3">${escapeHtml(totalLabel)}</th>
          <th>${formatRupiah(isCorrection ? -receiptTotal : receiptTotal)}</th>
        </tr></tfoot>
      </table>
      <p class="receipt-words"><strong>Terbilang:</strong> ${escapeHtml(indonesianNumberWords(isCorrection ? -receiptTotal : receiptTotal))}</p>
      <p class="receipt-operator">Sumber: ${escapeHtml(bosTotal > 0 && batch.source !== 'bos' ? `${getPaymentSourceLabel(batch.source)} + BOS` : getPaymentSourceLabel(batch.source))}
        · Kode operator: ${escapeHtml(operatorCode || '-')} · Dicatat: ${escapeHtml(formatDateTime(issuedAt))}</p>
      <div class="receipt-signatures">
        <div>${batch.source === 'bos' ? 'Petugas' : 'Penyetor'}<span>(____________________)</span></div>
        <div>${batch.source === 'bos' ? 'Penerima alokasi' : 'Kasir'}<span>(____________________)</span></div>
      </div>
    </article>`;
}

function formatLongDate(value) {
  if (!value) return '-';
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('id-ID', { dateStyle: 'long' });
}

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-payment');
  if (ui.paymentPrintSheet) ui.paymentPrintSheet.replaceChildren();
});

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-daily-cash');
  ui.dailyCashPrintSheet.hidden = true;
});

window.addEventListener('afterprint', () => {
  const wasPrintingCard = document.body.classList.contains('printing-spp-card');
  document.body.classList.remove('printing-spp-card');
  ui.studentCardPrintSheet.hidden = true;
  ui.studentCardPrintSheet.replaceChildren();
  ui.studentCardPrintPreview.replaceChildren();
  if (wasPrintingCard) {
    if (ui.studentCardPrintDialog.open) ui.studentCardPrintDialog.close();
    app.studentCardPrintContext = null;
  }
});

function getAccessibleStudentRows() {
  if (!app.user || app.user.role === 'superadmin' || app.user.role === 'yayasan') {
    return app.state.siswa;
  }
  return app.state.siswa.filter((row) => row.kdsek === app.user.unit);
}

function getAccessibleTransactionRows(includeVoided = false) {
  const rows = (!app.user || app.user.role === 'superadmin' || app.user.role === 'yayasan')
    ? app.state.transaksi
    : app.state.transaksi.filter((row) => row.kdsek === app.user.unit);
  return includeVoided ? rows : rows.filter((row) => !row.voided_at);
}

function getPaymentComponentLabel(component) {
  if (component === 'legacy' || !component) return 'Belum dialokasikan';
  if (component === 'spp_bos') return 'SPP ditanggung BOS';
  if (component === 'dpp_tl') return 'DPP';
  return PAYMENT_COMPONENTS.find(([key]) => key === component)?.[1] || 'Lainnya';
}

function academicMonths(year) {
  const start = Number(String(year || currentAcademicYear()).slice(0, 4));
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(start, 6 + index, 1));
    return {
      key: date.toISOString().slice(0, 7),
      label: new Intl.DateTimeFormat('id-ID', { month: 'short', timeZone: 'UTC' }).format(date)
    };
  });
}

function formatStudentId(id) {
  const value = String(id ?? '');
  return /^\d+$/.test(value) ? value.padStart(4, '0') : value;
}

function formatAcademicMonth(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) return String(monthKey || '');
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function formatAcademicMonthShort(monthKey) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(monthKey || ''));
  if (!match) return String(monthKey || '');
  return new Intl.DateTimeFormat('id-ID', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1)));
}

function populateStudentYearOptions(selectedYear = '') {
  const currentStart = Number(currentAcademicYear().slice(0, 4));
  const nextYear = `${currentStart + 1}-${currentStart + 2}`;
  const years = [...new Set([...(app.years || []), currentAcademicYear(), nextYear, selectedYear])]
    .filter((year) => /^\d{4}-\d{4}$/.test(String(year || '')))
    .sort((a, b) => Number(b.slice(0, 4)) - Number(a.slice(0, 4)));
  ui.studentTahun.innerHTML = years.map((year) => (
    `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`
  )).join('');
  ui.studentTahun.value = years.includes(selectedYear) ? selectedYear : currentAcademicYear();
  populateStudentPeriodOptions();
}

function populateStudentPeriodOptions() {
  const year = ui.studentTahun.value || currentAcademicYear();
  const months = academicMonths(year);
  const populate = (select, preferred, fallback) => {
    const previous = preferred || select.value;
    select.innerHTML = months.map((month) => (
      `<option value="${month.key}">${escapeHtml(formatAcademicMonth(month.key))}</option>`
    )).join('');
    select.value = months.some((month) => month.key === previous)
      ? previous
      : (months.some((month) => month.key === fallback) ? fallback : months[0].key);
  };
  populate(ui.studentPeriode, '', months[0].key);
  populate(ui.studentEffective, '', months[0].key);
}

function localMonthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function localDateInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dashboardRevenuePeriods(year) {
  const start = Number(String(year || currentAcademicYear()).slice(0, 4));
  return Array.from({ length: 13 }, (_, index) => {
    const date = new Date(Date.UTC(start, 5 + index, 1));
    const key = date.toISOString().slice(0, 7);
    return { key, label: formatAcademicMonth(key), opening: index === 0 };
  });
}

function renderRevenueDashboard(rows, year, receiptRows = []) {
  const schoolScope = currentSchoolScope();
  const monthlyRows = (Array.isArray(rows) ? rows : [])
    .filter((row) => !schoolScope || row.kdsek === schoolScope);
  const receipts = (Array.isArray(receiptRows) ? receiptRows : [])
    .filter((row) => !schoolScope || row.kdsek === schoolScope);
  const monthList = dashboardRevenuePeriods(year);
  const schoolCodes = [...new Set(monthlyRows.map((row) => String(row.kdsek || '')).filter(Boolean))]
    .sort((a, b) => getSchoolName(a).localeCompare(getSchoolName(b), 'id'));
  const values = new Map();
  monthlyRows.forEach((row) => {
    const monthKey = String(row.bulan || '').slice(0, 7);
    values.set(`${row.kdsek}|${monthKey}`, {
      targetRecurring: Number(row.target_spp_komp || 0),
      realizedRecurring: Number(row.realisasi_spp_komp || 0),
      targetActivity: Number(row.target_giat || 0),
      realizedActivity: Number(row.realisasi_giat || 0)
    });
  });
  const getValue = (school, month, key) => values.get(`${school}|${month}`)?.[key] || 0;
  const totalsByMonth = new Map(monthList.map((month) => {
    const totals = schoolCodes.reduce((sum, code) => ({
      targetRecurring: sum.targetRecurring + getValue(code, month.key, 'targetRecurring'),
      realizedRecurring: sum.realizedRecurring + getValue(code, month.key, 'realizedRecurring'),
      targetActivity: sum.targetActivity + getValue(code, month.key, 'targetActivity'),
      realizedActivity: sum.realizedActivity + getValue(code, month.key, 'realizedActivity')
    }), { targetRecurring: 0, realizedRecurring: 0, targetActivity: 0, realizedActivity: 0 });
    return [month.key, totals];
  }));
  const series = [
    { key: 'targetRecurring', label: 'Target SPP+Komputer', color: '#b7c2bd', scale: 'recurring' },
    { key: 'realizedRecurring', label: 'Realisasi SPP+Komputer', color: '#176b55', scale: 'recurring' },
    { key: 'targetActivity', label: 'Target Kegiatan', color: '#e4d7c3', scale: 'activity' },
    { key: 'realizedActivity', label: 'Realisasi Kegiatan', color: '#b26b1c', scale: 'activity' }
  ];
  const recurringMaximum = Math.max(0, ...monthlyRows.flatMap((row) => [
    Number(row.target_spp_komp || 0),
    Number(row.realisasi_spp_komp || 0)
  ]));
  const activityMaximum = Math.max(0, ...monthlyRows.flatMap((row) => [
    Number(row.target_giat || 0),
    Number(row.realisasi_giat || 0)
  ]));
  ui.revenueLegend.innerHTML = `${series.map((item) => `
    <span class="revenue-legend-item">
      <i style="--legend-color:${item.color}" aria-hidden="true"></i>
      ${escapeHtml(item.label)}
    </span>
  `).join('')}<span class="revenue-scale-note">T = target · R = realisasi · skala Kegiatan terpisah.</span>`;

  ui.revenueChart.innerHTML = monthList.map((month) => {
    const totals = totalsByMonth.get(month.key);
    const totalTarget = totals.targetRecurring + totals.targetActivity;
    const totalRealized = totals.realizedRecurring + totals.realizedActivity;
    const bars = series.map((item) => {
      const value = totals[item.key];
      const maximum = item.scale === 'activity' ? activityMaximum : recurringMaximum;
      const height = maximum > 0 && value > 0 ? Math.max(3, value / maximum * 100) : 0;
      return `<span class="revenue-bar" style="--bar-height:${height}%;--bar-color:${item.color}" title="${escapeHtml(item.label)}: ${escapeHtml(formatRupiah(value))}"></span>`;
    }).join('');
    return `<div class="revenue-month">
      <strong title="Total target">T ${formatRupiahCompact(totalTarget)}</strong>
      <div class="revenue-bars" aria-hidden="true">${bars}</div>
      <span>${escapeHtml(formatAcademicMonthShort(month.key))}</span>
      <small title="Total realisasi">R ${formatRupiahCompact(totalRealized)}</small>
    </div>`;
  }).join('');

  const headers = ['Periode', 'Sekolah / unit', 'Target SPP+Komputer', 'Realisasi SPP+Komputer', 'Target Kegiatan', 'Realisasi Kegiatan', 'Total target', 'Total realisasi'];
  ui.revenueTableHead.innerHTML = `<tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join('')}</tr>`;
  ui.revenueTableBody.innerHTML = schoolCodes.length ? monthList.map((month) => {
    const totals = totalsByMonth.get(month.key);
    const unitRows = schoolCodes.map((code) => {
      const value = values.get(`${code}|${month.key}`) || {};
      const targetRecurring = value.targetRecurring || 0;
      const realizedRecurring = value.realizedRecurring || 0;
      const targetActivity = value.targetActivity || 0;
      const realizedActivity = value.realizedActivity || 0;
      return `<tr>
        <td>${escapeHtml(month.label)}</td>
        <th scope="row">${escapeHtml(getSchoolName(code))}</th>
        <td>${formatRupiah(targetRecurring)}</td>
        <td>${formatRupiah(realizedRecurring)}</td>
        <td>${formatRupiah(targetActivity)}</td>
        <td>${formatRupiah(realizedActivity)}</td>
        <td><strong>${formatRupiah(targetRecurring + targetActivity)}</strong></td>
        <td><strong>${formatRupiah(realizedRecurring + realizedActivity)}</strong></td>
      </tr>`;
    }).join('');
    return `${unitRows}<tr class="revenue-total-row">
      <th colspan="2" scope="row">Total ${escapeHtml(month.label)}</th>
      <td>${formatRupiah(totals.targetRecurring)}</td>
      <td>${formatRupiah(totals.realizedRecurring)}</td>
      <td>${formatRupiah(totals.targetActivity)}</td>
      <td>${formatRupiah(totals.realizedActivity)}</td>
      <td><strong>${formatRupiah(totals.targetRecurring + totals.targetActivity)}</strong></td>
      <td><strong>${formatRupiah(totals.realizedRecurring + totals.realizedActivity)}</strong></td>
    </tr>`;
  }).join('') : '<tr><td colspan="8" class="empty-state">Belum ada target atau realisasi untuk tahun ajaran ini.</td></tr>';

  return {
    totalRevenue: receipts.reduce((sum, row) => sum + Number(row.pemasukan || 0), 0),
    totalTransactions: receipts.reduce((sum, row) => sum + Number(row.transaksi || 0), 0),
    currentMonthRevenue: receipts
      .filter((row) => String(row.bulan || '').slice(0, 7) === localMonthInputValue())
      .reduce((sum, row) => sum + Number(row.pemasukan || 0), 0)
  };
}

function renderActivityList(rows) {
  ui.activityList.innerHTML = (rows || []).map((item) => `
    <li>
      <div>
        <strong>${escapeHtml(item.nospp || '-')}</strong>
        <small>${escapeHtml(item.nama || 'Siswa')} &bull; ${escapeHtml(item.tglbyr || '-')}</small>
      </div>
      <strong>${formatRupiah(Number(item.parent_nominal ?? item.nominal ?? 0))}</strong>
    </li>
  `).join('') || '<li class="empty-state">Belum ada aktivitas pembayaran.</li>';
}

function renderPriorYearRevenue(rows) {
  ui.priorYearRevenueBody.innerHTML = (rows || []).map((row) => {
    const dppDue = Number(row.dpp_tagihan || 0);
    const dppPaid = Number(row.dpp_terbayar || 0);
    const sppDue = Number(row.spp_tl_tagihan || 0);
    const sppPaid = Number(row.spp_tl_terbayar || 0);
    const remaining = Math.max(dppDue - dppPaid, 0) + Math.max(sppDue - sppPaid, 0);
    return `<tr>
      <th scope="row">${escapeHtml(getSchoolName(row.kdsek))}</th>
      <td>${formatRupiah(dppDue)}</td>
      <td>${formatRupiah(dppPaid)}</td>
      <td>${formatRupiah(sppDue)}</td>
      <td>${formatRupiah(sppPaid)}</td>
      <td><strong>${formatRupiah(remaining)}</strong></td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" class="empty-state">Tidak ada tagihan DPP/SPP tahun lalu pada unit ini.</td></tr>';
}

function renderActivityYearDashboard(rows) {
  const items = Array.isArray(rows) ? rows : [];
  const totals = items.reduce((sum, item) => ({
    target: sum.target + Number(item.target || 0),
    dibayar: sum.dibayar + Number(item.dibayar || 0),
    sisa: sum.sisa + Number(item.sisa || 0)
  }), { target: 0, dibayar: 0, sisa: 0 });
  ui.activityYearTarget.textContent = formatRupiah(totals.target);
  ui.activityYearPaid.textContent = formatRupiah(totals.dibayar);
  ui.activityYearBalance.textContent = formatRupiah(totals.sisa);
  const maximum = Math.max(0, ...items.flatMap((item) => [
    Number(item.target || 0),
    Number(item.dibayar || 0)
  ]));
  ui.activityYearChart.innerHTML = items.length
    ? items.map((item) => {
        const target = Number(item.target || 0);
        const paid = Number(item.dibayar || 0);
        const targetWidth = maximum > 0 ? Math.min(100, target / maximum * 100) : 0;
        const paidWidth = maximum > 0 ? Math.min(100, paid / maximum * 100) : 0;
        return `<div class="activity-year-chart-row">
          <span class="activity-year-chart-label">${escapeHtml(getSchoolName(item.kdsek))} · ${escapeHtml(item.kdkls || 'Belum ada kelas')}</span>
          <span class="activity-year-track" role="img" aria-label="Tagihan ${escapeHtml(formatRupiah(target))}, dibayar ${escapeHtml(formatRupiah(paid))}">
            <span class="activity-year-target-bar" style="width:${targetWidth}%"></span>
            <span class="activity-year-paid-bar" style="width:${paidWidth}%"></span>
          </span>
          <span class="activity-year-chart-values">Dibayar ${escapeHtml(formatRupiah(paid))} · Tagihan ${escapeHtml(formatRupiah(target))}</span>
        </div>`;
      }).join('')
    : '<p class="empty-state">Belum ada tagihan Kegiatan pada cakupan ini.</p>';
  ui.activityYearBody.innerHTML = items.length
    ? items.map((item) => `<tr>
        <td>${escapeHtml(getSchoolName(item.kdsek))}</td>
        <td>${escapeHtml(item.kdkls || 'Kelas belum ditentukan')}</td>
        <td>${formatRupiah(Number(item.target || 0))}</td>
        <td>${formatRupiah(Number(item.dibayar || 0))}</td>
        <td><strong>${formatRupiah(Number(item.sisa || 0))}</strong></td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="empty-state">Belum ada tagihan Kegiatan pada cakupan ini.</td></tr>';
}

let dashboardFetchSeq = 0;

function showRevenueLoadError(message) {
  ui.revenueChart.innerHTML = `<p class="empty-state">Dashboard gagal dimuat: ${escapeHtml(message)}. Pastikan migration 024 sudah dijalankan dan schema Supabase sudah diperbarui.</p>`;
  ui.revenueLegend.innerHTML = '';
  ui.revenueTableHead.innerHTML = '';
  ui.revenueTableBody.innerHTML = '';
  ui.priorYearRevenueBody.innerHTML = `<tr><td colspan="6" class="empty-state">${escapeHtml(message)}</td></tr>`;
  ui.totalSiswa.textContent = '-';
  ui.totalTagihan.textContent = '-';
  ui.paymentThisMonth.textContent = '-';
  ui.totalTransaksi.textContent = '-';
  ui.activityList.innerHTML = '<li class="empty-state">Aktivitas tidak dapat dimuat.</li>';
  ui.activityYearStatus.textContent = `Ringkasan Kegiatan tidak dapat dimuat: ${message}`;
  renderActivityYearDashboard([]);
}

async function fetchDashboard() {
  if (!app.user) return;
  const seq = ++dashboardFetchSeq;
  const year = currentYearScope() || currentAcademicYear();

  if (app.user.role === 'unit') {
    ui.financeDashboard.hidden = true;
    ui.unitDashboard.hidden = false;
    ui.unitDashboardYear.textContent = year;
    const { data, error } = await app.supabase.rpc('spp_app_student_count_v1', {
      p_tahun: year,
      p_kdsek: app.user.unit
    });
    if (seq !== dashboardFetchSeq) return;
    ui.unitDashboardStudents.textContent = error ? '—' : Number(data || 0).toLocaleString('id-ID');
    ui.unitDashboardStatus.textContent = error
      ? `Jumlah murid gagal dimuat: ${error.message}. Pastikan migration 016 sudah dijalankan.`
      : '';
    return;
  }

  ui.unitDashboard.hidden = true;
  ui.financeDashboard.hidden = false;
  ui.totalSiswa.textContent = '—';
  ui.totalTagihan.textContent = '—';
  ui.paymentThisMonth.textContent = '—';
  ui.totalTransaksi.textContent = '—';
  ui.revenueChart.innerHTML = '<p class="empty-state">Memuat pemasukan...</p>';
  ui.priorYearRevenueBody.innerHTML = '<tr><td colspan="6" class="empty-state">Memuat rekap...</td></tr>';
  if (!app.dashboardCredentials) {
    showRevenueLoadError('Silakan keluar lalu masuk kembali untuk memuat dashboard Admin/Yayasan.');
    return;
  }

  try {
    const [countResult, revenueResult, targetResult, priorYearResult, activityResult] = await Promise.all([
      app.supabase.rpc('spp_app_student_count_v1', { p_tahun: year, p_kdsek: currentSchoolScope() }),
      app.supabase.rpc('spp_app_revenue_by_unit_v1', {
        p_username: app.dashboardCredentials.username,
        p_password: app.dashboardCredentials.password,
        p_tahun: year
      }),
      app.supabase.rpc('spp_app_revenue_dashboard_v1', {
        p_username: app.dashboardCredentials.username,
        p_password: app.dashboardCredentials.password,
        p_tahun: year
      }),
      app.supabase.rpc('spp_app_prior_year_revenue_v1', {
        p_username: app.dashboardCredentials.username,
        p_password: app.dashboardCredentials.password,
        p_tahun: year
      }),
      app.supabase.from('spp_app_payment_batch_list').select('nospp,nama,kdsek,tglbyr,parent_nominal,nominal')
        .is('voided_at', null).neq('source', 'bos')
        .order('tglbyr', { ascending: false }).order('id', { ascending: false }).limit(5)
    ]);
    if (seq !== dashboardFetchSeq) return;
    if (countResult.error) throw countResult.error;
    if (revenueResult.error) throw revenueResult.error;
    if (targetResult.error) throw targetResult.error;
    if (priorYearResult.error) throw priorYearResult.error;
    if (activityResult.error) throw activityResult.error;

    ui.totalSiswa.textContent = Number(countResult.data || 0).toLocaleString('id-ID');
    const totals = renderRevenueDashboard(targetResult.data || [], year, revenueResult.data || []);
    renderPriorYearRevenue(priorYearResult.data || []);
    ui.totalTagihan.textContent = formatRupiah(totals.totalRevenue);
    ui.paymentThisMonth.textContent = formatRupiah(totals.currentMonthRevenue);
    ui.totalTransaksi.textContent = totals.totalTransactions.toLocaleString('id-ID');
    renderActivityList(activityResult.data || []);
    const activityYearResult = await app.supabase.rpc('spp_app_activity_dashboard_v1', {
      p_username: app.dashboardCredentials.username,
      p_password: app.dashboardCredentials.password,
      p_tahun: year,
      p_kdsek: currentSchoolScope(),
      p_kdkls: currentDashboardClassScope()
    });
    if (seq !== dashboardFetchSeq) return;
    if (activityYearResult.error) {
      ui.activityYearStatus.textContent = `Ringkasan Kegiatan gagal dimuat: ${activityYearResult.error.message}`;
      renderActivityYearDashboard([]);
    } else {
      ui.activityYearStatus.textContent = '';
      renderActivityYearDashboard(activityYearResult.data || []);
    }
  } catch (error) {
    if (seq !== dashboardFetchSeq) return;
    showRevenueLoadError(error.message || 'Periksa migration 024 dan koneksi Supabase.');
  }
}

function dashboardPeriodKey(value) {
  const compact = /^(0[1-9]|1[0-2])(\d{4})$/.exec(String(value || ''));
  if (compact) return `${compact[2]}-${compact[1]}`;
  const iso = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  return iso ? `${iso[1]}-${iso[2]}` : '';
}

function buildLocalDashboardRows(students, transactions, year) {
  const periods = dashboardRevenuePeriods(year);
  const julyPeriod = periods[1]?.key || '';
  const schoolCodes = [...new Set([
    ...students.map((row) => row.kdsek),
    ...transactions.map((row) => row.kdsek)
  ].filter(Boolean).map(String))];
  const studentsByNoSpp = new Map(students.map((student) => [
    `${student.kdsek}|${student.nospp}`,
    student
  ]));
  const rows = new Map();
  const getRow = (school, period) => {
    const key = `${school}|${period}`;
    if (!rows.has(key)) {
      rows.set(key, {
        kdsek: school,
        bulan: `${period}-01`,
        target_spp_komp: 0,
        realisasi_spp_komp: 0,
        target_giat: 0,
        realisasi_giat: 0
      });
    }
    return rows.get(key);
  };
  periods.forEach((period) => schoolCodes.forEach((school) => getRow(school, period.key)));
  students.forEach((student) => {
    const school = String(student.kdsek || '');
    const entryPeriod = dashboardPeriodKey(student.periodeMasuk || student.periode_masuk);
    const isNewStudent = (student.entryType || student.entry_type) === 'baru';
    periods.forEach((period) => {
      const current = getRow(school, period.key);
      if (period.opening) {
        if (!(isNewStudent && entryPeriod && entryPeriod >= julyPeriod)) {
          current.target_giat += Number(student.giat || 0);
        }
      } else if (
        (!entryPeriod || period.key >= entryPeriod)
        && !(isNewStudent && entryPeriod === period.key)
      ) {
        current.target_spp_komp += Number(student.spp || 0) + Number(student.komp || 0);
      }
    });
  });
  const openingPeriod = periods[0].key;
  const lastPeriod = periods[periods.length - 1].key;
  transactions.forEach((transaction) => {
    if (transaction.voided_at || transaction.source === 'bos' || transaction.component === 'spp_bos') return;
    const periodKey = dashboardPeriodKey(transaction.periode || transaction.tglbyr);
    if (!periodKey || periodKey < openingPeriod || periodKey > lastPeriod) return;
    const component = transaction.component || 'spp';
    const student = studentsByNoSpp.get(`${transaction.kdsek}|${transaction.nospp}`);
    if (!student) return;
    const entryPeriod = dashboardPeriodKey(student.periodeMasuk || student.periode_masuk);
    const isNewStudent = (student.entryType || student.entry_type) === 'baru';
    const targetPeriod = component === 'giat' ? openingPeriod : periodKey;
    if (component === 'giat') {
      if (
        periodKey < openingPeriod
        || Number(student.giat || 0) <= 0
        || (isNewStudent && entryPeriod && entryPeriod >= julyPeriod)
      ) return;
    } else if (
      !['spp', 'komp'].includes(component)
      || periodKey < julyPeriod
      || (entryPeriod && periodKey < entryPeriod)
      || (isNewStudent && entryPeriod === periodKey)
      || Number(student[component] || 0) <= 0
    ) {
      return;
    }
    const current = getRow(String(transaction.kdsek || ''), targetPeriod);
    if (component === 'giat') current.realisasi_giat += Number(transaction.nominal || 0);
    else current.realisasi_spp_komp += Number(transaction.nominal || 0);
  });
  return [...rows.values()];
}

function renderDashboard() {
  if (!app.user) return;
  if (app.user.role !== 'unit') fetchDailyPaymentSummary();
  if (app.server) {
    fetchDashboard();
    return;
  }

  const year = currentYearScope() || currentAcademicYear();
  if (app.user.role === 'unit') {
    ui.financeDashboard.hidden = true;
    ui.unitDashboard.hidden = false;
    ui.unitDashboardYear.textContent = year;
    ui.unitDashboardStudents.textContent = getAccessibleStudentRows().length.toLocaleString('id-ID');
    ui.unitDashboardStatus.textContent = '';
    return;
  }

  ui.unitDashboard.hidden = true;
  ui.financeDashboard.hidden = false;
  const siswa = getAccessibleStudentRows();
  const transactions = getAccessibleTransactionRows();
  const startYear = Number(year.slice(0, 4));
  const receiptRows = transactions
    .filter((item) => item.source !== 'bos' && item.component !== 'spp_bos' && !item.voided_at)
    .filter((item) => {
      const transactionDate = new Date(`${item.tglbyr}T00:00:00`);
      return transactionDate >= new Date(startYear, 6, 1) && transactionDate < new Date(startYear + 1, 6, 1);
    })
    .reduce((groups, item) => {
      const month = String(item.tglbyr || '').slice(0, 7);
      const key = `${item.kdsek}|${month}`;
      const current = groups.get(key) || { kdsek: item.kdsek, bulan: `${month}-01`, pemasukan: 0, transaksi: 0 };
      current.pemasukan += Number(item.nominal || 0);
      current.transaksi += 1;
      groups.set(key, current);
      return groups;
    }, new Map());
  ui.totalSiswa.textContent = siswa.length.toLocaleString('id-ID');
  const totals = renderRevenueDashboard(
    buildLocalDashboardRows(siswa, transactions, year),
    year,
    [...receiptRows.values()]
  );
  ui.totalTagihan.textContent = formatRupiah(totals.totalRevenue);
  ui.paymentThisMonth.textContent = formatRupiah(totals.currentMonthRevenue);
  ui.totalTransaksi.textContent = totals.totalTransactions.toLocaleString('id-ID');
  renderPriorYearRevenue([]);
  const recentPayments = getLocalPaymentBatches()
    .filter((batch) => !batch.voided_at && batch.source !== 'bos' && batch.parent_nominal > 0)
    .sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr))
    .slice(0, 5);
  renderActivityList(recentPayments);
}

let arrearsFetchSeq = 0;

function formatPeriodLabel(value) {
  const match = /^(0[1-9]|1[0-2])(\d{4})$/.exec(String(value || ''));
  if (!match) return String(value || '-');
  return new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1)));
}

function parseBillingPeriod(value) {
  const compact = /^(0[1-9]|1[0-2])(\d{4})$/.exec(String(value || ''));
  if (compact) return { year: Number(compact[2]), month: Number(compact[1]) };
  const iso = /^(\d{4})-(\d{2})/.exec(String(value || ''));
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) {
    return { year: Number(iso[1]), month: Number(iso[2]) };
  }
  return null;
}

function compressBillingPeriods(periods) {
  const grouped = new Map();
  (periods || []).forEach((value) => {
    const parsed = parseBillingPeriod(value);
    if (!parsed) return;
    if (!grouped.has(parsed.year)) grouped.set(parsed.year, new Set());
    grouped.get(parsed.year).add(parsed.month);
  });
  const segments = [];
  [...grouped.keys()].sort((a, b) => a - b).forEach((year) => {
    const months = [...grouped.get(year)].sort((a, b) => a - b);
    let start = months[0];
    let previous = start;
    const addRange = (first, last) => {
      const monthName = (month) => new Intl.DateTimeFormat('id-ID', {
        month: 'long',
        timeZone: 'UTC'
      }).format(new Date(Date.UTC(year, month - 1, 1)));
      segments.push(first === last
        ? `${monthName(first)} ${year}`
        : `${monthName(first)} - ${monthName(last)} ${year}`);
    };
    months.slice(1).forEach((month) => {
      if (month === previous + 1) {
        previous = month;
        return;
      }
      addRange(start, previous);
      start = month;
      previous = month;
    });
    addRange(start, previous);
  });
  return segments.join(', ');
}

function populateReportPeriods() {
  const year = ui.reportYearFilter.value || currentAcademicYear();
  const activeMonths = academicMonths(year);
  const now = new Date();
  const maximumPeriodDate = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const latestPeriod = localMonthInputValue(maximumPeriodDate);
  const months = activeMonths.filter((month) => month.key <= latestPeriod);
  const previous = ui.reportPeriodFilter.value;
  const values = months.map((month) => {
    const [yyyy, mm] = month.key.split('-');
    return { value: `${mm}${yyyy}`, label: formatPeriodLabel(`${mm}${yyyy}`) };
  });
  ui.reportPeriodFilter.innerHTML = values.map((item) => (
    `<option value="${item.value}">${escapeHtml(item.label)}</option>`
  )).join('') || '<option value="">Belum ada periode dalam rentang dua bulan ke depan</option>';
  if (!values.length) return;

  const current = `${String(now.getMonth() + 1).padStart(2, '0')}${now.getFullYear()}`;
  const defaultValue = year === currentAcademicYear() ? current : values[values.length - 1]?.value;
  ui.reportPeriodFilter.value = values.some((item) => item.value === previous)
    ? previous
    : (values.some((item) => item.value === defaultValue) ? defaultValue : values[values.length - 1]?.value || '');
}

function populateReportFilters() {
  const previousYear = ui.reportYearFilter.value;
  const years = app.years.length ? app.years : [currentAcademicYear()];
  ui.reportYearFilter.innerHTML = years.map((year) => (
    `<option value="${escapeHtml(year)}">${escapeHtml(year)}</option>`
  )).join('');
  ui.reportYearFilter.value = years.includes(previousYear)
    ? previousYear
    : (years.includes(currentAcademicYear()) ? currentAcademicYear() : years[0]);
  populateReportPeriods();

  const fixedSchool = app.user && app.user.role === 'unit' ? app.user.unit : '';
  const schools = app.state.schools
    .filter((item) => !fixedSchool || item.kdsek === fixedSchool)
    .sort((a, b) => getSchoolName(a.kdsek).localeCompare(getSchoolName(b.kdsek), 'id'));
  const previousSchool = ui.reportSchoolFilter.value;
  ui.reportSchoolFilter.innerHTML = fixedSchool
    ? schools.map((item) => `<option value="${escapeHtml(item.kdsek)}">${escapeHtml(item.nmsek)}</option>`).join('')
    : '<option value="">Semua sekolah</option>' + schools.map((item) => (
      `<option value="${escapeHtml(item.kdsek)}">${escapeHtml(item.nmsek)}</option>`
    )).join('');
  ui.reportSchoolFilter.disabled = Boolean(fixedSchool);
  ui.reportSchoolFilter.value = fixedSchool || (schools.some((item) => item.kdsek === previousSchool) ? previousSchool : '');

  const school = ui.reportSchoolFilter.value || null;
  const classes = app.state.classes
    .filter((item) => !school || item.kdsek === school)
    .sort((a, b) => a.kdkls.localeCompare(b.kdkls, 'id'))
    .filter((item, index, list) => list.findIndex((candidate) => (
      candidate.kdkls.toLowerCase() === item.kdkls.toLowerCase()
    )) === index);
  const previousClass = ui.reportClassFilter.value;
  ui.reportClassFilter.innerHTML = '<option value="">Semua kelas</option>'
    + classes.map((item) => (
      `<option value="${escapeHtml(item.kdkls)}">${escapeHtml(item.kdkls)}</option>`
    )).join('');
  ui.reportClassFilter.value = classes.some((item) => item.kdkls === previousClass) ? previousClass : '';
  updateArrearsExportButtons();
}

function updateArrearsExportButtons() {
  const school = ui.reportSchoolFilter.value;
  const className = ui.reportClassFilter.value;
  const unavailable = !app.server || app.arrearsExporting;
  const noPeriod = !ui.reportPeriodFilter.value;
  ui.downloadArrearsSchoolBtn.disabled = unavailable || noPeriod || !school;
  ui.downloadArrearsClassBtn.disabled = unavailable || noPeriod || !school || !className;
  document.querySelectorAll('[data-download-arrears]').forEach((button) => {
    button.disabled = app.arrearsExporting;
  });
}

const ARREARS_EXPORT_COMPONENTS = [
  ['dpp', 'DPP'],
  ['dpp_tl', 'DPP tahun lalu'],
  ['dsp', 'DPS'],
  ['seragam', 'Seragam'],
  ['giat', 'Kegiatan'],
  ['spp_tl', 'SPP tahun lalu'],
  ['komp_tl', 'Komputer tahun lalu'],
  ['lainnya', 'Lainnya']
];

function arrearsExportValues(row) {
  const billing = row.billing || {};
  const periods = billing.periode_bulanan || [];
  const monthlySpp = periods.reduce((sum, item) => sum + Number(item.spp?.sisa || 0), 0);
  const monthlyComputer = periods.reduce((sum, item) => sum + Number(item.komp?.sisa || 0), 0);
  const oneTime = billing.komponen_satu_kali || {};
  const oneTimeAmount = (key) => Number(oneTime[key]?.sisa || 0);
  const oneTimeDetails = Object.entries(oneTime)
    .filter(([, item]) => Number(item.sisa || 0) > 0)
    .map(([key, item]) => {
      const details = Array.isArray(item.rincian)
        ? item.rincian.filter((detail) => Number(detail.sisa || 0) > 0)
        : [];
      const detailPeriods = compressBillingPeriods(details.map((detail) => detail.periode).filter(Boolean));
      const detailYears = [...new Set(details.map((detail) => detail.tahun_ajaran).filter(Boolean))].join(', ');
      const description = detailPeriods || detailYears;
      const label = ARREARS_EXPORT_COMPONENTS.find(([component]) => component === key)?.[1]
        || getPaymentComponentLabel(key);
      return description ? `${label}: ${description}` : label;
    });
  const knownComponents = new Set(ARREARS_EXPORT_COMPONENTS.map(([key]) => key));
  const otherAmount = Object.entries(oneTime).reduce((sum, [key, item]) => (
    sum + (knownComponents.has(key) ? 0 : Number(item.sisa || 0))
  ), 0);
  const monthlyDetails = [
    ['SPP', compressBillingPeriods(periods.filter((item) => Number(item.spp?.sisa || 0) > 0).map((item) => item.periode))],
    ['Komputer', compressBillingPeriods(periods.filter((item) => Number(item.komp?.sisa || 0) > 0).map((item) => item.periode))]
  ].filter(([, range]) => range).map(([label, range]) => `${label}: ${range}`);
  const detailText = [...monthlyDetails, ...oneTimeDetails].join('; ');
  const componentAmounts = ARREARS_EXPORT_COMPONENTS.map(([key]) => (
    key === 'lainnya' ? oneTimeAmount('lainnya') + otherAmount : oneTimeAmount(key)
  ));
  return [
    row.nospp || '',
    row.nama || '',
    getSchoolName(row.kdsek),
    row.kdkls || '',
    row.tahun_ajaran || '',
    formatPeriodLabel(ui.reportPeriodFilter.value),
    detailText,
    billing.sisa_spp == null ? monthlySpp : Number(billing.sisa_spp || 0),
    billing.sisa_komp == null ? monthlyComputer : Number(billing.sisa_komp || 0),
    ...componentAmounts,
    Number(billing.sisa_total || 0),
    Number(billing.belum_dialokasikan || 0)
  ];
}

function createArrearsExport(rows) {
  const headers = [
    'No. SPP', 'Nama', 'Sekolah', 'Kelas', 'Tahun ajaran', 'Periode sampai',
    'Rincian periode tunggakan', 'SPP sisa', 'Komputer sisa', 'DPP sisa',
    'DPP tahun lalu sisa', 'DPS sisa', 'Seragam sisa', 'Kegiatan sisa',
    'SPP tahun lalu sisa', 'Komputer tahun lalu sisa', 'Lainnya sisa',
    'Akumulasi tunggakan', 'Belum dialokasikan'
  ];
  const values = rows.map(arrearsExportValues);
  if (values.length) {
    const total = values[0].map((value, index) => (
      index >= 7 && typeof value === 'number'
        ? values.reduce((sum, row) => sum + Number(row[index] || 0), 0)
        : ''
    ));
    total[0] = 'TOTAL AKUMULASI';
    total[1] = `${rows.length.toLocaleString('id-ID')} siswa`;
    values.push(total);
  }
  return { headers, values };
}

async function fetchAllArrearsRows(school, className) {
  const rows = [];
  for (let offset = 0; ; offset += ARREARS_PAGE_SIZE) {
    const { data, error } = await app.supabase.rpc('spp_app_class_billing_v1', {
      p_tahun: ui.reportYearFilter.value || currentAcademicYear(),
      p_periode: ui.reportPeriodFilter.value,
      p_kdsek: school || null,
      p_kdkls: className || null,
      p_limit: ARREARS_PAGE_SIZE,
      p_offset: offset
    });
    if (error) throw error;
    const page = (data || []).map((row) => ({
      ...row,
      id_siswa: String(row.id_siswa),
      billing: row.billing || {}
    }));
    rows.push(...page);
    if (page.length < ARREARS_PAGE_SIZE) break;
  }
  return rows;
}

function setArrearsExportStatus(message) {
  ui.arrearsExportStatus.textContent = message;
}

async function downloadArrearsRows(rows, scopeName) {
  if (!rows.length) {
    setArrearsExportStatus('Tidak ada tunggakan untuk cakupan ini.');
    return;
  }
  const { headers, values } = createArrearsExport(rows);
  const year = fileNamePart(ui.reportYearFilter.value || currentAcademicYear());
  const period = fileNamePart(formatPeriodLabel(ui.reportPeriodFilter.value));
  downloadXlsxSheet(
    'Tunggakan',
    headers,
    values,
    [16, 28, 26, 12, 16, 20, 54, 18, 18, 18, 22, 18, 18, 18, 22, 24, 18, 22, 22],
    `tunggakan-${fileNamePart(scopeName)}-${year}-${period}.xlsx`
  );
  setArrearsExportStatus(`${rows.length.toLocaleString('id-ID')} siswa berhasil diunduh. Akumulasi sisa tagihan dan pembayaran belum dialokasikan dipisahkan.`);
}

async function downloadStudentArrears(studentId) {
  const row = app.arrearsRowsById?.get(String(studentId));
  if (!row) {
    setArrearsExportStatus('Data siswa tidak ditemukan. Muat ulang laporan lalu coba lagi.');
    return;
  }
  app.arrearsExporting = true;
  updateArrearsExportButtons();
  setArrearsExportStatus(`Menyiapkan tunggakan ${row.nama || 'siswa'}...`);
  try {
    await downloadArrearsRows([row], `siswa-${row.nama}`);
  } catch (error) {
    setArrearsExportStatus(`Unduhan gagal: ${error.message || 'Periksa koneksi dan coba lagi.'}`);
  } finally {
    app.arrearsExporting = false;
    updateArrearsExportButtons();
  }
}

async function downloadArrearsGroup(scope) {
  const school = ui.reportSchoolFilter.value;
  const className = ui.reportClassFilter.value;
  if (!school || (scope === 'class' && !className)) {
    setArrearsExportStatus(scope === 'class'
      ? 'Pilih sekolah dan kelas terlebih dahulu.'
      : 'Pilih sekolah terlebih dahulu.');
    return;
  }
  app.arrearsExporting = true;
  updateArrearsExportButtons();
  setArrearsExportStatus('Memuat seluruh data tunggakan...');
  try {
    const rows = await fetchAllArrearsRows(school, scope === 'class' ? className : null);
    await downloadArrearsRows(rows, scope === 'class' ? `${school}-${className}` : school);
  } catch (error) {
    setArrearsExportStatus(`Unduhan gagal: ${error.message || 'Periksa koneksi dan coba lagi.'}`);
  } finally {
    app.arrearsExporting = false;
    updateArrearsExportButtons();
  }
}

function reportDetailMarkup(billing) {
  const months = billing.periode_bulanan || [];
  const monthlyRows = months.map((item) => {
    const components = [
      ['SPP', Number(item.spp.sisa || 0)],
      ['Komputer', Number(item.komp.sisa || 0)]
    ].filter(([, remaining]) => remaining > 0)
      .map(([label, remaining]) => `
        <div class="arrears-balance-line"><span>${label}</span><strong>${formatRupiah(remaining)}</strong></div>
      `).join('');
    if (!components) return '';
    return `
      <div class="arrears-period">
        <strong>${escapeHtml(formatPeriodLabel(item.periode))}</strong>
        <div class="arrears-period-items">${components}</div>
      </div>
    `;
  }).filter(Boolean);
  const monthlySpp = months.reduce((total, item) => total + Number(item.spp.sisa || 0), 0);
  const monthlyComputer = months.reduce((total, item) => total + Number(item.komp.sisa || 0), 0);
  const monthlySummary = [
    ['SPP', billing.sisa_spp == null ? monthlySpp : Number(billing.sisa_spp || 0)],
    ['Komputer', billing.sisa_komp == null ? monthlyComputer : Number(billing.sisa_komp || 0)]
  ].filter(([, amount]) => amount > 0)
    .map(([label, amount]) => `
      <div class="arrears-balance-line"><span>${label}</span><strong>${formatRupiah(amount)}</strong></div>
    `).join('');
  const monthlyGroup = monthlyRows.length || monthlySummary
    ? `<section class="arrears-detail-group">
        <strong class="arrears-detail-heading">SPP &amp; Komputer</strong>
        <div class="arrears-period-items">${monthlySummary || '<span class="student-sub">Tidak ada sisa tagihan.</span>'}</div>
        ${monthlyRows.length
          ? `<details class="arrears-period-details">
              <summary>Rincian ${monthlyRows.length} periode</summary>
              <div class="arrears-month-grid">${monthlyRows.join('')}</div>
            </details>`
          : ''}
      </section>`
    : '';
  const components = Object.entries(billing.komponen_satu_kali || {})
    .filter(([, item]) => Number(item.sisa || 0) > 0)
    .map(([key, item]) => `
      <div class="arrears-one-time-item">
        <div class="arrears-balance-line"><span>${escapeHtml(getPaymentComponentLabel(key))}</span><strong>${formatRupiah(item.sisa)}</strong></div>
        ${arrearsPeriodDetailsMarkup(item)}
      </div>
    `).join('');
  const oneTimeGroup = components
    ? `<section class="arrears-detail-group">
        <strong class="arrears-detail-heading">Komponen lainnya</strong>
        <div class="arrears-period-items">${components}</div>
      </section>`
    : '';
  const reconciliation = Number(billing.belum_dialokasikan || 0) > 0
    ? `<div class="arrears-reconciliation">Pembayaran lama belum dialokasikan <strong>${formatRupiah(billing.belum_dialokasikan)}</strong></div>`
    : '';
  const groups = [monthlyGroup, oneTimeGroup].filter(Boolean);
  const items = `${groups.join('')}${reconciliation}`;

  return `<div class="arrears-breakdown${groups.length < 2 ? ' is-single' : ''}">${items || '<span class="student-sub">Tidak ada rincian sisa tagihan.</span>'}</div>`;
}

function normalizeWhatsAppNumber(value) {
  let number = String(value || '').replace(/[^\d+]/g, '');
  if (number.startsWith('+')) number = number.slice(1);
  if (number.startsWith('0')) number = `62${number.slice(1)}`;
  return /^\d{8,20}$/.test(number) ? number : '';
}

function arrearsPeriodDetailsMarkup(item) {
  const details = Array.isArray(item?.rincian)
    ? item.rincian.filter((detail) => Number(detail.sisa || 0) > 0)
    : [];
  if (!details.length) return '';
  return `
    <details class="arrears-period-details">
      <summary>Rincian ${details.length} ${details.every((detail) => detail.periode) ? 'periode' : 'tagihan'}</summary>
      <div class="arrears-month-grid">
        ${details.map((detail) => {
          const periodLabel = detail.periode
            ? formatPeriodLabel(detail.periode)
            : `Periode tidak dicatat · ${detail.tahun_ajaran || 'Tahun sebelumnya'}`;
          return `
            <div class="arrears-period">
              <strong>${escapeHtml(periodLabel)}</strong>
              <div class="arrears-period-items">
                <div class="arrears-balance-line">
                  <span>Sisa</span><strong>${formatRupiah(detail.sisa)}</strong>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>
    </details>`;
}

function arrearsRowMarkup(row) {
  const billing = row.billing || {};
  const unallocated = Number(billing.belum_dialokasikan || 0);
  const remaining = Number(billing.sisa_total || 0);
  const partial = Object.values(billing.komponen_satu_kali || {}).some((item) => item.status === 'Cicilan')
    || (billing.periode_bulanan || []).some((item) => item.spp.status === 'Cicilan' || item.komp.status === 'Cicilan');
  const status = unallocated > 0 ? 'Perlu rekonsiliasi' : (remaining <= 0 ? 'Lunas' : (partial ? 'Cicilan' : 'Belum bayar'));
  const statusClass = unallocated > 0 ? 'needs-review' : (remaining <= 0 ? 'lunas' : 'belum');
  const phone = normalizeWhatsAppNumber(row.no_wa);
  const monthlyDetails = (billing.periode_bulanan || [])
    .map((item) => {
      const components = [
        ['SPP', Number(item.spp.sisa || 0)],
        ['Komputer', Number(item.komp.sisa || 0)]
      ].filter(([, amount]) => amount > 0)
        .map(([label, amount]) => `${label} ${formatRupiah(amount)}`);
      return components.length
        ? `${formatPeriodLabel(item.periode)}: ${components.join(', ')}`
        : '';
    })
    .filter(Boolean);
  const oneTimeDetails = Object.entries(billing.komponen_satu_kali || {})
    .filter(([, item]) => Number(item.sisa || 0) > 0)
    .map(([key, item]) => `${getPaymentComponentLabel(key)} ${formatRupiah(item.sisa)}`);
  const name = String(row.nama || 'Siswa');
  const balanceDescription = [...monthlyDetails, ...oneTimeDetails].join('; ') || 'tagihan satu kali';
  const whatsappMessage = `Yth. Orang tua/wali ${name}, berikut rincian sisa tagihan: ${balanceDescription}. Total sisa ${formatRupiah(remaining)}. Mohon konfirmasi pembayaran kepada tata usaha. Terima kasih.`;
  const whatsappUrl = phone && unallocated <= 0
    ? `https://wa.me/${phone}?text=${encodeURIComponent(whatsappMessage)}`
    : '';
  const canPrint = unallocated <= 0;
  const balanceMarkup = `${formatRupiah(remaining)}${unallocated > 0
    ? `<small class="unallocated-note">+ ${formatRupiah(unallocated)} belum dialokasikan</small>`
    : ''}`;

  return `<tr>
    <td>${escapeHtml(row.kdkls || '-')}</td>
    <td><strong>${escapeHtml(name)}</strong></td>
    <td>${reportDetailMarkup(billing)}</td>
    <td class="balance-cell">${balanceMarkup}</td>
    <td><span class="status-pill ${statusClass}">${status}</span></td>
    <td class="report-actions">
      ${whatsappUrl ? `<a class="action-btn whatsapp-action" href="${escapeHtml(whatsappUrl)}" target="_blank" rel="noopener noreferrer">WhatsApp</a>` : ''}
      ${canPrint ? `<button type="button" class="action-btn print-action" data-print-arrears="${escapeHtml(row.id_siswa)}">Cetak surat</button>` : '<span class="student-sub">Tahan penagihan sampai rekonsiliasi</span>'}
      <button type="button" class="action-btn download-action" data-download-arrears="${escapeHtml(row.id_siswa)}" ${app.arrearsExporting ? 'disabled' : ''}>Unduh</button>
    </td>
  </tr>`;
}

function renderArrearsReport() {
  const rows = [...app.arrearsRows].sort((a, b) => (
    String(a.kdkls || '').localeCompare(String(b.kdkls || ''), 'id')
      || String(a.nama || '').localeCompare(String(b.nama || ''), 'id')
  ));
  app.arrearsRowsById = new Map(rows.map((row) => [String(row.id_siswa), row]));
  const groups = [];
  let previousClass = null;
  rows.forEach((row) => {
    const className = row.kdkls || 'Tanpa kelas';
    if (className !== previousClass) {
      groups.push(`<tr class="class-group-row"><th colspan="6" scope="rowgroup">${escapeHtml(className)}</th></tr>`);
      previousClass = className;
    }
    groups.push(arrearsRowMarkup(row));
  });
  ui.arrearsReportTable.innerHTML = groups.join('')
    || '<tr><td colspan="6" class="empty-state">Tidak ada tunggakan pada filter ini.</td></tr>';
  ui.arrearsReportCount.textContent = `${app.arrearsTotal.toLocaleString('id-ID')} siswa memiliki sisa tagihan atau pembayaran lama yang perlu direkonsiliasi.`;
  const shown = Math.min(app.arrearsRows.length, app.arrearsTotal);
  ui.arrearsPageInfo.textContent = `${shown.toLocaleString('id-ID')} dari ${app.arrearsTotal.toLocaleString('id-ID')} siswa`;
  ui.loadMoreArrears.hidden = shown >= app.arrearsTotal;
  const hasLegacy = rows.some((row) => Number(row.billing?.belum_dialokasikan || 0) > 0);
  ui.legacyPaymentNote.hidden = !hasLegacy;
  ui.reportPeriod.textContent = formatPeriodLabel(ui.reportPeriodFilter.value);
  updateArrearsExportButtons();
}

async function fetchArrearsReport(append = false) {
  if (!app.user) return;
  ui.reportPeriod.textContent = formatPeriodLabel(ui.reportPeriodFilter.value);
  if (!app.server) {
    ui.arrearsReportCount.textContent = 'Laporan per komponen membutuhkan backend Supabase dan migration 016.';
    ui.arrearsReportTable.innerHTML = '<tr><td colspan="6" class="empty-state">Hubungkan Supabase dan jalankan migration 016 untuk menghitung cicilan dan sisa per periode secara akurat.</td></tr>';
    ui.loadMoreArrears.hidden = true;
    return;
  }

  const seq = ++arrearsFetchSeq;
  const year = ui.reportYearFilter.value || currentAcademicYear();
  const period = ui.reportPeriodFilter.value;
  if (!period) {
    ui.arrearsReportTable.innerHTML = '<tr><td colspan="6" class="empty-state">Belum ada periode tagihan yang dapat dipilih.</td></tr>';
    ui.arrearsReportCount.textContent = 'Periode laporan tersedia sampai dua bulan setelah bulan aktif.';
    ui.loadMoreArrears.hidden = true;
    return;
  }
  if (!append) {
    app.arrearsOffset = 0;
    app.arrearsRows = [];
    ui.arrearsReportTable.innerHTML = skeletonRows(6);
  }

  const { data, error } = await app.supabase.rpc('spp_app_class_billing_v1', {
    p_tahun: year,
    p_periode: period,
    p_kdsek: ui.reportSchoolFilter.value || null,
    p_kdkls: ui.reportClassFilter.value || null,
    p_limit: ARREARS_PAGE_SIZE,
    p_offset: app.arrearsOffset
  });
  if (seq !== arrearsFetchSeq) return;
  if (error) {
    ui.arrearsReportTable.innerHTML = `<tr><td colspan="6" class="empty-state report-error" role="alert">Laporan gagal dimuat: ${escapeHtml(error.message)}. Periksa migration 016 dan 019.</td></tr>`;
    ui.arrearsReportCount.textContent = 'Laporan tidak dapat dimuat.';
    ui.loadMoreArrears.hidden = true;
    return;
  }

  const pageRows = (data || []).map((row) => ({
    ...row,
    id_siswa: String(row.id_siswa),
    billing: row.billing || {}
  }));
  app.arrearsRows = append ? [...app.arrearsRows, ...pageRows] : pageRows;
  app.arrearsOffset += pageRows.length;
  app.arrearsTotal = Number(pageRows[0]?.total_count || (append ? app.arrearsTotal : 0));
  renderArrearsReport();
}

function renderReport() {
  populateReportFilters();
  fetchArrearsReport();
}

function printArrearsLetter(studentId) {
  const row = app.arrearsRowsById?.get(String(studentId));
  if (!row) return;
  const billing = row.billing || {};
  if (Number(billing.belum_dialokasikan || 0) > 0) {
    alert('Surat belum dapat dicetak sebelum pembayaran lama direkonsiliasi.');
    return;
  }
  const periods = (billing.periode_bulanan || [])
    .filter((item) => Number(item.spp.sisa || 0) > 0 || Number(item.komp.sisa || 0) > 0)
    .map((item) => `<tr><td>${escapeHtml(formatPeriodLabel(item.periode))}</td><td>${formatRupiah(item.spp.sisa)}</td><td>${formatRupiah(item.komp.sisa)}</td></tr>`)
    .join('');
  const components = Object.entries(billing.komponen_satu_kali || {})
    .filter(([, item]) => Number(item.sisa || 0) > 0)
    .map(([key, item]) => `<tr><td>${escapeHtml(getPaymentComponentLabel(key))}</td><td colspan="2">${formatRupiah(item.sisa)}</td></tr>`)
    .join('');
  ui.arrearsPrintSheet.innerHTML = `
    <article class="print-letter">
      <h1>Pemberitahuan Sisa Tagihan</h1>
      <p>Kepada orang tua/wali dari:</p>
      <p><strong>${escapeHtml(row.nama)}</strong><br>Kelas: ${escapeHtml(row.kdkls)} &middot; ${escapeHtml(getSchoolName(row.kdsek))}</p>
      <p>Berdasarkan catatan pembayaran sampai ${escapeHtml(formatPeriodLabel(billing.periode_aktif))}, terdapat rincian sisa tagihan berikut:</p>
      <table><thead><tr><th>Periode / komponen</th><th>Sisa SPP</th><th>Sisa Komputer</th></tr></thead><tbody>${periods || ''}${components || ''}</tbody></table>
      <p><strong>Total sisa terhitung: ${formatRupiah(billing.sisa_total)}</strong></p>
      <p>Mohon melakukan konfirmasi kepada tata usaha unit. Jika pembayaran telah dilakukan, silakan menyampaikan bukti agar data dapat diperbarui.</p>
      <p class="print-date">${escapeHtml(new Date().toLocaleDateString('id-ID', { dateStyle: 'long' }))}</p>
      <p class="print-signature">Tata Usaha<br>${escapeHtml(getSchoolName(row.kdsek))}</p>
    </article>`;
  ui.arrearsPrintSheet.hidden = false;
  document.body.classList.add('printing-arrears');
  window.print();
}

window.addEventListener('afterprint', () => {
  document.body.classList.remove('printing-arrears');
  ui.arrearsPrintSheet.hidden = true;
});

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
  const mode = ui.studentType.value;
  const isNew = mode === 'baru';
  const isEdit = mode === 'ubah';
  const isPlacement = mode === 'penempatan';
  document.querySelectorAll('#studentForm [data-for]').forEach((item) => {
    item.hidden = !item.dataset.for.split(' ').includes(mode);
  });
  document.querySelectorAll('#studentForm [data-hide]').forEach((item) => {
    item.hidden = item.dataset.hide.split(' ').includes(mode);
  });
  ui.studentEditSummary.hidden = !isEdit;
  ui.studentNama.required = isNew;
  ui.studentWa.required = isNew;
  ui.studentPeriode.required = isNew;
  ui.studentGiat.required = mode === 'baru' || mode === 'naik';
  ui.studentSpp.required = mode === 'baru' || mode === 'naik';
  ui.studentKomp.required = mode === 'baru' || mode === 'naik';
  ui.studentExisting.required = mode === 'naik' || isPlacement;
  ui.studentSekolah.required = !isEdit;
  ui.studentSekolah.disabled = isPlacement;
  ui.studentKelas.required = mode === 'naik' || isPlacement
    || isNew && !app.provisionalEnrollmentReady;
  const placementOption = ui.studentType.querySelector('option[value="penempatan"]');
  if (placementOption) placementOption.hidden = !app.provisionalEnrollmentReady;
  ui.studentNama.placeholder = isNew ? 'Nama lengkap' : 'Kosongkan jika tidak berubah';
  const titles = {
    baru: ['Siswa baru', 'Tambah Siswa Baru'],
    naik: ['Tahun ajaran baru', 'Naik / Pindah Kelas'],
    penempatan: ['Lengkapi pendaftaran', 'Tentukan Kelas Siswa'],
    ubah: ['Tagihan siswa', 'Ubah Tagihan']
  };
  ui.studentModalEyebrow.textContent = titles[mode][0];
  ui.studentModalTitle.textContent = titles[mode][1];
  ui.studentSubmitBtn.textContent = isPlacement
    ? 'Simpan Kelas dan Buat No. SPP'
    : isEdit ? 'Simpan Perubahan' : 'Simpan Siswa';
}

function openStudentDialog(mode = 'baru') {
  resetStudentForm();
  ui.studentType.value = mode;
  updateStudentFormMode();
  if (!ui.studentDialog.open) ui.studentDialog.showModal();
}

function openPlacementDialog(row) {
  if (!row || !app.provisionalEnrollmentReady) return;
  openStudentDialog('penempatan');
  setPickerValue('studentExisting', row.id);
  populateStudentYearOptions(row.tahunAjaran);
  populateSchoolSelect(row.kdsek, '');
  ui.studentSekolah.disabled = true;
  ui.studentEditSummary.hidden = false;
  ui.studentEditSummary.innerHTML = `
    <strong>${escapeHtml(row.nama)}</strong>
    <span>${escapeHtml(getSchoolName(row.kdsek))} · ID ${escapeHtml(formatStudentId(row.id))}</span>
    <span class="student-sub">No. SPP dibuat setelah kelas disimpan.</span>`;
}

function closeStudentDialog() {
  if (ui.studentDialog.open) ui.studentDialog.close();
  app.editingEnrollment = null;
}

function populateExistingStudents() {
  if (!ui.arrearTahun.value) {
    const [start] = currentAcademicYear().split('-').map(Number);
    ui.arrearTahun.value = `${start - 1}-${start}`;
  }
}

function studentPickerLabel(item, wrap) {
  if (wrap.dataset.picker === 'paymentStudent') {
    return `${item.nama} · ${getSchoolName(item.kdsek)} · ${item.kdkls ? `Kelas ${item.kdkls}` : 'Kelas belum ditentukan'} · TA ${item.tahunAjaran || '-'}${item.nospp ? ` · No. SPP ${item.nospp}` : ''}`;
  }
  return `${item.nama} · ${getSchoolName(item.kdsek)} · ${item.kdkls ? `Kelas ${item.kdkls}` : 'Kelas belum ditentukan'} · ID ${formatStudentId(item.id)}`;
}

function setPickerValue(hiddenId, id) {
  const hidden = document.getElementById(hiddenId);
  const wrap = hidden.closest('.picker');
  const input = wrap.querySelector('.picker-input');
  const student = id
    ? app.pickerCache.get(String(id)) || app.state.siswa.find((item) => String(item.id) === String(id))
    : null;
  hidden.value = student
    ? String(wrap.dataset.valueField === 'nospp' ? student.nospp : student.id)
    : '';
  input.value = student ? studentPickerLabel(student, wrap) : '';
  wrap.querySelector('.picker-results').hidden = true;
  if (wrap.dataset.picker === 'paymentStudent') {
    app.selectedPaymentStudent = student;
    app.paymentBilling = null;
    app.paymentBillingError = '';
    paymentBillingRequest += 1;
    if (student) loadPaymentBilling(student);
    else {
      resetMonthlyPaymentRows();
      renderPaymentBillingStatus();
    }
  }
}

let pickerSeq = 0;

async function renderPickerResults(wrap) {
  const input = wrap.querySelector('.picker-input');
  const results = wrap.querySelector('.picker-results');
  const keyword = input.value.trim().toLowerCase();
  let matches;
  if (app.server) {
    const seq = ++pickerSeq;
    const searchRpc = app.provisionalEnrollmentReady
      ? 'spp_app_search_students_v2'
      : 'spp_app_search_students_v1';
    const { data, error } = await app.supabase.rpc(searchRpc, { p_q: cleanKeyword(keyword), p_limit: 8 });
    if (seq !== pickerSeq) return;
    if (error) {
      results.innerHTML = `<div class="picker-empty">Pencarian gagal: ${escapeHtml(error.message)}</div>`;
      results.hidden = false;
      return;
    }
    matches = (data || []).map((row) => ({
      id: String(row.id_siswa), nama: row.nama, kdsek: row.kdsek, kdkls: row.kdkls,
      nospp: row.nospp || '', tahunAjaran: row.tahun_ajaran || ''
    }));
    matches.forEach((item) => app.pickerCache.set(item.id, item));
  } else {
    matches = app.state.siswa
      .filter((item) => wrap.dataset.picker === 'paymentStudent' || /^\d+$/.test(item.id))
      .filter((item) => !keyword || `${item.nama} ${item.id} ${item.kdkls} ${item.nospp}`.toLowerCase().includes(keyword))
      .slice(0, 8)
      .map((item) => ({ ...item, tahunAjaran: item.tahunAjaran || '' }));
  }
  results.innerHTML = matches.length
    ? matches.map((item) => `
      <button type="button" class="picker-option" data-pick-id="${escapeHtml(item.id)}">
        <strong>${escapeHtml(item.nama)}</strong>
        <span>${escapeHtml(getSchoolName(item.kdsek))} &middot; ${item.kdkls ? `Kelas ${escapeHtml(item.kdkls)}` : 'Kelas belum ditentukan'} &middot; ID ${escapeHtml(formatStudentId(item.id))}${item.nospp ? ` &middot; ${escapeHtml(item.nospp)}` : ''}</span>
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
      if (wrap.dataset.picker === 'paymentStudent') {
        app.selectedPaymentStudent = null;
        app.paymentBilling = null;
        app.paymentBillingError = '';
        paymentBillingRequest += 1;
        resetMonthlyPaymentRows();
        renderPaymentBillingStatus();
      }
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
  populateStudentYearOptions(currentAcademicYear());
  ['studentDpp', 'studentDsp', 'studentSeragam', 'studentGiat', 'studentSpp', 'studentKomp'].forEach((key) => {
    ui[key].value = formatRupiah(0);
  });
  populateExistingStudents();
  populateStudentClassSelect();
  updateStudentFormMode();
  ui.studentSubmitBtn.textContent = 'Simpan Siswa';
  ui.studentEditSummary.innerHTML = '';
  ui.studentEffective.value = '';
  app.editingEnrollment = null;
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
  app.paymentBillingCache.clear();
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
  if (ui.studentType.value === 'ubah') {
    await saveEnrollmentFees();
    return;
  }
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
    closeStudentDialog();
    resetStudentForm();
    alert(data.nospp
      ? `Tersimpan. No. SPP: ${data.nospp} (ID siswa ${data.id_siswa}).`
      : `Siswa tersimpan. Sekolah sudah dicatat; tentukan kelas nanti untuk membuat No. SPP final. ID siswa ${data.id_siswa}.`);
  } catch (error) {
    alert(error.message || 'Data siswa tidak dapat disimpan.');
  }
}

async function changeStudentSpp(nospp) {
  const row = app.state.siswa.find((item) => item.nospp === nospp);
  if (!row || !row.tahunAjaran) {
    alert('Perubahan tagihan hanya untuk siswa yang terdaftar lewat aturan baru.');
    return;
  }
  openStudentDialog('ubah');
  app.editingEnrollment = row;
  populateStudentYearOptions(row.tahunAjaran);
  ui.studentDpp.value = formatRupiah(row.dpp || 0);
  ui.studentDsp.value = formatRupiah(row.dsp || 0);
  ui.studentSeragam.value = formatRupiah(row.seragam || 0);
  ui.studentGiat.value = formatRupiah(row.giat || 0);
  ui.studentSpp.value = formatRupiah(row.spp || 0);
  ui.studentKomp.value = formatRupiah(row.komp || 0);
  const [start] = row.tahunAjaran.split('-').map(Number);
  ui.studentEffective.value = `${start}-07`;
  ui.studentEditSummary.innerHTML = `
    <strong>${escapeHtml(row.nama)}</strong>
    <span>${escapeHtml(getSchoolName(row.kdsek))} &middot; Kelas ${escapeHtml(row.kdkls)} &middot; TA ${escapeHtml(row.tahunAjaran)}</span>
    <span class="student-sub">${escapeHtml(row.nospp)}</span>`;
}

async function saveEnrollmentFees() {
  const row = app.editingEnrollment;
  const spp = parseMoney(ui.studentSpp.value);
  const komp = parseMoney(ui.studentKomp.value);
  const feeChanged = spp !== Number(row.spp || 0) || komp !== Number(row.komp || 0);
  if (feeChanged && !ui.studentEffective.value) {
    alert('Isi periode berlaku untuk perubahan SPP/Komputer.');
    return;
  }
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('update_enrollment_fees_v1', {
      ...credentials,
      p_id_siswa: row.id,
      p_tahun_ajaran: row.tahunAjaran,
      p_dpp: parseMoney(ui.studentDpp.value),
      p_dsp: parseMoney(ui.studentDsp.value),
      p_seragam: parseMoney(ui.studentSeragam.value),
      p_giat: parseMoney(ui.studentGiat.value),
      p_spp: spp,
      p_komp: komp,
      p_effective_period: feeChanged ? toPeriode(ui.studentEffective.value) : null
    });
    if (error) throw error;
    closeStudentDialog();
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'Tagihan gagal diubah. Pastikan migration 014 sudah dijalankan.');
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

async function renameStudent(id, current) {
  const input = window.prompt('Nama siswa:', current || '');
  if (input === null) return;
  const nama = titleCase(input.trim());
  if (!nama) {
    alert('Nama tidak boleh kosong.');
    return;
  }
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('rename_student_v1', { ...credentials, p_id_siswa: String(id), p_nama: nama });
    if (error) throw error;
    app.selectedNames.delete(String(id));
    app.pickerCache.delete(String(id));
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'Nama gagal diubah. Pastikan migration 013 sudah dijalankan.');
  }
}

async function applyBulkDelete() {
  const ids = getSelectedStudentIds();
  if (!ids.length) {
    alert('Centang siswa di tabel terlebih dahulu.');
    return;
  }
  const year = currentYearScope();
  const scope = year ? `data SPP tahun ajaran ${year}` : 'SELURUH data (semua tahun, tunggakan, dan data siswa)';
  if (!window.confirm(`Hapus ${scope} untuk ${ids.length} siswa terpilih? Tindakan ini tidak bisa dibatalkan.`)) return;
  try {
    const credentials = requireStudentRules();
    const { error } = await app.supabase.rpc('delete_students_v1', { ...credentials, p_ids: ids, p_tahun: year || null });
    if (error) throw error;
    app.selectedStudents.clear();
    app.selectedNames.clear();
    app.pickerCache.clear();
    await reloadStudentData();
  } catch (error) {
    alert(error.message || 'Data gagal dihapus. Pastikan migration 013 sudah dijalankan.');
  }
}

const IMPORT_COLUMNS = ['jenis', 'tahun_ajaran', 'id_siswa', 'nama', 'no_wa', 'kdsek', 'kdkls', 'periode_masuk', 'dpp', 'dsp', 'seragam', 'giat', 'spp', 'komp'];

const BACKUP_TABLES = ['mastsek', 'mastank', 'mastspp', 'pembayaran', 'spp_app_bank_settings', 'spp_app_school_settings',
  'spp_app_school_classes', 'spp_app_va_settings', 'spp_app_students', 'spp_app_enrollments', 'spp_app_arrears',
  'spp_app_payments', 'spp_app_payment_batches'];

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

function normalizeImportHeader(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function importDateValue(value) {
  if (value === '' || value === null || value === undefined) return localDateInputValue();
  let iso = '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    iso = `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
  } else if (typeof value === 'number' && window.XLSX?.SSF) {
    const parsed = window.XLSX.SSF.parse_date_code(value);
    if (parsed) iso = `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  } else {
    const text = String(value).trim();
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
    if (match) iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
    match = match || /^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/.exec(text);
    if (match && !iso) {
      let day = Number(match[1]);
      let month = Number(match[2]);
      if (month > 12 && day <= 12) [day, month] = [month, day];
      iso = `${match[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
    if (!iso) {
      const parsed = new Date(text);
      if (!Number.isNaN(parsed.getTime())) {
        iso = `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`;
      }
    }
  }
  const [year, month, day] = iso.split('-').map(Number);
  const parsedDate = new Date(year, month - 1, day);
  if (!iso || Number.isNaN(parsedDate.getTime()) || parsedDate.getFullYear() !== year
      || parsedDate.getMonth() !== month - 1 || parsedDate.getDate() !== day) {
    throw new Error(`Tanggal "${value}" tidak dikenali. Gunakan format YYYY-MM-DD atau DD/MM/YYYY.`);
  }
  if (iso > localDateInputValue()) throw new Error(`Tanggal "${iso}" tidak boleh di masa depan.`);
  return iso;
}

function importPeriodValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getMonth() + 1).padStart(2, '0')}${value.getFullYear()}`;
  }
  const text = String(value || '').trim();
  let match = /^(\d{4})-(\d{1,2})$/.exec(text);
  if (!match) match = /^(\d{4})-(\d{1,2})-\d{1,2}$/.exec(text);
  if (match) return `${match[2].padStart(2, '0')}${match[1]}`;
  match = /^(\d{1,2})[/. -](\d{4})$/.exec(text);
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 12) {
    return `${match[1].padStart(2, '0')}${match[2]}`;
  }
  match = /^(0[1-9]|1[0-2])(\d{4})$/.exec(text);
  if (match) return text;
  return '';
}

function parseImportedAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.round(value) : 0;
  const text = String(value || '').trim();
  const digits = text.replace(/[^\d]/g, '');
  const amount = Number(digits || 0);
  return text.startsWith('-') ? -amount : amount;
}

async function parsePaymentImportFile(file) {
  const extension = file.name.split('.').pop().toLowerCase();
  let table;
  if (extension === 'csv') {
    table = parseCsv(await file.text());
  } else {
    if (!window.XLSX) throw new Error('Pembaca Excel tidak tersedia. Muat ulang aplikasi lalu coba lagi.');
    const workbook = window.XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) throw new Error('File Excel tidak memiliki lembar kerja.');
    table = window.XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: true, defval: '' });
  }
  const header = (table.shift() || []).map(normalizeImportHeader);
  const findColumn = (...names) => header.findIndex((item) => names.includes(item));
  const columns = {
    nospp: findColumn('nosp', 'nomorspp'),
    nama: findColumn('nama', 'namasiswa', 'siswa'),
    nominal: findColumn('nominal', 'jumlah', 'jumlahbayar', 'amount', 'total'),
    tanggal: findColumn('tanggal', 'tanggalbayar', 'tanggaluangmasuk', 'tanggaltransfer', 'tglbyr', 'date', 'transactiondate'),
    periode: findColumn('periode', 'periodetagihan', 'bulan')
  };
  if (columns.nominal < 0 || (columns.nama < 0 && columns.nospp < 0)) {
    throw new Error('File wajib memiliki kolom Nama atau No. SPP dan kolom Nominal. Unduh template untuk format lengkap.');
  }
  const records = table.map((cells, index) => {
    const value = (column) => column < 0 ? '' : cells[column];
    const nama = String(value(columns.nama) || '').trim();
    const nospp = String(value(columns.nospp) || '').trim();
    const nominal = parseImportedAmount(value(columns.nominal));
    if (!nama && !nospp && nominal === 0) return null;
    if ((!nama && !nospp) || nominal <= 0) {
      throw new Error(`Baris ${index + 2}: Nama/No. SPP dan Nominal harus diisi.`);
    }
    const rawDate = value(columns.tanggal);
    return {
      sourceRow: index + 2,
      sourceName: nama,
      sourceNoSpp: nospp,
      nominal,
      tglbyr: importDateValue(rawDate),
      dateWasDefaulted: rawDate === '' || rawDate === null || rawDate === undefined,
      importedPeriod: importPeriodValue(value(columns.periode))
    };
  }).filter(Boolean);
  if (!records.length) throw new Error('File tidak berisi baris pembayaran.');
  if (records.length > 500) throw new Error('Maksimal 500 baris per file.');
  return records;
}

async function searchPaymentStudents(query) {
  if (app.server) {
    const searchRpc = app.provisionalEnrollmentReady
      ? 'spp_app_search_students_v2'
      : 'spp_app_search_students_v1';
    const { data, error } = await app.supabase.rpc(searchRpc, {
      p_q: cleanKeyword(query),
      p_limit: 20
    });
    if (error) throw error;
    return (data || []).map((row) => ({
      id: String(row.id_siswa), nama: row.nama, kdsek: row.kdsek, kdkls: row.kdkls,
      nospp: String(row.nospp || ''), tahunAjaran: row.tahun_ajaran || ''
    }));
  }
  return app.state.siswa
    .filter((item) => !query || `${item.nama} ${item.id} ${item.nospp}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8)
    .map((item) => ({
      id: String(item.id), nama: item.nama, kdsek: item.kdsek, kdkls: item.kdkls,
      nospp: item.nospp, spp: item.spp, komp: item.komp, tahunAjaran: item.tahunAjaran,
      periodeMasuk: item.periodeMasuk || item.periode_masuk || ''
    }));
}

async function mapWithConcurrency(items, limit, callback) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(items[index], index);
    }
  });
  await Promise.all(workers);
  return results;
}

function oldestAnyDuePeriod(billing) {
  return (billing?.periode_bulanan || []).find((item) => (
    Number(item.spp?.sisa || 0) > 0 || Number(item.komp?.sisa || 0) > 0
  ))?.periode || billing?.periode_aktif || '';
}

async function resolvePaymentImportRecord(record) {
  const query = record.sourceNoSpp || record.sourceName;
  let candidates = [];
  let searchError = '';
  try {
    candidates = await searchPaymentStudents(query);
  } catch (error) {
    searchError = error.message || 'Pencarian siswa gagal.';
  }
  const exact = record.sourceNoSpp
    ? candidates.find((item) => item.nospp && item.nospp.toLowerCase() === record.sourceNoSpp.toLowerCase())
    : null;
  const selectedStudent = exact || (!record.sourceNoSpp && candidates.length === 1 ? candidates[0] : null);
  const row = {
    ...record,
    candidates,
    searchQuery: record.sourceNoSpp || record.sourceName,
    selectedId: selectedStudent?.id || '',
    selectedStudent,
    component: '',
    period: record.importedPeriod,
    billing: null,
    billingError: searchError,
    confirmed: false,
    skipped: false
  };
  if (selectedStudent) await loadPaymentImportBilling(row);
  return row;
}

async function loadPaymentImportBilling(row) {
  row.billing = null;
  row.billingError = '';
  if (!row.selectedStudent) return;
  try {
    row.billing = await getPaymentBilling(row.selectedStudent);
    const schedule = row.billing.payment_periods || row.billing.periode_bulanan || [];
    const availablePeriods = schedule.map((item) => item.periode);
    if (!availablePeriods.includes(row.period)) {
      row.period = oldestAnyDuePeriod(row.billing) || availablePeriods[0] || '';
    }
  } catch (error) {
    row.billingError = error.message || 'Tagihan tidak dapat dimuat.';
  }
}

function renderPaymentImportRows() {
  const rows = app.paymentImportRows;
  const componentOptions = PAYMENT_COMPONENTS.map(([key, label]) => (
    `<option value="${key}">${escapeHtml(label)}</option>`
  )).join('');
  ui.paymentImportRows.innerHTML = rows.map((row, index) => {
    const year = row.billing?.tahun_ajaran || currentAcademicYear();
    const schedule = row.billing?.payment_periods || row.billing?.periode_bulanan || [];
    const allowedPeriods = schedule.length
      ? schedule.map((item) => item.periode)
      : academicMonths(year).map((month) => toPeriode(month.key));
    const periodOptions = allowedPeriods.map((value) => (
      `<option value="${value}">${escapeHtml(formatPeriodLabel(value))}</option>`
    )).join('');
    const validPeriod = allowedPeriods.includes(row.period);
    const canConfirm = Boolean(row.selectedStudent?.nospp && row.component && row.nominal > 0
      && ((row.component !== 'spp' && row.component !== 'komp')
        || (row.billing && !row.billingError && validPeriod
          && Number(row.billing.belum_dialokasikan || 0) === 0)));
    const studentOptions = row.candidates.map((student) => (
      `<option value="${escapeHtml(student.id)}" ${student.id === row.selectedId ? 'selected' : ''}>${escapeHtml(student.nama)} · ${escapeHtml(getSchoolName(student.kdsek))} · Kelas ${escapeHtml(student.kdkls)} · ${escapeHtml(student.nospp)}</option>`
    )).join('');
    const periodLabel = row.period
      ? formatPeriodLabel(row.period)
      : (row.billing ? 'Pilih periode' : (row.billingError ? 'Tagihan tidak tersedia' : 'Memuat...'));
    return `<tr data-import-index="${index}" class="${row.skipped ? 'is-skipped' : ''}">
      <td>${escapeHtml(row.sourceName || row.sourceNoSpp)}<small>Baris ${row.sourceRow}</small></td>
      <td><input type="search" data-import-search value="${escapeHtml(row.searchQuery)}" placeholder="Cari nama atau No. SPP" aria-label="Cari siswa pada baris ${row.sourceRow}" />
        <select data-import-student aria-label="Pilih siswa pada baris ${row.sourceRow}"><option value="">Pilih siswa</option>${studentOptions}</select>
        <small>${row.selectedStudent ? `${escapeHtml(getSchoolName(row.selectedStudent.kdsek))} · Kelas ${escapeHtml(row.selectedStudent.kdkls)} · ${escapeHtml(row.selectedStudent.nospp)}` : escapeHtml(row.billingError || 'Pilih kecocokan yang benar.')}</small></td>
      <td><select data-import-component aria-label="Pilih komponen pada baris ${row.sourceRow}"><option value="">Pilih komponen</option>${componentOptions}</select></td>
      <td><select data-import-period aria-label="Pilih periode mulai pada baris ${row.sourceRow}" ${row.component === 'spp' || row.component === 'komp' ? '' : 'disabled'}>
        <option value="">Periode terlama yang disarankan</option>${periodOptions}</select>
        <small>${row.billing && Number(row.billing.belum_dialokasikan || 0) > 0 ? 'Rekonsiliasi pembayaran lama dahulu.' : periodLabel}</small></td>
      <td>${escapeHtml(row.tglbyr)}${row.dateWasDefaulted ? '<small>Tanggal file kosong: gunakan hari ini</small>' : ''}</td>
      <td>${formatRupiah(row.nominal)}</td>
      <td><label class="import-confirm"><input type="checkbox" data-import-confirm ${row.confirmed ? 'checked' : ''} ${canConfirm && !row.skipped ? '' : 'disabled'}>Konfirmasi</label>
        <label class="import-skip"><input type="checkbox" data-import-skip ${row.skipped ? 'checked' : ''}>Lewati</label></td>
    </tr>`;
  }).join('');
  rows.forEach((row, index) => {
    const tr = ui.paymentImportRows.querySelector(`[data-import-index="${index}"]`);
    const component = tr.querySelector('[data-import-component]');
    const period = tr.querySelector('[data-import-period]');
    component.value = row.component;
    period.value = row.period || '';
  });
  const confirmed = rows.filter((row) => row.confirmed).length;
  const skipped = rows.filter((row) => row.skipped).length;
  ui.importPaymentsBtn.disabled = !app.server || !canAccessPayment() || !confirmed || confirmed + skipped !== rows.length;
  ui.paymentImportStatus.textContent = `${rows.length} baris · ${confirmed} dikonfirmasi · ${skipped} dilewati.`
    + (!app.server ? ' Impor memerlukan Supabase dan migration 018.' : '');
}

async function importPaymentFile(file) {
  ui.paymentImportReview.hidden = false;
  ui.paymentImportStatus.textContent = 'Membaca file pembayaran...';
  ui.importPaymentsBtn.disabled = true;
  try {
    if (!canAccessPayment()) throw new Error('Hanya Admin KKMS yang dapat mengimpor pembayaran.');
    const records = await parsePaymentImportFile(file);
    app.paymentImportRows = await mapWithConcurrency(records, 4, resolvePaymentImportRecord);
    renderPaymentImportRows();
  } catch (error) {
    app.paymentImportRows = [];
    ui.paymentImportRows.replaceChildren();
    ui.paymentImportStatus.textContent = error.message || 'File pembayaran tidak dapat dibaca.';
  } finally {
    ui.paymentImportFile.value = '';
  }
}

function downloadPaymentTemplate() {
  if (!window.XLSX) {
    alert('Pembaca Excel tidak tersedia. Coba muat ulang aplikasi.');
    return;
  }
  const workbook = window.XLSX.utils.book_new();
  const template = window.XLSX.utils.aoa_to_sheet([
    ['no_spp', 'nama', 'nominal', 'tanggal_uang_masuk', 'periode'],
    ['', '', '', '', '']
  ]);
  template['!cols'] = [{ wch: 20 }, { wch: 28 }, { wch: 16 }, { wch: 16 }, { wch: 16 }];
  const instructions = window.XLSX.utils.aoa_to_sheet([
    ['Panduan impor pembayaran'],
    ['Isi Nama atau No. SPP dan Nominal.'],
    ['Tanggal uang masuk memakai format YYYY-MM-DD; boleh dikosongkan untuk memakai tanggal hari ini.'],
    ['Waktu file diunggah dicatat otomatis oleh sistem dan tidak menggantikan tanggal uang masuk.'],
    ['Periode opsional; jika kosong, aplikasi menyarankan periode tunggakan terlama.'],
    ['Komponen dan siswa dikonfirmasi satu per satu setelah file dibaca.'],
    ['Simpan satu transaksi pembayaran per baris. Maksimal 500 baris.']
  ]);
  window.XLSX.utils.book_append_sheet(workbook, template, 'Pembayaran');
  window.XLSX.utils.book_append_sheet(workbook, instructions, 'Panduan');
  window.XLSX.writeFile(workbook, 'template_impor_pembayaran.xlsx');
}

async function submitPaymentImport() {
  const rows = app.paymentImportRows;
  const confirmed = rows.filter((row) => row.confirmed && !row.skipped);
  if (!confirmed.length || confirmed.length + rows.filter((row) => row.skipped).length !== rows.length) {
    ui.paymentImportStatus.textContent = 'Konfirmasi atau lewati setiap baris sebelum impor.';
    return;
  }
  if (!window.confirm(`Impor ${confirmed.length} transaksi yang sudah dikonfirmasi?`)) return;
  ui.importPaymentsBtn.disabled = true;
  ui.paymentImportStatus.textContent = 'Menyimpan transaksi...';
  let importedIds = [];
  try {
    const credentials = requireStudentRules();
    const payload = confirmed.map((row) => {
      let items;
      if (row.component === 'spp' || row.component === 'komp') {
        if (!row.billing) throw new Error(`Tagihan ${row.selectedStudent.nama} belum tersedia.`);
        items = allocateMonthlyPayment(row.component, row.nominal, row.billing, row.period);
      } else {
        items = [{ component: row.component, periode: '', nominal: row.nominal }];
      }
      return { nospp: row.selectedStudent.nospp, tglbyr: row.tglbyr, items };
    });
    const { data, error } = await app.supabase.rpc('import_payment_batches_v1', {
      ...credentials,
      p_rows: payload
    });
    if (error) throw error;
    importedIds = Array.isArray(data) ? data.map(String) : [];
    app.paymentImportRows = [];
    ui.paymentImportReview.hidden = true;
  } catch (error) {
    ui.paymentImportStatus.textContent = `Impor gagal: ${error.message || 'Kesalahan tidak diketahui.'}`;
    ui.importPaymentsBtn.disabled = false;
    return;
  }

  const followUpErrors = [];
  try {
    await reloadStudentData();
  } catch (error) {
    followUpErrors.push(`Daftar pembayaran gagal diperbarui: ${error.message || 'Kesalahan tidak diketahui.'}`);
  }
  if (importedIds.length) {
    try {
      await printPaymentBatches(importedIds);
    } catch (error) {
      followUpErrors.push(`Slip gagal dicetak otomatis: ${error.message || 'Kesalahan tidak diketahui.'}`);
    }
  } else {
    followUpErrors.push('Sistem tidak menerima nomor transaksi untuk cetak otomatis.');
  }
  const importedCount = importedIds.length || confirmed.length;
  const summary = `${importedCount} transaksi berhasil diimpor.`;
  alert(followUpErrors.length
    ? `${summary} ${followUpErrors.join(' ')} Slip tetap dapat dicetak dari Riwayat Pembayaran.`
    : `${summary} Dialog cetak berisi satu slip per transaksi sudah dibuka.`);
}

async function handlePaymentImportChange(event) {
  const control = event.target;
  const tr = control.closest('[data-import-index]');
  if (!tr) return;
  const row = app.paymentImportRows[Number(tr.dataset.importIndex)];
  if (!row) return;

  if (control.matches('[data-import-search]')) {
    row.searchQuery = control.value.trim();
    row.billingError = '';
    try {
      row.candidates = await searchPaymentStudents(row.searchQuery);
      const exact = row.sourceNoSpp
        ? row.candidates.find((student) => student.nospp.toLowerCase() === row.sourceNoSpp.toLowerCase())
        : null;
      const matched = exact || (row.candidates.length === 1 ? row.candidates[0] : null);
      row.selectedId = matched?.id || '';
      row.selectedStudent = matched;
      row.period = row.importedPeriod;
      row.confirmed = false;
      row.skipped = false;
      if (matched) await loadPaymentImportBilling(row);
    } catch (error) {
      row.candidates = [];
      row.selectedId = '';
      row.selectedStudent = null;
      row.billingError = error.message || 'Pencarian siswa gagal.';
    }
  } else if (control.matches('[data-import-student]')) {
    row.selectedId = control.value;
    row.selectedStudent = row.candidates.find((student) => student.id === row.selectedId) || null;
    row.confirmed = false;
    row.skipped = false;
    row.period = row.importedPeriod;
    await loadPaymentImportBilling(row);
  } else if (control.matches('[data-import-component]')) {
    row.component = control.value;
    row.confirmed = false;
    row.skipped = false;
    if ((row.component === 'spp' || row.component === 'komp') && row.billing && !row.period) {
      row.period = oldestDuePeriod(row.billing, row.component) || oldestAnyDuePeriod(row.billing);
    }
  } else if (control.matches('[data-import-period]')) {
    row.period = control.value;
    row.confirmed = false;
    row.skipped = false;
  } else if (control.matches('[data-import-confirm]')) {
    row.confirmed = control.checked;
    if (control.checked) row.skipped = false;
  } else if (control.matches('[data-import-skip]')) {
    row.skipped = control.checked;
    if (control.checked) row.confirmed = false;
  }
  renderPaymentImportRows();
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

function openPaymentCorrection(batchId) {
  app.pendingPaymentCorrection = String(batchId);
  ui.paymentCorrectionReason.value = '';
  ui.paymentCorrectionDialog.showModal();
  ui.paymentCorrectionReason.focus();
}

async function voidPaymentBatch(event) {
  event.preventDefault();
  const batchId = app.pendingPaymentCorrection;
  const reason = ui.paymentCorrectionReason.value.trim();
  if (!batchId || reason.length < 5 || reason.length > 500) {
    alert('Alasan koreksi wajib diisi 5 sampai 500 karakter.');
    return;
  }
  ui.paymentCorrectionSubmit.disabled = true;
  if (app.server) {
    let correctionError;
    try {
      const credentials = requireStudentRules();
      const { error } = await app.supabase.rpc('void_payment_batch_v1', {
        ...credentials,
        p_batch_id: Number(batchId),
        p_reason: reason
      });
      if (error) throw error;
    } catch (error) {
      correctionError = error;
    } finally {
      ui.paymentCorrectionSubmit.disabled = false;
    }
    if (correctionError) {
      alert(correctionError.message || 'Transaksi gagal dikoreksi.');
      return;
    }
    ui.paymentCorrectionDialog.close();
    app.pendingPaymentCorrection = null;
    try {
      await printPaymentBatch(batchId, true);
    } catch (error) {
      alert(`Koreksi tersimpan, tetapi slip koreksi gagal dimuat atau dicetak: ${error.message || 'Kesalahan tidak diketahui.'}`);
    }
    try {
      await reloadStudentData();
    } catch (error) {
      alert(`Koreksi tersimpan, tetapi daftar pembayaran gagal diperbarui: ${error.message || 'Kesalahan tidak diketahui.'}`);
    }
    return;
  }

  const correctionNo = `KOR-${new Date().getFullYear()}-${Date.now()}`;
  app.state.transaksi.forEach((item) => {
    if (String(item.batch_id || item.id) === batchId) {
      Object.assign(item, {
        voided_at: new Date().toISOString(),
        void_reason: reason,
        correction_no: correctionNo,
        correction_created_at: new Date().toISOString(),
        correction_operator_code: getCurrentOperatorCode()
      });
    }
  });
  saveLocalData();
  ui.paymentCorrectionDialog.close();
  renderPaymentList();
  renderDashboard();
  renderReport();
  app.pendingPaymentCorrection = null;
  try {
    await printPaymentBatch(batchId, true);
  } catch (error) {
    alert(`Koreksi tersimpan, tetapi slip koreksi gagal dimuat atau dicetak: ${error.message || 'Kesalahan tidak diketahui.'}`);
  } finally {
    ui.paymentCorrectionSubmit.disabled = false;
  }
}

function paymentBillingCutoff(year, now = new Date()) {
  const match = /^(\d{4})-(\d{4})$/.exec(String(year || ''));
  if (!match || Number(match[2]) !== Number(match[1]) + 1) return '';
  const start = Number(match[1]);
  const currentStart = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  if (start > currentStart) return `${start + 1}-06`;
  if (start < currentStart) return `${start + 1}-06`;
  const horizon = new Date(now.getFullYear(), now.getMonth() + 2, 1);
  const academicEnd = new Date(start + 1, 5, 1);
  const cutoff = horizon > academicEnd ? academicEnd : horizon;
  return `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}`;
}

function paymentPeriodSequence(period) {
  const match = /^(0[1-9]|1[0-2])(\d{4})$/.exec(String(period || ''));
  return match ? Number(match[2]) * 12 + Number(match[1]) : 0;
}

function buildLocalPaymentBilling(student, year, cutoff) {
  const entryPeriod = String(student.periodeMasuk || student.periode_masuk || '');
  const months = academicMonths(year).filter((month) => (
    month.key <= cutoff
    && (!entryPeriod || paymentPeriodSequence(toPeriode(month.key)) >= paymentPeriodSequence(entryPeriod))
  ));
  const transactions = app.state.transaksi.filter((item) => item.nospp === student.nospp && !item.voided_at);
  let sppCredit = 0;
  let kompCredit = 0;
  let sppTotal = 0;
  let kompTotal = 0;
  const periods = months.map((month) => {
    const period = toPeriode(month.key);
    const sppTarget = Number(student.spp || 0);
    const kompTarget = Number(student.komp || 0);
    const sppPaid = transactions.filter((item) => ['spp', 'spp_bos'].includes(item.component) && item.periode === period)
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const kompPaid = transactions.filter((item) => item.component === 'komp' && item.periode === period)
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const sppCreditIn = sppCredit;
    const kompCreditIn = kompCredit;
    const sppRemaining = Math.max(sppTarget - sppPaid - sppCreditIn, 0);
    const kompRemaining = Math.max(kompTarget - kompPaid - kompCreditIn, 0);
    sppCredit = Math.max(sppPaid + sppCredit - sppTarget, 0);
    kompCredit = Math.max(kompPaid + kompCredit - kompTarget, 0);
    sppTotal += sppRemaining;
    kompTotal += kompRemaining;
    return {
      periode: period,
      spp: { tagihan: sppTarget, dibayar: sppPaid, saldo_dibawa: sppCreditIn, sisa: sppRemaining },
      komp: { tagihan: kompTarget, dibayar: kompPaid, saldo_dibawa: kompCreditIn, sisa: kompRemaining }
    };
  });
  const legacy = transactions.filter((item) => item.component === 'legacy')
    .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
  return {
    id_siswa: student.id,
    tahun_ajaran: year,
    periode_masuk: entryPeriod,
    periode_aktif: periods[periods.length - 1]?.periode || toPeriode(cutoff),
    periode_bulanan: periods,
    sisa_spp: sppTotal,
    sisa_komp: kompTotal,
    sisa_satu_kali: 0,
    sisa_total: sppTotal + kompTotal,
    belum_dialokasikan: legacy
  };
}

async function appendFuturePaymentPeriods(student, billing) {
  const currentPeriods = billing.periode_bulanan || [];
  const lastCurrentPeriod = currentPeriods[currentPeriods.length - 1]?.periode || billing.periode_aktif;
  const sequenceEnd = paymentPeriodSequence(lastCurrentPeriod);
  const academicPeriods = academicMonths(billing.tahun_ajaran).map((month) => toPeriode(month.key));
  const billingEnd = paymentPeriodSequence(toPeriode(paymentBillingCutoff(billing.tahun_ajaran)));
  let futurePeriods = academicPeriods.filter((period) => (
    paymentPeriodSequence(period) > sequenceEnd && paymentPeriodSequence(period) <= billingEnd
  ));
  if (!futurePeriods.length) {
    billing.payment_periods = currentPeriods;
    return billing;
  }

  let enrollment = { spp: student.spp, komp: student.komp, periode_masuk: student.periodeMasuk };
  let historyRows = [];
  let futurePayments = [];
  if (app.server) {
    const [enrollmentResult, historyResult] = await Promise.all([
      app.supabase.from('spp_app_enrollments')
        .select('spp,komp,periode_masuk')
        .eq('id_siswa', String(student.id))
        .eq('tahun_ajaran', billing.tahun_ajaran)
        .maybeSingle(),
      app.supabase.from('spp_app_spp_history')
        .select('effective_date,spp,komp')
        .eq('id_siswa', String(student.id))
        .eq('tahun_ajaran', billing.tahun_ajaran)
        .order('effective_date', { ascending: true })
    ]);
    if (enrollmentResult.error) throw enrollmentResult.error;
    if (historyResult.error) throw historyResult.error;
    enrollment = enrollmentResult.data || enrollment;
    if (futurePeriods.length) {
      const { data, error } = await app.supabase.from('spp_app_payment_list')
        .select('component,periode,nominal')
        .eq('nospp', student.nospp)
        .is('voided_at', null)
        .in('component', ['spp', 'spp_bos', 'komp'])
        .in('periode', futurePeriods);
      if (error) throw error;
      futurePayments = data || [];
    }
    historyRows = historyResult.data || [];
  } else {
    futurePayments = app.state.transaksi.filter((item) => (
      item.nospp === student.nospp && ['spp', 'spp_bos', 'komp'].includes(item.component)
      && futurePeriods.includes(item.periode) && !item.voided_at
    ));
  }

  const entryPeriod = String(enrollment.periode_masuk || '');
  if (entryPeriod) {
    futurePeriods = futurePeriods.filter((period) => (
      paymentPeriodSequence(period) >= paymentPeriodSequence(entryPeriod)
    ));
  }
  const last = currentPeriods[currentPeriods.length - 1];
  let sppTarget = Number(last?.spp?.tagihan ?? enrollment.spp ?? 0);
  let kompTarget = Number(last?.komp?.tagihan ?? enrollment.komp ?? 0);
  let sppCredit = last
    ? Math.max(Number(last.spp?.dibayar || 0) + Number(last.spp?.saldo_dibawa || 0) - sppTarget, 0)
    : 0;
  let kompCredit = last
    ? Math.max(Number(last.komp?.dibayar || 0) + Number(last.komp?.saldo_dibawa || 0) - kompTarget, 0)
    : 0;
  const extendedPeriods = [...currentPeriods];

  futurePeriods.forEach((period) => {
    const effectiveDate = `${period.slice(2)}-${period.slice(0, 2)}-01`;
    const rate = historyRows.reduce((latest, item) => (
      item.effective_date <= effectiveDate ? item : latest
    ), null);
    if (rate) {
      sppTarget = Number(rate.spp);
      kompTarget = Number(rate.komp);
    }
    const sppPaid = futurePayments.filter((item) => ['spp', 'spp_bos'].includes(item.component) && item.periode === period)
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const kompPaid = futurePayments.filter((item) => item.component === 'komp' && item.periode === period)
      .reduce((sum, item) => sum + Number(item.nominal || 0), 0);
    const sppCreditIn = sppCredit;
    const kompCreditIn = kompCredit;
    const sppRemaining = Math.max(sppTarget - sppPaid - sppCreditIn, 0);
    const kompRemaining = Math.max(kompTarget - kompPaid - kompCreditIn, 0);
    sppCredit = Math.max(sppPaid + sppCreditIn - sppTarget, 0);
    kompCredit = Math.max(kompPaid + kompCreditIn - kompTarget, 0);
    extendedPeriods.push({
      periode: period,
      spp: { tagihan: sppTarget, dibayar: sppPaid, saldo_dibawa: sppCreditIn, sisa: sppRemaining },
      komp: { tagihan: kompTarget, dibayar: kompPaid, saldo_dibawa: kompCreditIn, sisa: kompRemaining }
    });
  });
  billing.payment_periods = extendedPeriods;
  return billing;
}

async function getPaymentBilling(student, includeFuturePeriods = false) {
  let year = student.tahunAjaran || '';
  if (app.server && !year) {
    const { data, error } = await app.supabase.from('spp_app_student_overview')
      .select('tahun_ajaran')
      .eq('id_siswa', student.id)
      .order('tahun_ajaran', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    year = data?.tahun_ajaran || '';
  }
  year = year || currentAcademicYear();
  const cutoff = paymentBillingCutoff(year);
  if (!cutoff) throw new Error(`Tagihan bulanan untuk tahun ajaran ${year} belum aktif.`);
  const period = toPeriode(cutoff);
  const cacheKey = `${student.id}|${year}|${period}|${includeFuturePeriods ? 'future' : 'current'}`;
  if (app.paymentBillingCache.has(cacheKey)) return app.paymentBillingCache.get(cacheKey);

  let billing;
  if (app.server) {
    const isFutureYear = Number(year.slice(0, 4)) > Number(currentAcademicYear().slice(0, 4));
    const { data, error } = isFutureYear
      ? await app.supabase.rpc('spp_app_student_prepaid_billing_v1', {
        p_id_siswa: String(student.id),
        p_tahun: year
      })
      : await app.supabase.rpc('spp_app_student_billing_annual_v1', {
        p_id_siswa: String(student.id),
        p_tahun: year,
        p_periode: period
      });
    if (error) throw error;
    if (!data) throw new Error(`Tagihan tahun ajaran ${year} tidak ditemukan untuk siswa ini.`);
    billing = data;
    if (!isFutureYear) {
      const { data: activity, error: activityError } = await app.supabase.rpc('spp_app_activity_ledger_v1', {
        p_id_siswa: String(student.id),
        p_tahun: year
      });
      if (activityError) throw activityError;
      const previous = billing.komponen_satu_kali?.giat || {};
      const next = {
        ...previous,
        tagihan: Number(activity?.tagihan || 0),
        dibayar: Number(activity?.dibayar || 0),
        sisa: Number(activity?.sisa || 0),
        rincian: activity?.rincian || []
      };
      billing.komponen_satu_kali = { ...(billing.komponen_satu_kali || {}), giat: next };
      billing.sisa_satu_kali = Math.max(
        Number(billing.sisa_satu_kali || 0) - Number(previous.sisa || 0) + next.sisa,
        0
      );
      billing.sisa_total = Math.max(
        Number(billing.sisa_total || 0) - Number(previous.sisa || 0) + next.sisa,
        0
      );
    }
  } else {
    billing = buildLocalPaymentBilling(student, year, cutoff);
  }
  billing.tahun_ajaran = billing.tahun_ajaran || year;
  if (includeFuturePeriods) await appendFuturePaymentPeriods(student, billing);
  else billing.payment_periods = billing.periode_bulanan || [];
  app.paymentBillingCache.set(cacheKey, billing);
  return billing;
}

function paymentHistoryStatusMarkup(status) {
  const label = String(status || '-');
  const normalized = label.toLowerCase();
  const stateClass = normalized === 'lunas'
    ? 'is-paid'
    : normalized === 'cicilan'
      ? 'is-partial'
      : normalized === 'belum bayar'
        ? 'is-unpaid'
        : 'is-neutral';
  return `<span class="payment-state ${stateClass}">${escapeHtml(label)}</span>`;
}

function getPaymentPeriodStatus(component) {
  if (component?.status) return component.status;
  const target = Number(component?.tagihan || 0);
  if (!target) return '-';
  if (Number(component?.sisa || 0) === 0) return 'Lunas';
  if (Number(component?.dibayar || 0) + Number(component?.saldo_dibawa || 0) > 0) return 'Cicilan';
  return 'Belum bayar';
}

function groupPaymentHistoryTransactions(transactions) {
  const groups = new Map();
  transactions.forEach((item, index) => {
    const key = item.batch_id != null
      ? `batch:${item.batch_id}`
      : item.receipt_no
        ? `receipt:${item.receipt_no}`
        : `payment:${item.payment_id || item.id || index}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        receiptNo: item.receipt_no || `#${item.batch_id || item.payment_id || item.id || '-'}`,
        date: item.tglbyr,
        allocations: [],
        total: 0,
        voided: false,
        voidReason: ''
      };
      groups.set(key, group);
    }
    group.allocations.push(item);
    group.total += Number(item.nominal || 0);
    group.voided = group.voided || Boolean(item.voided_at);
    group.voidReason = group.voidReason || item.void_reason || '';
  });
  return [...groups.values()];
}

function renderStudentPaymentDetails(billing, transactions) {
  const periods = billing?.periode_bulanan || [];
  ui.paymentPeriodHistory.innerHTML = periods.length
    ? periods.map((item) => `
      <tr>
        <th scope="row">${escapeHtml(formatPeriodLabel(item.periode))}</th>
        <td>${paymentHistoryStatusMarkup(getPaymentPeriodStatus(item.spp))}
          <small>${formatRupiah(Number(item.spp?.dibayar || 0))} / ${formatRupiah(Number(item.spp?.tagihan || 0))}</small>
        </td>
        <td>${paymentHistoryStatusMarkup(getPaymentPeriodStatus(item.komp))}
          <small>${formatRupiah(Number(item.komp?.dibayar || 0))} / ${formatRupiah(Number(item.komp?.tagihan || 0))}</small>
        </td>
      </tr>
    `).join('')
    : '<tr><td colspan="3" class="empty-state">Belum ada periode tagihan pada tahun ajaran ini.</td></tr>';

  const oneTimeComponents = [
    ['dpp', 'DPP'],
    ['dsp', 'DPS'],
    ['seragam', 'Seragam'],
    ['giat', 'Kegiatan']
  ];
  const oneTimeRows = oneTimeComponents
    .map(([key, label]) => {
      const component = billing?.komponen_satu_kali?.[key];
      if (!component || (!Number(component.tagihan || 0) && !Number(component.dibayar || 0))) return '';
      return `
        <tr>
          <th scope="row">${label}</th>
          <td>${formatRupiah(Number(component.tagihan || 0))}</td>
          <td>${formatRupiah(Number(component.dibayar || 0))}</td>
          <td>${formatRupiah(Number(component.sisa || 0))}</td>
          <td>${paymentHistoryStatusMarkup(getPaymentPeriodStatus(component))}</td>
        </tr>
      `;
    })
    .filter(Boolean);
  ui.paymentOneTimeHistory.innerHTML = oneTimeRows.length
    ? oneTimeRows.join('')
    : '<tr><td colspan="5" class="empty-state">Belum ada tagihan DPP, DPS, seragam, atau kegiatan.</td></tr>';

  const paymentGroups = groupPaymentHistoryTransactions(transactions);
  ui.paymentTransactionHistory.innerHTML = paymentGroups.length
    ? paymentGroups.map((group) => {
      const allocations = group.allocations.map((item) => {
        const activityYears = Array.isArray(item.activity_allocations)
          ? item.activity_allocations
            .map((allocation) => String(allocation.tahun_ajaran || ''))
            .filter(Boolean)
          : [];
        const label = getPaymentComponentLabel(item.component)
          + (item.periode ? ` · ${formatPeriodLabel(item.periode)}` : '');
        const detail = item.component === 'giat' && activityYears.length
          ? `${label} · alokasi TA ${activityYears.join(', ')}`
          : label;
        return `<div class="payment-history-allocation-item">
          <span>${escapeHtml(detail)}</span><strong>${formatRupiah(Number(item.nominal || 0))}</strong>
        </div>`;
      }).join('');
      return `
        <tr class="${group.voided ? 'is-voided' : ''}">
          <td>${escapeHtml(formatDateTime(group.date))}</td>
          <td>${escapeHtml(group.receiptNo)}</td>
          <td><div class="payment-history-allocation">${allocations}</div></td>
          <td><strong>${formatRupiah(group.total)}</strong></td>
          <td><span class="payment-state ${group.voided ? 'is-neutral' : 'is-paid'}"
            ${group.voided && group.voidReason ? `title="${escapeHtml(group.voidReason)}"` : ''}>${group.voided ? 'Dikoreksi' : 'Tercatat'}</span></td>
        </tr>
      `;
    }).join('')
    : '<tr><td colspan="5" class="empty-state">Belum ada transaksi pembayaran untuk siswa ini.</td></tr>';
  ui.paymentHistoryDialog.querySelector('form').scrollTop = 0;
  ui.paymentHistoryDialog.querySelectorAll('.table-wrap').forEach((wrap) => { wrap.scrollLeft = 0; });
}

async function loadStudentPaymentDetails(student) {
  const year = student.tahunAjaran || currentYearScope() || currentAcademicYear();
  const cutoff = paymentBillingCutoff(year);
  if (!cutoff) throw new Error(`Tahun ajaran ${year} belum memiliki periode tagihan aktif.`);
  const period = toPeriode(cutoff);
  if (app.server) {
    if (!app.cardPrintCredentials) throw new Error('Sesi login tidak tersedia. Keluar lalu masuk kembali untuk memuat riwayat.');
    const { data, error } = await app.supabase.rpc('spp_app_student_payment_history_v1', {
      p_username: app.cardPrintCredentials.username,
      p_password: app.cardPrintCredentials.password,
      p_id_siswa: String(student.id),
      p_nospp: student.nospp,
      p_kdsek: student.kdsek,
      p_tahun: year,
      p_periode: period
    });
    if (error) throw error;
    if (!data || !data.billing) throw new Error('Riwayat atau status periode siswa tidak tersedia.');
    return { billing: data.billing, transactions: data.transactions || [] };
  }

  return {
    billing: buildLocalPaymentBilling(student, year, cutoff),
    transactions: app.state.transaksi
      .filter((item) => item.nospp === student.nospp && item.kdsek === student.kdsek)
      .sort((a, b) => new Date(b.tglbyr) - new Date(a.tglbyr))
  };
}

async function openStudentPaymentHistory(student) {
  if (!app.user) return;
  if (!student || (app.user.role === 'unit' && student.kdsek !== app.user.unit)) {
    alert('Anda tidak memiliki akses ke riwayat pembayaran siswa dari unit lain.');
    return;
  }
  const request = ++app.paymentHistoryRequest;
  ui.paymentHistoryStudent.textContent = [
    student.nama,
    student.kdkls ? `Kelas ${student.kdkls}` : 'Kelas belum ditentukan',
    student.nospp ? `No. SPP ${student.nospp}` : 'Menunggu No. SPP'
  ].join(' · ');
  ui.paymentHistoryYear.textContent = `Tahun ajaran ${student.tahunAjaran || currentAcademicYear()}`;
  ui.paymentPeriodHistory.innerHTML = '<tr><td colspan="3" class="empty-state">Memuat status periode...</td></tr>';
  ui.paymentOneTimeHistory.innerHTML = '<tr><td colspan="5" class="empty-state">Memuat rincian pembayaran...</td></tr>';
  ui.paymentTransactionHistory.innerHTML = '<tr><td colspan="5" class="empty-state">Memuat riwayat pembayaran...</td></tr>';
  if (!ui.paymentHistoryDialog.open) ui.paymentHistoryDialog.showModal();
  try {
    const details = await loadStudentPaymentDetails(student);
    if (request !== app.paymentHistoryRequest) return;
    renderStudentPaymentDetails(details.billing, details.transactions);
  } catch (error) {
    if (request !== app.paymentHistoryRequest) return;
    console.error('Unable to load student payment history:', error);
    const message = escapeHtml(error.message || 'Riwayat pembayaran gagal dimuat.');
    ui.paymentPeriodHistory.innerHTML = `<tr><td colspan="3" class="empty-state">${message}</td></tr>`;
    ui.paymentOneTimeHistory.innerHTML = `<tr><td colspan="5" class="empty-state">${message}</td></tr>`;
    ui.paymentTransactionHistory.innerHTML = `<tr><td colspan="5" class="empty-state">${message}</td></tr>`;
  }
}

function oldestDuePeriod(billing, component) {
  const period = (billing?.periode_bulanan || []).find((item) => Number(item[component]?.sisa || 0) > 0);
  return period?.periode || billing?.periode_aktif || '';
}

function renderPaymentBillingStatus() {
  const student = app.selectedPaymentStudent;
  const billing = app.paymentBilling;
  if (!student) {
    ui.paymentBillingStatus.classList.remove('is-warning');
    ui.paymentBillingStatus.textContent = 'Pilih siswa untuk melihat sisa tagihan dan urutan alokasi.';
    return;
  }
  if (app.paymentBillingError) {
    ui.paymentBillingStatus.classList.add('is-warning');
    ui.paymentBillingStatus.textContent = `Tagihan bulanan belum dapat dihitung: ${app.paymentBillingError}`;
    return;
  }
  if (!billing) {
    ui.paymentBillingStatus.classList.remove('is-warning');
    ui.paymentBillingStatus.textContent = 'Memuat tagihan siswa...';
    return;
  }
  const oldest = paymentSchedule(billing).find((period) => (
    Number(period.spp?.sisa || 0) > 0 || Number(period.komp?.sisa || 0) > 0
  ))?.periode;
  const entryPeriod = billing.periode_masuk
    || billing.periode_bulanan?.[0]?.periode
    || paymentSchedule(billing)[0]?.periode;
  const legacy = Number(billing.belum_dialokasikan || 0);
  const oneTimeBreakdown = Object.entries(billing.komponen_satu_kali || {})
    .filter(([, item]) => Number(item.sisa || 0) > 0)
    .map(([key, item]) => `
      <div class="payment-billing-arrear">
        <div class="payment-billing-line">
          <span>${escapeHtml(getPaymentComponentLabel(key))}</span>
          <b>${formatRupiah(item.sisa)}</b>
        </div>
        ${arrearsPeriodDetailsMarkup(item)}
      </div>
    `).join('');
  ui.paymentBillingStatus.classList.toggle('is-warning', legacy > 0);
  ui.paymentBillingStatus.innerHTML = `
    <div class="payment-billing-layout">
      <div class="payment-billing-columns">
        <section class="payment-billing-group">
          <strong>SPP &amp; Komputer</strong>
          <div class="payment-billing-line"><span>SPP</span><b>${formatRupiah(billing.sisa_spp || 0)}</b></div>
          <div class="payment-billing-line"><span>Komputer</span><b>${formatRupiah(billing.sisa_komp || 0)}</b></div>
        </section>
        <section class="payment-billing-group">
          <strong>Komponen lainnya</strong>
          ${oneTimeBreakdown || '<div class="payment-billing-empty">Tidak ada sisa komponen lainnya.</div>'}
          <div class="payment-billing-line payment-billing-subtotal">
            <span>Total komponen</span>
            <b>${formatRupiah(billing.sisa_satu_kali || 0)}</b>
          </div>
        </section>
      </div>
      <div class="payment-billing-meta">
        <div><span>Total sisa</span><b>${formatRupiah(billing.sisa_total || 0)}</b></div>
        <div><span>Periode masuk</span><b>${escapeHtml(entryPeriod ? formatPeriodLabel(entryPeriod) : 'Belum diatur')}</b></div>
        <div><span>Periode tertua belum lunas</span><b>${escapeHtml(oldest ? formatPeriodLabel(oldest) : 'Tidak ada')}</b></div>
      </div>
      ${legacy > 0
        ? `<p class="payment-billing-legacy">Pembayaran lama belum dialokasikan: ${formatRupiah(legacy)}. Alokasi otomatis ditahan sampai direkonsiliasi.</p>`
        : ''}
    </div>`;
}

let paymentBillingRequest = 0;

async function loadPaymentBilling(student) {
  const request = ++paymentBillingRequest;
  app.paymentBilling = null;
  app.paymentBillingError = '';
  resetMonthlyPaymentRows();
  renderPaymentBillingStatus();
  try {
    const billing = await getPaymentBilling(student, true);
    if (request !== paymentBillingRequest) return;
    app.paymentBilling = billing;
  } catch (error) {
    if (request !== paymentBillingRequest) return;
    app.paymentBillingError = error.message || 'Rincian tagihan tidak tersedia.';
  }
  renderPaymentBillingStatus();
  updatePaymentAllocationRows();
}

function paymentSchedule(billing = app.paymentBilling) {
  return billing?.payment_periods || billing?.periode_bulanan || [];
}

function defaultPaymentPeriod(billing = app.paymentBilling) {
  const schedule = paymentSchedule(billing);
  const oldestDue = schedule.find((item) => (
    Number(item.spp?.sisa || 0) > 0 || Number(item.komp?.sisa || 0) > 0
  ))?.periode;
  if (oldestDue) return oldestDue;
  const activePeriod = schedule.find((item) => item.periode === billing?.periode_aktif)?.periode;
  if (activePeriod) return activePeriod;
  const entryPeriod = String(billing?.periode_masuk || '');
  return schedule.find((item) => item.periode === entryPeriod)?.periode
    || schedule[0]?.periode
    || '';
}

function nextPaymentPeriod(period, billing = app.paymentBilling) {
  const schedule = paymentSchedule(billing);
  const index = schedule.findIndex((item) => item.periode === period);
  return index >= 0 ? schedule[index + 1]?.periode || '' : '';
}

function updateMonthlyPaymentRow(row, forceFill = false) {
  const select = row.querySelector('.payment-period');
  const schedule = paymentSchedule();
  const currentPeriod = select.value;
  const preferredPeriod = currentPeriod || row.dataset.initialPeriod || '';
  select.innerHTML = `<option value="">${app.paymentBilling ? 'Pilih periode' : 'Pilih siswa dahulu'}</option>${schedule.map((item) => (
    `<option value="${item.periode}">${escapeHtml(formatPeriodLabel(item.periode))}</option>`
  )).join('')}`;
  select.value = schedule.some((item) => item.periode === preferredPeriod)
    ? preferredPeriod
    : defaultPaymentPeriod();
  delete row.dataset.initialPeriod;

  const period = select.value;
  const inputs = {
    spp: row.querySelector('.payment-spp-amount'),
    bos: row.querySelector('.payment-bos-amount'),
    komp: row.querySelector('.payment-komp-amount')
  };
  select.disabled = !schedule.length;
  Object.values(inputs).forEach((input) => { input.disabled = !period; });
  if (!period) {
    row.dataset.paymentPeriod = '';
    return;
  }

  const periodBilling = schedule.find((item) => item.periode === period);
  const changedPeriod = row.dataset.paymentPeriod !== period;
  if (changedPeriod) inputs.bos.value = '';
  ['spp', 'komp'].forEach((component) => {
    const input = inputs[component];
    const autoValue = Number(periodBilling?.[component]?.sisa || 0);
    const wasAutoFilled = input.value === '' || parseMoney(input.value) === Number(row.dataset[`auto${component}`]);
    if (forceFill || changedPeriod || wasAutoFilled) {
      input.value = formatRupiah(autoValue);
      row.dataset[`auto${component}`] = String(autoValue);
    }
  });
  row.dataset.paymentPeriod = period;
}

function makePaymentComponentRow(period = '') {
  const wrapper = document.createElement('div');
  wrapper.className = 'payment-component-row payment-monthly-row';
  wrapper.dataset.paymentRow = 'monthly';
  wrapper.innerHTML = `
    <label>
      <span>Periode</span>
      <select class="payment-period" aria-label="Periode tagihan"></select>
    </label>
    <label>
      <span>SPP</span>
      <input class="money-input payment-component-amount payment-spp-amount" type="text" inputmode="numeric" aria-label="Nominal SPP" disabled />
    </label>
    <label>
      <span>BOS</span>
      <input class="money-input payment-bos-amount" type="text" inputmode="numeric" aria-label="Nominal BOS untuk SPP" placeholder="Rp 0" disabled />
    </label>
    <label>
      <span>Komputer</span>
      <input class="money-input payment-component-amount payment-komp-amount" type="text" inputmode="numeric" aria-label="Nominal Komputer" disabled />
    </label>
    <button type="button" class="action-btn delete payment-remove" aria-label="Hapus periode">Hapus</button>`;
  if (period) wrapper.dataset.initialPeriod = period;
  return wrapper;
}

function makeOneTimePaymentRow() {
  const options = PAYMENT_COMPONENTS
    .filter(([key]) => !['spp', 'komp'].includes(key))
    .map(([key, label]) => (
    `<option value="${key}">${escapeHtml(label)}</option>`
  )).join('');
  const wrapper = document.createElement('div');
  wrapper.className = 'payment-component-row payment-one-time-row';
  wrapper.dataset.paymentRow = 'one-time';
  wrapper.innerHTML = `
    <label>
      <span>Komponen</span>
      <select class="payment-component" aria-label="Komponen pembayaran">${options}</select>
    </label>
    <label>
      <span>Nominal</span>
      <input class="money-input payment-component-amount payment-one-time-amount" type="text" inputmode="numeric" required />
    </label>
    <button type="button" class="action-btn delete payment-remove" aria-label="Hapus komponen">Hapus</button>`;
  return wrapper;
}

function updatePaymentAllocationTotal() {
  const total = [...ui.paymentComponentRows.querySelectorAll('.payment-component-amount')]
    .reduce((sum, input) => sum + parseMoney(input.value), 0);
  const bosTotal = [...ui.paymentComponentRows.querySelectorAll('.payment-bos-amount')]
    .reduce((sum, input) => sum + parseMoney(input.value), 0);
  ui.paymentBosTotal.textContent = formatRupiah(bosTotal);
  ui.paymentAllocationTotal.textContent = formatRupiah(total - bosTotal);
}

function updatePaymentAllocationRows() {
  const monthlyRows = [...ui.paymentComponentRows.querySelectorAll('.payment-monthly-row')];
  const oneTimeRows = [...ui.paymentComponentRows.querySelectorAll('.payment-one-time-row')];
  monthlyRows.forEach((row) => {
    updateMonthlyPaymentRow(row);
    row.querySelector('.payment-remove').disabled = monthlyRows.length <= 1;
  });
  oneTimeRows.forEach((row) => { row.querySelector('.payment-remove').disabled = false; });
  const lastPeriod = monthlyRows[monthlyRows.length - 1]?.querySelector('.payment-period').value
    || defaultPaymentPeriod();
  ui.addPaymentComponent.disabled = !app.paymentBilling || !nextPaymentPeriod(lastPeriod);
  ui.addOneTimePaymentComponent.disabled = oneTimeRows.length >= 12;
  updatePaymentAllocationTotal();
}

function resetPaymentAllocationForm() {
  ui.paymentComponentRows.replaceChildren(makePaymentComponentRow());
  updatePaymentAllocationRows();
}

function resetMonthlyPaymentRows() {
  ui.paymentComponentRows.querySelectorAll('.payment-monthly-row').forEach((row) => {
    row.querySelector('.payment-period').value = '';
    row.querySelector('.payment-spp-amount').value = '';
    row.querySelector('.payment-bos-amount').value = '';
    row.querySelector('.payment-komp-amount').value = '';
    delete row.dataset.paymentPeriod;
    delete row.dataset.autoSpp;
    delete row.dataset.autoKomp;
  });
  updatePaymentAllocationRows();
}

function allocateMonthlyPayment(component, amount, billing, startPeriod = '') {
  const periods = paymentSchedule(billing);
  if (!periods.length) throw new Error('Belum ada periode tagihan yang dapat dialokasikan.');
  if (Number(billing.belum_dialokasikan || 0) > 0) {
    throw new Error('Rekonsiliasi pembayaran lama yang belum dialokasikan sebelum memakai alokasi otomatis.');
  }

  let startIndex = startPeriod ? periods.findIndex((item) => item.periode === startPeriod) : -1;
  if (startIndex < 0 && startPeriod) {
    const activeDate = new Date(Number(startPeriod.slice(2)), Number(startPeriod.slice(0, 2)) - 1, 1);
    const lastDate = new Date(Number(periods[periods.length - 1].periode.slice(2)),
      Number(periods[periods.length - 1].periode.slice(0, 2)) - 1, 1);
    if (activeDate > lastDate) return [{ component, periode: startPeriod, nominal: amount }];
    startIndex = 0;
  }
  if (startIndex < 0) {
    startIndex = periods.findIndex((item) => Number(item[component]?.sisa || 0) > 0);
  }
  if (startIndex < 0) {
    startIndex = periods.findIndex((item) => item.periode === billing.periode_aktif);
  }
  if (startIndex < 0) startIndex = periods.length - 1;

  let remaining = amount;
  const allocations = [];
  for (let index = startIndex; index < periods.length && remaining > 0; index += 1) {
    const period = periods[index];
    const due = Number(period[component]?.sisa || 0);
    const applied = Math.min(due, remaining);
    if (applied > 0) {
      allocations.push({ component, periode: period.periode, nominal: applied });
      remaining -= applied;
    }
  }
  if (remaining > 0) {
    const lastPeriod = periods[periods.length - 1].periode;
    const existing = allocations.find((item) => item.periode === lastPeriod);
    if (existing) existing.nominal += remaining;
    else allocations.push({ component, periode: lastPeriod, nominal: remaining });
  }
  return allocations;
}

async function collectPaymentItems() {
  const monthlyRows = [...ui.paymentComponentRows.querySelectorAll('.payment-monthly-row')];
  const oneTimeRows = [...ui.paymentComponentRows.querySelectorAll('.payment-one-time-row')];
  if (monthlyRows.length > 12 || oneTimeRows.length > 12) {
    throw new Error('Satu penerimaan maksimal 12 periode bulanan dan 12 komponen lainnya.');
  }

  const items = [];
  for (const row of monthlyRows) {
    const period = row.querySelector('.payment-period').value;
    const sppAmount = parseMoney(row.querySelector('.payment-spp-amount').value);
    const bosAmount = parseMoney(row.querySelector('.payment-bos-amount').value);
    const kompAmount = parseMoney(row.querySelector('.payment-komp-amount').value);
    if (sppAmount <= 0 && bosAmount <= 0 && kompAmount <= 0) continue;
    if (!period) throw new Error('Pilih periode untuk setiap pembayaran SPP, BOS, atau Komputer.');
    if (!app.paymentBilling) throw new Error('Pilih siswa yang tagihannya berhasil dimuat terlebih dahulu.');
    if (Number(app.paymentBilling.belum_dialokasikan || 0) > 0) {
      throw new Error('Rekonsiliasi pembayaran lama yang belum dialokasikan sebelum memakai alokasi otomatis.');
    }
    const periodBilling = paymentSchedule(app.paymentBilling).find((item) => item.periode === period);
    if (bosAmount > 0 && (sppAmount <= 0 || bosAmount > sppAmount)) {
      throw new Error('Nominal BOS tidak boleh melebihi total SPP pada periode yang dipilih.');
    }
    if (bosAmount > Number(periodBilling?.spp?.sisa || 0)) {
      throw new Error('Nominal BOS tidak boleh melebihi sisa tagihan SPP pada periode yang dipilih.');
    }
    if (sppAmount > 0) {
      const allocations = allocateMonthlyPayment('spp', sppAmount, app.paymentBilling, period);
      let bosRemaining = bosAmount;
      allocations.forEach((item) => {
        const bosForPeriod = item.periode === period ? Math.min(bosRemaining, item.nominal) : 0;
        const parentAmount = item.nominal - bosForPeriod;
        if (parentAmount > 0) items.push({ ...item, nominal: parentAmount });
        if (bosForPeriod > 0) {
          items.push({ ...item, component: 'spp_bos', nominal: bosForPeriod });
          bosRemaining -= bosForPeriod;
        }
      });
      if (bosRemaining > 0) throw new Error('Nominal BOS tidak dapat dialokasikan ke periode yang dipilih.');
    }
    if (kompAmount > 0) items.push(...allocateMonthlyPayment('komp', kompAmount, app.paymentBilling, period));
  }
  for (const row of oneTimeRows) {
    const component = row.querySelector('.payment-component').value;
    const amount = parseMoney(row.querySelector('.payment-component-amount').value);
    if (amount <= 0) throw new Error('Nominal setiap komponen harus lebih dari 0.');
    items.push({ component, periode: '', nominal: amount });
  }
  if (!items.length) throw new Error('Isi nominal pembayaran SPP, Komputer, atau komponen lainnya.');
  if (items.length > 36) throw new Error('Alokasi pembayaran melebihi 36 rincian. Pisahkan penerimaan menjadi dua transaksi.');
  const merged = new Map();
  items.forEach((item) => {
    const key = `${item.component}|${item.periode}`;
    const current = merged.get(key);
    if (current) current.nominal += item.nominal;
    else merged.set(key, { ...item });
  });
  const mergedItems = [...merged.values()];
  const monthlySppSchedule = paymentSchedule(app.paymentBilling);
  mergedItems.filter((item) => item.component === 'spp_bos').forEach((item) => {
    const remaining = Number(monthlySppSchedule.find((period) => period.periode === item.periode)?.spp?.sisa || 0);
    if (item.nominal > remaining) {
      throw new Error(`Total BOS periode ${formatPeriodLabel(item.periode)} melebihi sisa tagihan SPP.`);
    }
  });
  return mergedItems;
}

async function handlePaymentSubmit(event) {
  event.preventDefault();
  if (!canAccessPayment()) {
    alert('Hanya Admin KKMS yang dapat melakukan pembayaran.');
    return;
  }

  const form = event.currentTarget;
  const formData = new FormData(form);
  const idSiswa = String(formData.get('id_siswa') || '').trim();
  const paymentDate = ui.paymentDate.value;
  const nama = app.selectedPaymentStudent?.nama || '';
  let items;
  try {
    items = await collectPaymentItems();
  } catch (error) {
    alert(error.message);
    return;
  }

  if (!idSiswa || !app.selectedPaymentStudent) {
    alert('Pilih siswa dari daftar terlebih dahulu.');
    return;
  }
  if (!paymentDate) {
    alert('Tanggal uang masuk / transfer wajib diisi.');
    return;
  }
  if (paymentDate > localDateInputValue()) {
    alert('Tanggal uang masuk / transfer tidak boleh di masa depan.');
    return;
  }

  if (app.server) {
    let batchId;
    try {
      const credentials = requireStudentRules();
      const selectedYear = app.paymentBilling?.tahun_ajaran || app.selectedPaymentStudent.tahunAjaran;
      if (app.provisionalEnrollmentReady) {
        if (!selectedYear) throw new Error('Tahun ajaran pendaftaran siswa tidak ditemukan.');
        const { data, error } = await app.supabase.rpc('save_payment_batch_v2', {
          ...credentials,
          p_id_siswa: idSiswa,
          p_tahun_ajaran: selectedYear,
          p_tglbyr: paymentDate,
          p_items: items
        });
        if (error) throw error;
        batchId = String(data);
      } else {
        const nospp = app.selectedPaymentStudent.nospp;
        if (!nospp) throw new Error('Migration pendaftaran sementara belum dipasang. Tentukan kelas dan No. SPP terlebih dahulu.');
        const { data, error } = await app.supabase.rpc('save_payment_batch_v1', {
          ...credentials,
          p_nospp: nospp,
          p_tglbyr: paymentDate,
          p_items: items
        });
        if (error) throw error;
        batchId = String(data);
      }
      form.reset();
      ui.paymentDate.value = localDateInputValue();
      setPickerValue('paymentNospp', '');
      resetPaymentAllocationForm();
      app.paging.payments = 0;
      try {
        await printPaymentBatch(batchId, false);
      } catch (printError) {
        alert(`Pembayaran tersimpan (${batchId}), tetapi slip gagal dimuat atau dicetak: ${printError.message || 'Kesalahan tidak diketahui.'}`);
      }
      await reloadStudentData();
    } catch (error) {
      const message = error.message || 'Pembayaran gagal disimpan.';
      const migrationHint = /function.*not found|schema cache/i.test(message)
        ? ' Jalankan migration 018, lalu perbarui schema Supabase.'
        : '';
      alert(batchId
        ? `Pembayaran tersimpan (${batchId}), tetapi daftar gagal diperbarui: ${message}${migrationHint}`
        : `${message}${migrationHint}`);
    }
    return;
  }

  const student = app.state.siswa.find((item) => String(item.id) === idSiswa);
  const batchId = `local-${Date.now()}`;
  const receiptNo = `SPP-${new Date().getFullYear()}-${Date.now()}`;
  const createdAt = new Date().toISOString();
  items.forEach((item, index) => {
    app.state.transaksi.push({
      id: `tx-${Date.now()}-${index}`,
      batch_id: batchId,
      receipt_no: receiptNo,
      source: 'manual',
      created_at: createdAt,
      operator_code: getCurrentOperatorCode(),
      nospp: student?.nospp || '',
      nama: nama || (student ? student.nama : 'Siswa'),
      kdsek: student ? student.kdsek : '',
      periode: item.periode,
      nominal: item.nominal,
      component: item.component,
      tglbyr: paymentDate,
      idpemakai: app.user ? app.user.idpemakai : 'admin',
      ket: 'Pembayaran via web'
    });
  });
  saveLocalData();
  event.currentTarget.reset();
  ui.paymentDate.value = localDateInputValue();
  setPickerValue('paymentNospp', '');
  resetPaymentAllocationForm();
  renderDashboard();
  renderPaymentList();
  renderReport();
  renderStudentTable();
  await printPaymentBatch(batchId, false);
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
      throw new Error('Layanan login Supabase belum siap. Jalankan migration login dan pengelolaan pengguna di Supabase.');
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
    app.dashboardCredentials = ['superadmin', 'yayasan'].includes(mappedUser.role)
      ? { username: username.trim(), password }
      : null;
    app.cardPrintCredentials = { username: username.trim(), password };
    ui.userName.textContent = mappedUser.jabatan || mappedUser.idpemakai;
    ui.sidebar.hidden = false;
    applyUserAccess();
    ui.loginScreen.classList.add('hidden');
    return true;
  }

  const localUser = app.state.users.find((item) => (
    item.is_active !== false
      && matchLoginUser(item, username, true)
      && item.password === password
  ));
  if (localUser) {
    app.user = localUser;
    app.adminCredentials = null;
    app.dashboardCredentials = null;
    app.cardPrintCredentials = null;
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
  window.addEventListener('resize', fitStudentCardPreview);
  ui.paymentDate.value = localDateInputValue();
  ui.dailyPaymentDate.value = localDateInputValue();
  ui.dailyPaymentDate.addEventListener('change', fetchDailyPaymentSummary);
  ui.dailyCashPrint.addEventListener('click', printDailyCashReport);
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
  ui.downloadStudentsBtn.addEventListener('click', downloadStudents);
  ui.studentTableBody.closest('table').querySelector('thead').addEventListener('click', (event) => {
    const button = event.target.closest('[data-student-sort]');
    if (!button) return;
    const key = button.dataset.studentSort;
    app.studentSort = {
      key,
      ascending: app.studentSort.key === key ? !app.studentSort.ascending : true
    };
    app.paging.students = 0;
    if (app.server) fetchStudentPage();
    else drawStudentTable();
  });
  ui.studentSortSelect.addEventListener('change', () => {
    const [key, direction] = ui.studentSortSelect.value.split('-');
    app.studentSort = { key, ascending: direction === 'asc' };
    app.paging.students = 0;
    if (app.server) fetchStudentPage();
    else drawStudentTable();
  });
  ui.paymentSearch.addEventListener('input', () => {
    app.paging.payments = 0;
    if (app.server) refreshPaymentsSoon();
  });
  const handleScopeChange = () => {
    app.paging.students = 0;
    app.paging.payments = 0;
    populateDashboardClassFilter();
    renderStudentTable();
    if (app.server) {
      renderDashboard();
      renderReport();
      renderPaymentList();
    }
  };
  ui.schoolFilter.addEventListener('change', handleScopeChange);
  ui.yearFilter.addEventListener('change', handleScopeChange);
  ui.dashboardClassFilter.addEventListener('change', () => {
    if (app.server) fetchDashboard();
  });
  ui.reportYearFilter.addEventListener('change', () => {
    populateReportPeriods();
    updateArrearsExportButtons();
    app.arrearsOffset = 0;
    fetchArrearsReport();
  });
  ui.reportSchoolFilter.addEventListener('change', () => {
    populateReportFilters();
    app.arrearsOffset = 0;
    fetchArrearsReport();
  });
  ui.reportPeriodFilter.addEventListener('change', () => {
    updateArrearsExportButtons();
    app.arrearsOffset = 0;
    fetchArrearsReport();
  });
  ui.reportClassFilter.addEventListener('change', () => {
    app.arrearsOffset = 0;
    updateArrearsExportButtons();
    fetchArrearsReport();
  });
  ui.studentTahun.addEventListener('change', populateStudentPeriodOptions);
  ui.loadMoreArrears.addEventListener('click', () => fetchArrearsReport(true));
  ui.downloadArrearsSchoolBtn.addEventListener('click', () => downloadArrearsGroup('school'));
  ui.downloadArrearsClassBtn.addEventListener('click', () => downloadArrearsGroup('class'));
  ui.refreshRevenue.addEventListener('click', fetchDashboard);
  ui.arrearsReportTable.addEventListener('click', (event) => {
    const downloadButton = event.target.closest('[data-download-arrears]');
    if (downloadButton) {
      downloadStudentArrears(downloadButton.dataset.downloadArrears);
      return;
    }
    const button = event.target.closest('[data-print-arrears]');
    if (button) printArrearsLetter(button.dataset.printArrears);
  });
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-page-dir]');
    const pager = button && button.closest('[data-pager]');
    if (!pager) return;
    const key = pager.dataset.pager;
    app.paging[key] = Math.max(0, app.paging[key] + Number(button.dataset.pageDir));
    ({ students: fetchStudentPage, payments: fetchPaymentPage })[key]?.();
    if (key === 'students') ui.studentTableBody.closest('.students-scroll')?.scrollTo({ top: 0 });
  });
  ui.studentSekolah.addEventListener('change', () => populateStudentClassSelect());
  ui.studentForm.addEventListener('submit', addOrUpdateStudent);
  ui.studentResetBtn.addEventListener('click', () => { closeStudentDialog(); resetStudentForm(); });
  ui.studentCloseBtn.addEventListener('click', () => { closeStudentDialog(); resetStudentForm(); });
  ui.studentDialog.addEventListener('click', (event) => {
    if (event.target === ui.studentDialog) closeStudentDialog();
  });
  ui.studentCardPrintOptions.addEventListener('change', updateStudentCardPrintSelectionUi);
  ui.studentCardPrintOptions.addEventListener('click', (event) => {
    const selectionButton = event.target.closest('[data-card-selection]');
    if (selectionButton) {
      const checked = selectionButton.dataset.cardSelection === 'all';
      ui.studentCardPrintOptions.querySelectorAll('[data-card-print-index]').forEach((input) => {
        input.checked = checked;
      });
      updateStudentCardPrintSelectionUi();
      return;
    }

    const button = event.target.closest('[data-card-reset]');
    if (button) resetStudentCardPrintPosition(button.dataset.cardReset);
  });
  ui.studentCardPrintSubmit.addEventListener('click', submitStudentCardPrint);
  ui.studentCardPrintClose.addEventListener('click', () => ui.studentCardPrintDialog.close());
  ui.studentCardPrintCancel.addEventListener('click', () => ui.studentCardPrintDialog.close());
  ui.studentCardPrintDialog.addEventListener('click', (event) => {
    if (event.target === ui.studentCardPrintDialog) ui.studentCardPrintDialog.close();
  });
  ui.studentCardPrintDialog.addEventListener('close', () => {
    if (!document.body.classList.contains('printing-spp-card')) app.studentCardPrintContext = null;
  });
  ui.paymentHistoryClose.addEventListener('click', () => ui.paymentHistoryDialog.close());
  ui.paymentHistoryCancel.addEventListener('click', () => ui.paymentHistoryDialog.close());
  ui.paymentHistoryDialog.addEventListener('click', (event) => {
    if (event.target === ui.paymentHistoryDialog) ui.paymentHistoryDialog.close();
  });
  ui.paymentHistoryDialog.addEventListener('close', () => { app.paymentHistoryRequest += 1; });
  document.getElementById('openStudentFormBtn').addEventListener('click', () => openStudentDialog('baru'));
  ui.studentType.addEventListener('change', updateStudentFormMode);
  document.getElementById('bulkGiatBtn').addEventListener('click', applyBulkActivity);
  document.getElementById('bulkStaffBtn').addEventListener('click', applyBulkStaff);
  document.getElementById('bulkDeleteBtn').addEventListener('click', applyBulkDelete);
  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-rename-id]');
    if (button) renameStudent(button.dataset.renameId, button.dataset.renameName);
  });
  document.getElementById('templateBtn').addEventListener('click', downloadImportTemplate);
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('arrearAddBtn').addEventListener('click', addArrear);
  ui.arrearCutoffBtn.addEventListener('click', cutoffAcademicYear);
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
    if (event.target.classList && event.target.classList.contains('money-input')) {
      formatMoneyInput(event.target);
      if (event.target.classList.contains('payment-component-amount')
          || event.target.classList.contains('payment-bos-amount')) updatePaymentAllocationTotal();
    }
  });
  formatAllMoneyInputs();
  updatePaymentAllocationRows();
  ui.addPaymentComponent.addEventListener('click', () => {
    const monthlyRows = [...ui.paymentComponentRows.querySelectorAll('.payment-monthly-row')];
    if (monthlyRows.length >= 12) {
      alert('Satu penerimaan maksimal 12 periode bulanan.');
      return;
    }
    const lastPeriod = monthlyRows[monthlyRows.length - 1]?.querySelector('.payment-period').value
      || defaultPaymentPeriod();
    const nextPeriod = nextPaymentPeriod(lastPeriod);
    if (!nextPeriod) {
      alert('Tidak ada periode berikutnya pada tahun ajaran ini.');
      return;
    }
    ui.paymentComponentRows.append(makePaymentComponentRow(nextPeriod));
    updatePaymentAllocationRows();
  });
  ui.addOneTimePaymentComponent.addEventListener('click', () => {
    const rowCount = ui.paymentComponentRows.querySelectorAll('.payment-one-time-row').length;
    if (rowCount >= 12) {
      alert('Satu penerimaan maksimal 12 komponen lainnya.');
      return;
    }
    ui.paymentComponentRows.append(makeOneTimePaymentRow());
    updatePaymentAllocationRows();
  });
  ui.paymentComponentRows.addEventListener('change', (event) => {
    if (event.target.matches('.payment-period')) {
      updateMonthlyPaymentRow(event.target.closest('.payment-monthly-row'), true);
      updatePaymentAllocationRows();
    }
  });
  ui.paymentComponentRows.addEventListener('click', (event) => {
    const button = event.target.closest('.payment-remove');
    const row = button?.closest('.payment-component-row');
    if (!button || !row) return;
    if (row.classList.contains('payment-monthly-row')
        && ui.paymentComponentRows.querySelectorAll('.payment-monthly-row').length <= 1) return;
    row.remove();
    updatePaymentAllocationRows();
  });
  document.getElementById('logBtn').addEventListener('click', showStudentLog);
  ui.importFile.addEventListener('change', () => {
    if (ui.importFile.files[0]) importStudentsFile(ui.importFile.files[0]);
  });
  ui.paymentImportFile.addEventListener('change', () => {
    if (ui.paymentImportFile.files[0]) importPaymentFile(ui.paymentImportFile.files[0]);
  });
  ui.paymentImportRows.addEventListener('change', handlePaymentImportChange);
  ui.downloadPaymentTemplate.addEventListener('click', downloadPaymentTemplate);
  ui.importPaymentsBtn.addEventListener('click', submitPaymentImport);
  ui.paymentForm.addEventListener('submit', handlePaymentSubmit);
  ui.paymentCorrectionDialog.querySelector('form').addEventListener('submit', voidPaymentBatch);
  document.getElementById('paymentCorrectionClose').addEventListener('click', () => {
    ui.paymentCorrectionDialog.close();
    app.pendingPaymentCorrection = null;
  });
  document.getElementById('paymentCorrectionCancel').addEventListener('click', () => {
    ui.paymentCorrectionDialog.close();
    app.pendingPaymentCorrection = null;
  });
  ui.userCreateForm.addEventListener('submit', createUserAccount);
  ui.newUserRole.addEventListener('change', updateNewUserSchoolVisibility);
  ui.operatorCodesTableBody.addEventListener('change', (event) => {
    if (!event.target.matches('[data-user-role]')) return;
    const school = event.target.closest('tr')?.querySelector('[data-user-school]');
    if (!school) return;
    const isUnit = event.target.value === 'unit';
    school.disabled = !isUnit;
    const allSchoolsOption = school.querySelector('option[value="ALL"]');
    if (isUnit) {
      const hadAllSchoolsSelected = school.value === 'ALL';
      allSchoolsOption?.remove();
      if (hadAllSchoolsSelected) school.value = school.options[0]?.value || '';
    } else {
      if (!allSchoolsOption) {
        const option = document.createElement('option');
        option.value = 'ALL';
        option.textContent = 'Semua sekolah';
        school.prepend(option);
      }
      school.value = 'ALL';
    }
  });
  ui.operatorCodesTableBody.addEventListener('click', (event) => {
    const saveButton = event.target.closest('[data-save-user]');
    if (saveButton) {
      saveUserAccount(saveButton);
      return;
    }
    const resetButton = event.target.closest('[data-reset-user-password]');
    if (resetButton) {
      openUserPasswordDialog(resetButton);
      return;
    }
    const activeButton = event.target.closest('[data-toggle-user-active]');
    if (activeButton) toggleUserActive(activeButton);
  });
  ui.userPasswordForm.addEventListener('submit', resetUserPassword);
  ui.userPasswordClose.addEventListener('click', () => ui.userPasswordDialog.close());
  ui.userPasswordCancel.addEventListener('click', () => ui.userPasswordDialog.close());
  ui.userPasswordDialog.addEventListener('click', (event) => {
    if (event.target === ui.userPasswordDialog) ui.userPasswordDialog.close();
  });
  ui.userPasswordDialog.addEventListener('close', () => { app.passwordResetTarget = null; });
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
    if (action === 'payment-history') {
      const student = app.state.siswa.find((row) => (
        String(row.id) === String(id) && String(row.nospp || '') === String(nospp || '')
          && row.kdsek === target.dataset.kdsek
      ));
      if (!student) {
        alert('Data siswa sudah berubah. Muat ulang daftar siswa lalu coba kembali.');
        return;
      }
      openStudentPaymentHistory(student);
    }
    if (action === 'print-spp-card') {
      openStudentCardPrintDialog({
        id,
        nospp,
        kdsek: target.dataset.kdsek,
        nama: target.dataset.nama,
        kdkls: target.dataset.kdkls
      });
    }
    if (action === 'edit-student') {
      changeStudentSpp(nospp);
    }
    if (action === 'place-student') {
      const student = app.state.siswa.find((row) => String(row.id) === String(id));
      if (!student) {
        alert('Data siswa sudah berubah. Muat ulang daftar siswa lalu coba kembali.');
        return;
      }
      openPlacementDialog(student);
    }
    if (action === 'rename-student') {
      renameStudent(id, target.dataset.name);
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
    if (target.dataset.action === 'correct-payment') openPaymentCorrection(target.dataset.id);
    if (target.dataset.action === 'print-spp-card') {
      openStudentCardPrintDialog({
        id: target.dataset.id,
        nospp: target.dataset.nospp,
        kdsek: target.dataset.kdsek,
        nama: target.dataset.nama
      });
    }
    if (target.dataset.action === 'print-payment' || target.dataset.action === 'print-correction') {
      printPaymentBatch(target.dataset.id, target.dataset.action === 'print-correction')
        .catch((error) => alert(error.message || 'Slip gagal dimuat.'));
    }
  });

  document.getElementById('logoutBtn').addEventListener('click', () => {
    app.user = null;
    app.adminCredentials = null;
    app.dashboardCredentials = null;
    app.cardPrintCredentials = null;
    app.studentCardPrintContext = null;
    app.paymentHistoryRequest += 1;
    if (ui.paymentHistoryDialog.open) ui.paymentHistoryDialog.close();
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
  populateArrearCutoffYears();
  populateExistingStudents();
  populateStudentYearOptions(currentAcademicYear());
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
