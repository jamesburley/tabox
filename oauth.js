let API_KEY = '';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
var localTimestamp = 0;
var serverTimestamp = 0;

dateDiff.structure = {
  year: 31536000,
  month: 2592000,
  week: 604800,
  day: 86400,
  hour: 3600,
  minute: 60,
  second: 1
};
function dateDiff(timestamp, structure = dateDiff.structure) {
  let delta = Math.abs(timestamp - new Date().getTime()) / 1000; 
  let res = {};

  for(let key in structure) {
      res[key] = Math.floor(delta / structure[key]);
      delta -= res[key] * structure[key];
  }
  
  return res;
}

function setLoggedOutUI() {
  $('a.gdrive_sync').text('Signin with Google to enable sync');
  $('a.gdrive_sync').attr('title', 'Signin with Google to enable sync');
  $('a.gdrive_sync').data('type', 'login');
  $('#avatar').attr('src', 'images/not_signed_in.png');
  setSyncDone('Sync Disabled');
}
function setLoggedInUI(user) {
  $('#avatar').attr('src', user.photoLink);
  $('a.gdrive_sync').text(`Sync enabled for ${user.displayName}`);
  $('a.gdrive_sync').data('type', 'logout');
  $('a.gdrive_sync').attr('title', `Sync enabled for ${user.displayName}`);
}

function logout() {
  chrome.identity.getAuthToken({interactive: false}, function(token) {
    const url = 'https://accounts.google.com/o/oauth2/revoke?token=' + token;
    fetch(url).then(function() {
      chrome.identity.removeCachedAuthToken({token: token}, function (){
        setLoggedOutUI();
      });
    });
  });
}

function handleRequestError() {
  logout();
  showMessage('There was an error during sync, please login again');
}

function setLoginUIBasedOnTokenValidity(token) {
  const init = {
    method: 'GET',
    async: true,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    'contentType': 'json'
  };
  fetch(
    `https://www.googleapis.com/drive/v3/about?alt=json&fields=user&prettyPrint=false&key=${API_KEY}`,
    init)
    .then((response) => {
      if (response.status >= 400) {
        logout();
        return;
      }
      response.json().then((data) => {
        setLoggedInUI(data.user);
        searchForSyncFile();
      })
    }).catch(err => logout());
}

function setSyncInProgress() {
  $('#syncImg').addClass('rotate');
  $('.sync_msg').html('Syncing...');
}

function setSyncDone(msg) {
  $('#syncImg').removeClass('rotate');
  $('.sync_msg').html(msg);
}

function updateLastSyncMessage() {
  if ($('.gdrive_sync').data('type') === "login") {
    setSyncDone('Sync Disabled');
    return;
  }
  const diffObj = dateDiff(localTimestamp);
      let lastSyncMsg = '';
      lastSyncMsg = (diffObj.year === 1) ? 'Over a year ago' : `${diffObj.year} years ago`;
      if(diffObj.year === 0) {
        lastSyncMsg = (diffObj.month === 1) ? 'Over a month ago' : `${diffObj.month} months ago`;
        if(diffObj.month === 0) {
          lastSyncMsg = (diffObj.week === 1) ? 'Over a week ago' : `${diffObj.week} weeks ago`;
          if(diffObj.week === 0) {
            lastSyncMsg = (diffObj.day === 1) ? 'Over a day ago' : `${diffObj.day} days ago`;
            if(diffObj.day === 0) {
              lastSyncMsg = (diffObj.hour === 1) ? 'Over a hour ago' : `${diffObj.hour} hours ago`;
              if(diffObj.hour === 0) {
                lastSyncMsg = (diffObj.minute === 1) ? 'Over a minute ago' : `${diffObj.minute} minutes ago`;
                if(diffObj.minute === 0) {
                  lastSyncMsg = (diffObj.second > 10) ? `${diffObj.second} seconds ago` : 'a few seconds ago';
                }
              }
            }
          }
        }
      }
      setSyncDone(lastSyncMsg);
}

function sync() {
  const syncEnabled = $('.gdrive_sync').data('type') === "logout";
  if (!syncEnabled) return;
  setSyncInProgress();
  chrome.storage.sync.get('syncFileId', (items) => {
    const fileId = items['syncFileId'];
    if(localTimestamp > serverTimestamp) {
      updateServerSettings(fileId);
    } else {
      loadSettingsFile(fileId);
    }
  });
}

function updateServerSettings(fileId) {
  chrome.identity.getAuthToken({interactive: false}, token => {
    chrome.storage.local.get('settings', (items) => {
      const localSettings = items['settings'] === '' ? null : items['settings'];
      const init = {
        method: 'PATCH',
        async: true,
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json'
        },
        'contentType': 'json',
        body: JSON.stringify({settings: localSettings})
      };
      const url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media&access_token=${token}`;
      fetch(url, init).then(response => {
        if(response.status >= 400) {
          handleRequestError();
          setSyncDone('sync error');
          return;
        }
        serverTimestamp = Date.now();
        updateLastSyncMessage();
      });
    });
  });
}

function createNewSyncFile(token) {
  const metadata = {
    name: 'appSettings.json',
    mimeType: 'application/json',
    parents: ['appDataFolder'],
  };
  chrome.storage.local.get('settings', (items) => {
    let fileContent = {
      settings: items['settings']
    };
    let file = new Blob([JSON.stringify(fileContent)], {type: 'application/json'});
    let form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], {type: 'application/json'}));
    form.append('file', file);
    const init = {
      method: 'POST',
      async: true,
      headers: {
        Authorization: 'Bearer ' + token
      },
      body: form
    };
    fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      init)
      .then((response) => {
        if(response.status >= 400) {
          handleRequestError();
          return;
        }
        serverTimestamp = Date.now();
        response.json().then((data) => {
          chrome.storage.sync.set({syncFileId: data.id}, () => sync());
        })
      }).catch(err => handleRequestError());
  });
}

function getServerFileTimestamp(token, fileId) {
  const init = {
    method: 'GET',
    async: true,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    'contentType': 'json'
  };
  fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=json&fields=modifiedByMeTime`,
    init)
    .then((response) => {
      if(response.status >= 400) {
        handleRequestError();
        return;
      }
      response.json().then( data => {
        const ts = Date.parse(data.modifiedByMeTime);
        serverTimestamp = ts;
      });
    });
}

function loadSettingsFile(fileId) {
  chrome.identity.getAuthToken({interactive: false}, token => {
    const init = {
      method: 'GET',
      async: true,
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      'contentType': 'json'
    };
    fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      init)
      .then((response) => {
        if(response.status >= 400) {
          handleRequestError();
          return;
        }
        response.json().then( data => {
          getServerFileTimestamp(token, fileId);
          chrome.storage.local.set({settings: data.settings}, () => {
            settings_data = data.settings === null ? [] : data.settings.split(SETTING_SEPERATOR);
            rebuildTabGroups();
            localTimestamp = Date.now();
            updateLastSyncMessage();
          });
        });
      });
  });
}

function searchForSyncFile() {
  chrome.identity.getAuthToken({interactive: false}, function(token) {
    const url = "https://www.googleapis.com/drive/v3/files/?corpora=user&spaces=appDataFolder&fields=files(id)&q=name='appSettings.json'&pageSize=1&orderBy=modifiedByMeTime desc";
    fetch(url, {
      mode: 'cors',
      withCredentials: true,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    }).then(response => {
      if(response.status >= 400) {
        handleRequestError();
        return;
      }
      response.json().then(data => {
        if (data.files.length === 0) {
          createNewSyncFile(token);
        } else {
          chrome.storage.sync.set({syncFileId: data.files[0].id}, () => sync());
        }
      });
    });
  });
}

window.onload = function() {
  // Get Google Drive API key
  const url = chrome.runtime.getURL('api-keys.json');
  fetch(url)
      .then((response) => response.json()) //assuming file contains json
      .then((json) => API_KEY = json.googleDrive);
  setInterval(() => updateLastSyncMessage(), 20000);
  chrome.identity.getAuthToken({interactive: false}, function (token) {
    if (chrome.runtime.lastError) {
      var errorMsg = chrome.runtime.lastError.message;
      if (errorMsg.includes('OAuth2 not granted or revoked')) {
        setLoggedOutUI();
      }
    }
    if (!token) {
        setLoggedOutUI();
    } else {
      setLoginUIBasedOnTokenValidity(token);
    }
  });

  $('.gdrive_sync').on('click', function() {
    let btnType = $('.gdrive_sync').data('type');
    if (btnType === "login") {
      chrome.runtime.sendMessage({login: true}, function(response) {
        if (response.token) {
          setLoginUIBasedOnTokenValidity(response.token);
        }
      });
    } else {
      logout();
    }
  });
};
