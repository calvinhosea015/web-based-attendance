const statusEl = document.getElementById('geo-status');
const sessionUserEl = document.getElementById('session-user');
const sessionEmailEl = document.getElementById('session-email');
const officeNameEl = document.getElementById('office-name');
const officeLocationEl = document.getElementById('office-location');
const officeRadiusEl = document.getElementById('office-radius');
const checkStatusEl = document.getElementById('check-status');
const messageEl = document.getElementById('message');
const form = document.getElementById('checkin-form');
const officeSelect = document.getElementById('office');
const updateLocationButton = document.getElementById('update-location');
const checkinButton = document.getElementById('checkin-button');
const checkoutButton = document.getElementById('checkout-button');
const logoutButton = document.getElementById('logout-button');
const latInput = document.getElementById('latitude');
const lngInput = document.getElementById('longitude');

let offices = [];
let currentUser = null;

function setMessage(text, type = 'info') {
  messageEl.textContent = text;
  messageEl.className = `message ${type === 'success' ? 'success' : type === 'error' ? 'error' : ''}`;
}

function setLocationStatus(text) {
  statusEl.textContent = text;
}

function setUserName(name) {
  if (sessionUserEl) {
    sessionUserEl.textContent = name || i18n.t('unknown');
  }
}

function setUserEmail(email) {
  if (sessionEmailEl) {
    sessionEmailEl.textContent = email || i18n.t('unknown');
  }
}

function updateCheckStatus(status) {
  if (!checkStatusEl) return;
  if (!status || status.checkedIn === undefined) {
    checkStatusEl.textContent = i18n.t('checkedOutLabel');
    return;
  }
  checkStatusEl.textContent = status.checkedIn ? i18n.t('checkedInLabel') : i18n.t('checkedOutLabel');
}

function updateActionButtons(status) {
  if (!checkinButton || !checkoutButton) return;
  const checkedIn = status && status.checkedIn;
  checkinButton.disabled = checkedIn;
  checkoutButton.disabled = !checkedIn;
}

function updateOfficeDetails(office) {
  if (!office) {
    officeNameEl.textContent = i18n.t('officeNoneSelected');
    officeLocationEl.textContent = '-';
    officeRadiusEl.textContent = '-';
    return;
  }

  officeNameEl.textContent = office.name;
  officeLocationEl.textContent = `${office.latitude.toFixed(5)}, ${office.longitude.toFixed(5)}`;
  officeRadiusEl.textContent = `${office.radiusMeters} meters`;
}

async function fetchStatus() {
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    if (data.ok) {
      updateCheckStatus(data.status);
      updateActionButtons(data.status);
      return data.status;
    }
  } catch (error) {
    setMessage(`${i18n.t('networkErrorPrefix')} ${error.message}`, 'error');
  }

  updateCheckStatus({ checkedIn: false });
  updateActionButtons({ checkedIn: false });
  return { checkedIn: false };
}

async function fetchCurrentUser() {
  try {
    const response = await fetch('/api/me');
    const data = await response.json();

    if (!data.ok || !data.user) {
      window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname.replace('/', ''))}`;
      return null;
    }

    currentUser = data.user;
    setUserName(currentUser.displayName || currentUser.username);
    setUserEmail(currentUser.email || i18n.t('unknown'));
    return currentUser;
  } catch (error) {
    window.location.href = `/login.html?next=${encodeURIComponent(window.location.pathname.replace('/', ''))}`;
    return null;
  }
}

async function loadOffices() {
  try {
    const response = await fetch('/api/offices');
    const data = await response.json();
    offices = data.offices || [];

    if (!offices.length) {
      officeSelect.innerHTML = `<option value="">${i18n.t('noOfficesAvailable')}</option>`;
      updateOfficeDetails(null);
      return;
    }

    officeSelect.innerHTML = offices
      .map(office => `<option value="${office.id}">${office.name}</option>`)
      .join('');

    officeSelect.value = offices[0].id;
    updateOfficeDetails(offices[0]);
  } catch (error) {
    officeSelect.innerHTML = `<option value="">${i18n.t('noOfficesAvailable')}</option>`;
    updateOfficeDetails(null);
    setMessage(`${i18n.t('networkErrorPrefix')} ${error.message}`, 'error');
  }
}

function getSelectedOffice() {
  return offices.find(office => office.id === officeSelect.value);
}

async function requestLocation() {
  if (!navigator.geolocation) {
    setLocationStatus(i18n.t('locationNotSupported'));
    return;
  }

  setLocationStatus(i18n.t('requestingLocation'));

  navigator.geolocation.getCurrentPosition(
    position => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      latInput.value = lat;
      lngInput.value = lng;
      setLocationStatus(`Location acquired: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    },
    error => {
      const reason = error.message || 'Unable to access location.';
      setLocationStatus(reason);
      setMessage(i18n.t('enableLocationAccess'), 'error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 }
  );
}

officeSelect.addEventListener('change', () => {
  const office = getSelectedOffice();
  updateOfficeDetails(office);
});

updateLocationButton.addEventListener('click', () => {
  requestLocation();
});

if (logoutButton) {
  logoutButton.addEventListener('click', async event => {
    event.preventDefault();
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login.html';
  });
}

async function submitAction(action) {
  messageEl.textContent = '';

  const note = document.getElementById('note').value.trim();
  const latitude = parseFloat(latInput.value);
  const longitude = parseFloat(lngInput.value);
  const officeId = officeSelect.value;

  if (!officeId || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    setMessage(i18n.t('completeFormMessage'), 'error');
    return;
  }

  try {
    const response = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, note, latitude, longitude, officeId })
    });

    const result = await response.json();
    if (result.ok) {
      setMessage(result.message, 'success');
      setTimeout(() => fetchStatus(), 250);
    } else {
      setMessage(result.error || i18n.t('checkInFailed'), 'error');
    }
  } catch (error) {
    setMessage(`${i18n.t('networkErrorPrefix')} ${error.message}`, 'error');
  }
}

if (checkinButton) {
  checkinButton.addEventListener('click', () => submitAction('checkin'));
}

if (checkoutButton) {
  checkoutButton.addEventListener('click', () => submitAction('checkout'));
}

fetchCurrentUser().then(user => {
  if (!user) return;
  loadOffices().then(() => {
    requestLocation();
    fetchStatus();
    setInterval(requestLocation, 30000);
  });
});
