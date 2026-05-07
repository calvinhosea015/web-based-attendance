const i18n = (() => {
  const localeKey = 'attendance_locale';
  const defaultLocale = 'en';

  const translations = {
    en: {
      indexTitle: 'Attendance App',
      indexHeader: 'Attendance App',
      indexSubtext: 'Tap the button below to get started.',
      userLoginButton: 'User Login',
      adminLoginButton: 'Admin Login',
      loginTitle: 'Login - Attendance',
      loginHeader: 'Welcome Back',
      loginSubtext: 'Enter your username and password to continue.',
      usernameLabel: 'Username',
      usernamePlaceholder: 'admin or user',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Password',
      loginButton: 'Sign In',
      backButton: 'Back to home',
      loginHint: 'Try admin / admin123 or user / user123',
      pleaseEnterCredentials: 'Please enter username and password.',
      loginFailed: 'Login failed.',
      userTitle: 'User Dashboard - Office Attendance',
      userHeader: 'Check In',
      userSubtext: '1) Pick your office. 2) Update your location. 3) Tap Check In or Check Out.',
      loggedInAsLabel: 'Logged in as',
      selectedOfficeLabel: 'Selected office',
      officeLocationLabel: 'Office location',
      allowedRadiusLabel: 'Allowed radius',
      locationStatusLabel: 'Location status',
      yourNameLabel: 'Your name',
      yourNamePlaceholder: 'Jane Doe',
      yourEmailLabel: 'Your email',
      yourEmailPlaceholder: 'jane@example.com',
      chooseOfficeLabel: 'Choose office',
      noteLabel: 'Note',
      notePlaceholder: 'Optional note',
      updateLocationButton: 'Update location',
      checkInButton: 'Check In',
      checkOutButton: 'Check Out',
      currentStatusLabel: 'Current status',
      accountEmailLabel: 'Account email',
      logoutButton: 'Logout',
      adminDashboardButton: 'Admin Dashboard',
      userAccountsHeader: 'User Accounts',
      addUserHeader: 'Add new account',
      displayNameLabel: 'Display name',
      roleLabel: 'Role',
      createUserButton: 'Create account',
      deleteButton: 'Delete',
      noUsersFound: 'No user accounts found.',
      checkedInLabel: 'Checked in',
      checkedOutLabel: 'Checked out',
      noOfficesAvailable: 'No offices available',
      loadingOffices: 'Loading offices...',
      locationNotSupported: 'Geolocation is not supported in this browser.',
      requestingLocation: 'Requesting location...',
      enableLocationAccess: 'Please enable location access to check in from the office.',
      completeFormMessage: 'Complete the form, choose an office, and allow geolocation before checking in.',
      checkInFailed: 'Check-in failed.',
      networkErrorPrefix: 'Network error:',
      adminTitle: 'Admin Dashboard',
      adminHeader: 'Admin Dashboard',
      adminSubtext: 'View all attendance records and export them to Excel.',
      recordsFoundLabel: 'Records found',
      exportButton: 'Export to Excel',
      backToHomeButton: 'Back to home',
      noRecordsYet: 'No attendance records yet.',
      unableLoadRecords: 'Unable to load records:',
      languageLabel: 'Language',
      officeNoneSelected: 'None selected',
      unknown: 'Unknown',
      none: 'None'
    },
    id: {
      indexTitle: 'Aplikasi Absensi',
      indexHeader: 'Aplikasi Absensi',
      indexSubtext: 'Ketuk tombol di bawah untuk memulai.',
      userLoginButton: 'Login Pengguna',
      adminLoginButton: 'Login Admin',
      loginTitle: 'Masuk - Absensi',
      loginHeader: 'Selamat Datang Kembali',
      loginSubtext: 'Masukkan nama pengguna dan kata sandi untuk melanjutkan.',
      usernameLabel: 'Nama pengguna',
      usernamePlaceholder: 'admin atau user',
      passwordLabel: 'Kata sandi',
      passwordPlaceholder: 'Kata sandi',
      loginButton: 'Masuk',
      backButton: 'Kembali ke beranda',
      loginHint: 'Gunakan admin / admin123 atau user / user123',
      pleaseEnterCredentials: 'Silakan masukkan nama pengguna dan kata sandi.',
      loginFailed: 'Login gagal.',
      userTitle: 'Dashboard Pengguna - Absensi Kantor',
      userHeader: 'Check In',
      userSubtext: '1) Pilih kantor Anda. 2) Perbarui lokasi Anda. 3) Ketuk Check In atau Check Out.',
      loggedInAsLabel: 'Masuk sebagai',
      selectedOfficeLabel: 'Kantor yang dipilih',
      officeLocationLabel: 'Lokasi kantor',
      allowedRadiusLabel: 'Jarak yang diperbolehkan',
      locationStatusLabel: 'Status lokasi',
      yourNameLabel: 'Nama Anda',
      yourNamePlaceholder: 'Jane Doe',
      yourEmailLabel: 'Email Anda',
      yourEmailPlaceholder: 'jane@example.com',
      chooseOfficeLabel: 'Pilih kantor',
      noteLabel: 'Catatan',
      notePlaceholder: 'Catatan opsional',
      updateLocationButton: 'Perbarui lokasi',
      checkInButton: 'Check In',
      checkOutButton: 'Check Out',
      currentStatusLabel: 'Status saat ini',
      accountEmailLabel: 'Email akun',
      logoutButton: 'Keluar',
      adminDashboardButton: 'Dashboard Admin',
      userAccountsHeader: 'Akun Pengguna',
      addUserHeader: 'Tambah akun baru',
      displayNameLabel: 'Nama tampilan',
      roleLabel: 'Peran',
      createUserButton: 'Buat akun',
      deleteButton: 'Hapus',
      noUsersFound: 'Belum ada akun pengguna.',
      checkedInLabel: 'Sudah check in',
      checkedOutLabel: 'Sudah check out',
      noOfficesAvailable: 'Tidak ada kantor tersedia',
      loadingOffices: 'Memuat kantor...',
      locationNotSupported: 'Geolokasi tidak didukung di browser ini.',
      requestingLocation: 'Meminta lokasi...',
      enableLocationAccess: 'Aktifkan akses lokasi untuk check in dari kantor.',
      completeFormMessage: 'Lengkapi formulir, pilih kantor, dan izinkan geolokasi sebelum check in.',
      checkInFailed: 'Check-in gagal.',
      networkErrorPrefix: 'Kesalahan jaringan:',
      adminTitle: 'Dashboard Admin',
      adminHeader: 'Dashboard Admin',
      adminSubtext: 'Lihat semua catatan absensi dan ekspor ke Excel.',
      recordsFoundLabel: 'Jumlah catatan',
      exportButton: 'Ekspor ke Excel',
      backToHomeButton: 'Kembali ke beranda',
      noRecordsYet: 'Belum ada catatan absensi.',
      unableLoadRecords: 'Tidak dapat memuat catatan:',
      languageLabel: 'Bahasa',
      officeNoneSelected: 'Belum ada yang dipilih',
      unknown: 'Tidak diketahui',
      none: 'Tidak ada'
    }
  };

  function getLocale() {
    return localStorage.getItem(localeKey) || defaultLocale;
  }

  function setLocale(locale) {
    localStorage.setItem(localeKey, locale);
    updateLocaleSelector(locale);
    translatePage();
  }

  function updateLocaleSelector(locale) {
    const select = document.getElementById('locale-select');
    if (select) select.value = locale;
  }

  function translatePage() {
    const locale = getLocale();
    const activeTranslations = translations[locale] || translations[defaultLocale];

    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (key && Object.prototype.hasOwnProperty.call(activeTranslations, key)) {
        el.textContent = activeTranslations[key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.dataset.i18nPlaceholder;
      if (key && Object.prototype.hasOwnProperty.call(activeTranslations, key)) {
        el.placeholder = activeTranslations[key];
      }
    });

    document.querySelectorAll('[data-i18n-value]').forEach(el => {
      const key = el.dataset.i18nValue;
      if (key && Object.prototype.hasOwnProperty.call(activeTranslations, key)) {
        el.value = activeTranslations[key];
      }
    });

    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.dataset.i18nTitle;
      if (key && Object.prototype.hasOwnProperty.call(activeTranslations, key)) {
        document.title = activeTranslations[key];
      }
    });
  }

  function t(key) {
    const locale = getLocale();
    const activeTranslations = translations[locale] || translations[defaultLocale];
    return activeTranslations[key] || translations[defaultLocale][key] || key;
  }

  function init() {
    const locale = getLocale();
    updateLocaleSelector(locale);

    const select = document.getElementById('locale-select');
    if (select) {
      select.addEventListener('change', event => setLocale(event.target.value));
    }

    translatePage();
  }

  document.addEventListener('DOMContentLoaded', init);

  return { getLocale, setLocale, t, init, translatePage };
})();
