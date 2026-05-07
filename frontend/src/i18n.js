import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

const resources = {
  en: {
    translation: {
      login: 'Login',
      username: 'Username',
      password: 'Password',
      checkIn: 'Check In',
      checkOut: 'Check Out',
      dashboard: 'Dashboard',
      adminDashboard: 'Admin Dashboard',
      manageUsers: 'Manage Users',
      exportExcel: 'Export to Excel',
      addUser: 'Add User',
      addOffice: 'Add Office',
      delete: 'Delete',
      office: 'Office',
      manageOffices: 'Manage Offices',
      officeName: 'Office Name',
      attendance: 'Attendance',
      welcome: 'Welcome',
      logout: 'Logout',
      language: 'Language',
      english: 'English',
      indonesian: 'Indonesian',
      invalidCredentials: 'Invalid credentials',
      checkedIn: 'Checked in successfully',
      checkedOut: 'Checked out successfully',
      alreadyCheckedIn: 'Already checked in today',
      noCheckIn: 'No check-in found for today',
      notInRadius: 'You are not within the allowed radius',
      selectOffice: 'Please select an office',
      currentLocation: 'Current location',
      latitude: 'Latitude',
      longitude: 'Longitude',
      updatedAt: 'Updated at',
      locating: 'Locating...',
      noOfficesAvailable: 'No offices available',
      history: 'History',
      noHistory: 'No history yet',
      notCheckedOut: 'Not checked out',
      officeAdded: 'Office added',
      officeDeleted: 'Office deleted',
      locationLink: 'Google Maps link',
      mapLink: 'Map link',
      adminOnly: 'Admin only',
      userDeleted: 'User deleted',
      userAdded: 'User added'
    }
  },
  id: {
    translation: {
      login: 'Masuk',
      username: 'Nama Pengguna',
      password: 'Kata Sandi',
      checkIn: 'Check In',
      checkOut: 'Check Out',
      dashboard: 'Dasbor',
      adminDashboard: 'Dasbor Admin',
      manageUsers: 'Kelola Pengguna',
      exportExcel: 'Ekspor ke Excel',
      addUser: 'Tambah Pengguna',
      addOffice: 'Tambah Kantor',
      delete: 'Hapus',
      office: 'Kantor',
      manageOffices: 'Kelola Kantor',
      officeName: 'Nama Kantor',
      attendance: 'Kehadiran',
      welcome: 'Selamat Datang',
      logout: 'Keluar',
      language: 'Bahasa',
      english: 'Inggris',
      indonesian: 'Indonesia',
      invalidCredentials: 'Kredensial tidak valid',
      checkedIn: 'Berhasil check in',
      checkedOut: 'Berhasil check out',
      alreadyCheckedIn: 'Sudah check in hari ini',
      noCheckIn: 'Tidak ada check-in hari ini',
      notInRadius: 'Anda tidak dalam radius yang diizinkan',
      selectOffice: 'Silakan pilih kantor',
      currentLocation: 'Lokasi saat ini',
      latitude: 'Lintang',
      longitude: 'Bujur',
      updatedAt: 'Diperbarui pada',
      locating: 'Mencari lokasi...',
      noOfficesAvailable: 'Tidak ada kantor tersedia',
      history: 'Riwayat',
      noHistory: 'Belum ada riwayat',
      notCheckedOut: 'Belum check out',
      officeAdded: 'Kantor ditambahkan',
      officeDeleted: 'Kantor dihapus',
      locationLink: 'Tautan Google Maps',
      mapLink: 'Tautan peta',
      adminOnly: 'Hanya admin',
      userDeleted: 'Pengguna dihapus',
      userAdded: 'Pengguna ditambahkan'
    }
  }
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false
    }
  });

export default i18n;