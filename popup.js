
// --------------------- CONSTANTS & Global Variables -----------------------

const URL_SEPERATOR = '`';
const SETTING_SEPERATOR = '|';
const PINNED_TAB_INDICATOR = '*';
const LAST_SESSION_TEXT = 'Open your last closed window or tab';

let settings_body = null;
let settings_data = null;
let saveSelectedOnly = false;
// -------------------------- Helper Methods --------------------------------

function appendSavedSetting(index, setting_title, hidden=false, total_tabs) {
  // append a tab group div to the list
  const style = hidden && "style='opacity:0;'";
  const tab_word = total_tabs.length === 1 ? "tab" : "tabs";
  const rowId = `row${index}`;
  const row = `
    <div id='${rowId}' ${style} class='setting_row'>
      <div class='handle'>&#x22ee;&#x22ee;</div>
      <div title='${setting_title}' class='settings_div' id='row_content${index}'>
        ${setting_title}
      </div>
      <div class='right_items'>
        <span class='total_tabs'>${total_tabs} ${tab_word}</span>
        <span data-title='${setting_title}' title='Export ${setting_title} to a file' class='export'> </span>
        <span title='Delete ${setting_title}' class='del' index='${index}'> </span>
      </div>
    </div>`;
  settings_body.prepend(row);
}

function showEmptyMessage() {
  // show a message that there are no saved tab groups
  const image = "<img class='no_contant_image' src='images/desert.png' alt='desert scene' /><br />";
  settings_body.html(`<p id='nothing_message'>You don't have any tab groups!<br />${image}Add the current tabs or import a group from file.</p>`);
}

function showMessage(text) {
  // function to show error messages
  let message_div = $('#messages');
  message_div.removeClass('show');
  message_div.html(text);
  message_div.addClass('show');
  setTimeout(() => message_div.removeClass('show'), 3000);
}

function updateStorage(arr) {
  // convert the settings_data array into string and save it to local-storage
  let content = '';
  arr.forEach(function(value, index) {
    content += value;
    if (index < arr.length - 1) content += SETTING_SEPERATOR;
  });
  chrome.storage.local.set({settings:content}, () => {
    localTimestamp = Date.now();
    sync();
  });
}

Array.prototype.moveElement = function (from, to) {
  let arr = this;
  let cutOut = arr.splice(from, 1) [0]; // cut the element at index 'from'
  arr.splice(to, 0, cutOut);
};

function rebuildTabGroups() {
  settings_body.html('');
  if (settings_data.length === 0) {
    showEmptyMessage();
    return;
  }
  settings_data.forEach(function(value, index){
    let single_setting_arr = value.split(URL_SEPERATOR);
    appendSavedSetting(index, single_setting_arr[0], false, single_setting_arr.length - 1);
  });
}

function download(filename, text) {
  // download a txt file containing all the data for the selected tab group
  let element = document.createElement('a');
  element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(text));
  element.setAttribute('download', filename);
  element.style.display = 'none';
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}

// -------------------------- DOMContentLoaded Code --------------------------------
document.addEventListener('DOMContentLoaded', () => {
  settings_body = $('#settings_body');
  chrome.tabs.query({currentWindow:true, highlighted: true}, (tabs) => {
    let tabTypeWord = $('#tabTypeWord');
    let highlighted_note = $('.highlighted_note');
    let highlighter = $('.highlighter');
    if (tabs.length > 1) {
      saveSelectedOnly = true;
      tabTypeWord.text('selected');
      highlighter.text(`${tabs.length} selected`);
      highlighted_note.fadeIn();
    } else {
      saveSelectedOnly = false;
      tabTypeWord.text('open');
      highlighted_note.fadeOut();
    }
  });
  settings_body.sortable({
    easing: 'cubic-bezier(0.37, 0, 0.63, 1)',
    animation: 350,
    ghostClass: 'sortable_ghost',
    handle: '.handle',
    onUpdate: function(evt) {
      settings_data.reverse();
      settings_data.moveElement(evt.oldIndex, evt.newIndex);
      settings_data.reverse();
      updateStorage(settings_data);
      rebuildTabGroups();
    }
  });
  $('.version').html('version ' + chrome.runtime.getManifest().version);
  // Set the 'open in new window' checkbox state
  chrome.storage.sync.get('chkOpenNewWindow',(items) => {
        $('#chkOpenNewWindow').prop('checked', items.chkOpenNewWindow);
  });
  $('#new_setting_title').focus();

  const toggleSwitch = document.querySelector('#chkDarkMode');

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    chrome.storage.sync.set({theme: theme});
    $('#darkModeState').text(theme === 'light' ? 'off' : 'on');
    var elm = document.querySelector('.theme-switch-inner-circle');
    var newone = elm.cloneNode(true);
    elm.parentNode.replaceChild(newone, elm);
    $('.theme-switch').toggleClass('out');
    $('.theme-switch').toggleClass('over');
    toggleSwitch.checked = theme === 'dark';
  }

  function switchTheme(e) {
    setTheme(e.target.checked ? 'dark' : 'light');
  }

  toggleSwitch.addEventListener('change', switchTheme, false);
  $('.theme-switch-inner-circle, .dark_mode_switch_label').click((event) => {
    toggleSwitch.click();
  });

  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    const currentTheme = e.matches ? "dark" : "light";
    setTheme(currentTheme);
  });

  chrome.storage.sync.get('theme', (items) => {
    let currentTheme = items['theme'];
    if (!currentTheme) currentTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    setTheme(currentTheme);
  });

  // Load the currently saved settings from storage
  chrome.storage.local.get('settings',(items) => {
    if (items.settings) {
      settings_data = items.settings.split(SETTING_SEPERATOR);
      rebuildTabGroups();
    } else {
      settings_data = [];
      showEmptyMessage();
    }
  });

  // Get the recently closed tabs history and show the option to open them
  const filter = {maxResults:1};
  chrome.sessions.getRecentlyClosed(filter, (sessions) => {
    var session = sessions[0];
    if ((session.window && session.window != undefined) || (session.tab && session.tab != undefined)) {
      $('#settings_all').append("<div id='rowClosed' class=''><div title='" + LAST_SESSION_TEXT + "' class='settings_div setting_closed'>" + LAST_SESSION_TEXT + "</div></div>");
    }
  });

  // Handle clicking on "Open your last closed session"
  $('#settings_all').on('click', '.setting_closed', () => chrome.sessions.restore());

  // Clicking on one of the saved tab groups
  $('#settings_body').on('click', '.settings_div', ({currentTarget}) => {
    const setting_id = $(currentTarget).attr('title');
    settings_data.forEach((value) => {
      const single_setting_arr = value.split(URL_SEPERATOR);
      if (single_setting_arr[0] == setting_id) openTabsWithUrls(single_setting_arr);
    });
  });

  $( '#frmSaveTabs' ).submit(( event ) => {
    // disable the submit action for the add new tab group form
    event.preventDefault();
  });

  // Adding a new setting (tab group)
  $('#add_new_setting').click(() => {
    const new_setting_title = $('#new_setting_title').val(); // the setting name
    if( new_setting_title == '') {
      // enter a title for this configuration...
      showMessage('Please enter a name for the tab group');
      return;
    } else {
      // save the current open tabs into local storage
      let tabQueryProperties = {currentWindow:true};
      if (saveSelectedOnly) tabQueryProperties.highlighted = true;
      chrome.tabs.query(tabQueryProperties, handleTabsAndSave); // the 'handleTabsAndSave' function handles the saving of all open tabs
    }
  });

  // Clicking the 'open in new window' switch
  $('#settings_all').on('change', '#chkOpenNewWindow', () => {
    const chkBoxState = $('#chkOpenNewWindow').is(':checked');
    chrome.storage.sync.set({chkOpenNewWindow:chkBoxState});
  });

  // Click event for the delete icon next to each setting
  $('#settings_body').on('click', '.del', ({currentTarget}) => {
    indexToDelete = $(currentTarget).attr('index');
    settings_data.splice(indexToDelete,1);
    // send the new array without the setting we deleted to be saved into storage
    updateStorage(settings_data);
    $('#row' + indexToDelete).slideUp().fadeOut('normal',() => {
      $('#row' + indexToDelete).remove();
      rebuildTabGroups();
      if (settings_data.length < 1) {
        showEmptyMessage();
      }
    });
  });

  // Export a tab group to text file
  $('#settings_body').on('click', '.export', ({currentTarget}) => {
    const setting_name = $(currentTarget).attr('data-title'); // the current setting we want to export
    const indexToExport = $(currentTarget).attr('index');
    download(setting_name,settings_data[indexToExport]);
  });

  // importing a text file
  $('#file-input').change(function(event) {
    if (this.value.lastIndexOf('.txt')==-1) {
      showMessage('Only .txt files are allowed');
      return;
    }
    const file = event.target.files[0];
    let reader = new FileReader();
    reader.onload = function (e) {
        const result = reader.result;
        if (result.indexOf('`') == -1) {
          showMessage('Invalid file - please try something else');
          return;
        }
        $('#nothing_message').remove();
        let conf_title = result.split(URL_SEPERATOR)[0];
        conf_title = conf_title.replace("'",'&#39;');
        settings_data = [...settings_data, result];
        updateStorage(settings_data);
        let counter = $('.settings_div').length - 1;
        appendSavedSetting(counter, conf_title, true, result.length - 1);
        $('#row' + counter).fadeIn('normal', () => {
          rebuildTabGroups();
          event.target.value = '';
        });
    }
    reader.readAsText(file);
  });
});

// -------------------------------------- Functions -------------------------------------


function handleTabsAndSave(tabs) {
  // list all open tabs and save them to storage
  $('#nothing_message').remove();
  let conf_title = $('#new_setting_title').val();
  conf_title = conf_title.replace("'",'&#39;');

  let urls = conf_title + URL_SEPERATOR;
  tabs.forEach((tab, index) => {
    if (tab.pinned) urls += PINNED_TAB_INDICATOR;
    urls += tab.url;
    if (index < tabs.length - 1) urls += URL_SEPERATOR;
  });
  settings_data = [...settings_data, urls];
  updateStorage(settings_data);
  let counter = $('.settings_div').length - 1;
  appendSavedSetting(counter, conf_title, true, tabs.length);
  $('#row' + counter).addClass('new_row');
  setTimeout(() => rebuildTabGroups(), 500);
}

function isPinnedTab(url) {
  // this function checks if a URL we saved to storage is pinned or not.
  return url.startsWith(PINNED_TAB_INDICATOR);
}

function openTabsWithUrls(arr) {
  // open a new Chrome window and load the saved URLs into tabs in it.
  arr.shift();
  if ($('#chkOpenNewWindow').is(':checked'))
  {
    chrome.windows.create({focused:true},(window) => {
      // create a new window
      arr.forEach((current_url, index) => {
        const isPinned = isPinnedTab(current_url);
        if(isPinned)
        {
          current_url = current_url.substring(1,current_url.length); //remove the * that marks this url as 'pinned'
        }
        // create the tab for the current url
        if (index == 1){
          chrome.tabs.update(window.tabs[0].id,{url:current_url,pinned:isPinned});
        } else {
          const tab_properties = {windowId:window.id,url:current_url,pinned:isPinned};
          setTimeout(() => chrome.tabs.create(tab_properties), 1);
        }
      });
    });
  } else {
    // Use current window
    chrome.tabs.query({currentWindow:true},(tabs) => {
      arr.forEach((current_url, index) => {
        const isPinned = isPinnedTab(current_url);
        if(isPinned)
        {
          current_url = current_url.substring(1,current_url.length); //remove the * that marks this url as 'pinned'
        }
        const tab_properties = {url:current_url,pinned:isPinned};
        // create the tab for the current url
        if (index == 1 && (tabs.length == 1 && tabs[0].url.indexOf('://newtab') > 0)){
          chrome.tabs.update(tabs[0].id, tab_properties);
        } else {
          setTimeout(() => chrome.tabs.create(tab_properties), 1);
        }
      });
    });
  }
}
