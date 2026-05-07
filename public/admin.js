const sessionUserEl = document.getElementById('session-user');
const userListEl = document.getElementById('user-list');
const addUserForm = document.getElementById('add-user-form');
const addUsernameInput = document.getElementById('new-username');
const addPasswordInput = document.getElementById('new-password');
const addDisplayNameInput = document.getElementById('new-displayname');
const addEmailInput = document.getElementById('new-email');
const addRoleInput = document.getElementById('new-role');
const recordsEl = document.getElementById('records');
const countEl = document.getElementById('record-count');
const logoutButton = document.getElementById('logout-button');

async function fetchCurrentUser() {
  try {
    const response = await fetch('/api/me');
    const data = await response.json();
    if (!data.ok || !data.user || data.user.role !== 'admin') {
      window.location.href = '/login.html?next=admin.html';
      return null;
    }

    sessionUserEl.textContent = data.user.username;
    return data.user;
  } catch (error) {
    window.location.href = '/login.html?next=admin.html';
    return null;
  }
}

function renderUsers(users) {
  if (!userListEl) return;
  if (!users.length) {
    userListEl.innerHTML = `<p class="empty">${i18n.t('noUsersFound')}</p>`;
    return;
  }

  userListEl.innerHTML = users
    .map(user => `
      <article class="record-card user-card">
        <div><strong>${user.displayName || user.username}</strong> <span class="tag">${user.role}</span></div>
        <div>${i18n.t('usernameLabel')}: ${user.username}</div>
        <div>${i18n.t('accountEmailLabel')}: ${user.email || '-'}</div>
        <div>${i18n.t('roleLabel')}: ${user.role}</div>
        <button class="button secondary delete-user-button" data-username="${user.username}" ${user.username === sessionUserEl.textContent ? 'disabled' : ''} data-i18n="deleteButton">${i18n.t('deleteButton')}</button>
      </article>
    `)
    .join('');

  userListEl.querySelectorAll('.delete-user-button').forEach(button => {
    button.addEventListener('click', async event => {
      const username = event.target.dataset.username;
      if (!username) return;
      await deleteUser(username);
    });
  });
}

async function loadUsers() {
  try {
    const response = await fetch('/api/users');
    const data = await response.json();
    if (data.ok) {
      renderUsers(data.users);
    } else {
      userListEl.innerHTML = `<p class="error">${data.error || i18n.t('unableLoadRecords')}</p>`;
    }
  } catch (error) {
    userListEl.innerHTML = `<p class="error">${i18n.t('unableLoadRecords')} ${error.message}</p>`;
  }
}

async function deleteUser(username) {
  try {
    const response = await fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
    const data = await response.json();
    if (!data.ok) {
      alert(data.error || 'Unable to delete user.');
      return;
    }
    loadUsers();
  } catch (error) {
    alert(`${i18n.t('networkErrorPrefix')} ${error.message}`);
  }
}

async function createUser(event) {
  event.preventDefault();
  const username = addUsernameInput.value.trim();
  const password = addPasswordInput.value.trim();
  const displayName = addDisplayNameInput.value.trim();
  const email = addEmailInput.value.trim();
  const role = addRoleInput.value;

  if (!username || !password) {
    alert(i18n.t('pleaseEnterCredentials'));
    return;
  }

  try {
    const response = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, displayName, email, role })
    });
    const data = await response.json();
    if (data.ok) {
      addUserForm.reset();
      loadUsers();
    } else {
      alert(data.error || 'Unable to create account.');
    }
  } catch (error) {
    alert(`${i18n.t('networkErrorPrefix')} ${error.message}`);
  }
}

async function logout() {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

logoutButton?.addEventListener('click', async event => {
  event.preventDefault();
  await logout();
});

addUserForm?.addEventListener('submit', createUser);

async function loadRecords() {
  try {
    const response = await fetch('/api/attendance');
    const data = await response.json();
    if (!data.records) {
      recordsEl.innerHTML = `<p class="empty">${i18n.t('noRecordsYet')}</p>`;
      return;
    }

    countEl.textContent = data.records.length;
    if (!data.records.length) {
      recordsEl.innerHTML = `<p class="empty">${i18n.t('noRecordsYet')}</p>`;
      return;
    }

    recordsEl.innerHTML = data.records
      .map(record => `
      <article class="record-card">
        <div><strong>${record.displayName || record.username || record.name}</strong> <span class="tag">${record.type || 'checkin'}</span></div>
        <div>${i18n.t('usernameLabel')}: ${record.username || '-'}</div>
        <div>${i18n.t('chooseOfficeLabel')}: ${record.officeName || i18n.t('unknown')}</div>
        <div>${i18n.t('accountEmailLabel')}: ${record.email || '-'}</div>
        <div>When: ${new Date(record.timestamp).toLocaleString()}</div>
        <div>Distance: ${record.distance} m</div>
        <div>Location: ${record.latitude.toFixed(5)}, ${record.longitude.toFixed(5)}</div>
        <div>Note: ${record.note || i18n.t('none')}</div>
      </article>
    `)
      .join('');
  } catch (error) {
    recordsEl.innerHTML = `<p class="error">${i18n.t('unableLoadRecords')} ${error.message}</p>`;
  }
}

fetchCurrentUser().then(user => {
  if (!user) return;
  loadUsers();
  loadRecords();
});
