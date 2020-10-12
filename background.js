chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.login) {
    chrome.identity.getAuthToken({interactive: true}, function(token) {
      sendResponse({token: token});
    });
  }
  return true;
});
