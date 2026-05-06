const statusEl = document.getElementById('geo-status');
const sessionUserEl = document.getElementById('session-user');
const officeNameEl = document.getElementById('office-name');
const officeLocationEl = document.getElementById('office-location');
const officeRadiusEl = document.getElementById('office-radius');
const messageEl = document.getElementById('message');
const form = document.getElementById('checkin-form');
const officeSelect = document.getElementById('office');
const updateLocationButton = document.getElementById('update-location');
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

function updateOfficeDetails(office) {
  if (!office) {
    officeNameEl.textContent = 'None selected';
    officeLocationEl.textContent = '-';
    officeRadiusEl.textContent = '-';
    return;
  }

  officeNameEl.textContent = office.name;
  officeLocationEl.textContent = `${office.latitude.toFixed(5)}, ${office.longitude.toFixed(5)}`;
  officeRadiusEl.textContent = `${office.radiusMeters} meters`;
}

function setUserName(name) {
  if (sessionUserEl) {
    sessionUserEl.textContent = name || 'Unknown';
  }
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
    setUserName(currentUser.username);
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
      officeSelect.innerHTML = '<option value="">No offices available</option>';
      updateOfficeDetails(null);
      return;
    }

    officeSelect.innerHTML = offices
      .map(office => `<option value="${office.id}">${office.name}</option>`)
      .join('');

    officeSelect.value = offices[0].id;
    updateOfficeDetails(offices[0]);
  } catch (error) {
    officeSelect.innerHTML = '<option value="">Unable to load offices</option>';
    updateOfficeDetails(null);
    setMessage(`Unable to load office list: ${error.message}`, 'error');
  }
}

function getSelectedOffice() {
  return offices.find(office => office.id === officeSelect.value);
}

async function requestLocation() {
  if (!navigator.geolocation) {
    setLocationStatus('Geolocation is not supported in this browser.');
    return;
  }

  setLocationStatus('Requesting location...');

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
      setMessage('Please enable location access to check in from the office.', 'error');
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

form.addEventListener('submit', async event => {
  event.preventDefault();
  messageEl.textContent = '';

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const note = document.getElementById('note').value.trim();
  const latitude = parseFloat(latInput.value);
  const longitude = parseFloat(lngInput.value);
  const officeId = officeSelect.value;

  if (!name || !email || !officeId || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    setMessage('Complete the form, choose an office, and allow geolocation before checking in.', 'error');
    return;
  }

  try {
    const response = await fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, note, latitude, longitude, officeId })
    });

    const result = await response.json();
    if (result.ok) {
      setMessage(result.message, 'success');
      form.reset();
      officeSelect.value = offices[0]?.id || '';
      updateOfficeDetails(getSelectedOffice());
      requestLocation();
    } else {
      setMessage(result.error || 'Check-in failed.', 'error');
    }
  } catch (error) {
    setMessage(`Network error: ${error.message}`, 'error');
  }
});

fetchCurrentUser().then(user => {
  if (!user) return;
  loadOffices().then(() => {
    requestLocation();
    setInterval(requestLocation, 30000);
  });
});
