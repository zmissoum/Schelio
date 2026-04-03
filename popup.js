document.addEventListener('DOMContentLoaded', () => {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  const orgName = document.getElementById('orgName');
  const btnLaunch = document.getElementById('btnLaunch');
  const btnManual = document.getElementById('btnManual');
  const manualForm = document.getElementById('manualForm');
  const btnManualLaunch = document.getElementById('btnManualLaunch');

  let sessionInfo = null;

  // Try to detect Salesforce session from active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && (tab.url.includes('salesforce.com') || tab.url.includes('force.com') || tab.url.includes('salesforce-setup.com'))) {
      const isSetupDomain = tab.url.includes('salesforce-setup.com');

      // On setup domain, skip content script — its cookie won't work for API calls
      if (isSetupDomain) {
        getSessionViaCookies(tab);
      } else {
        // Try content script first
        chrome.tabs.sendMessage(tab.id, { action: 'getSessionInfo' }, (response) => {
          if (chrome.runtime.lastError || !response || !response.sessionId) {
            getSessionViaCookies(tab);
          } else {
            sessionInfo = response;
            showConnected(response.instanceUrl);
          }
        });
      }
    } else {
      showDisconnected();
    }
  });

  function getSessionViaCookies(tab) {
    chrome.runtime.sendMessage({ action: 'getSalesforceCookie', tabUrl: tab.url }, (cookieResp) => {
      if (cookieResp && cookieResp.sessionId) {
        // Extract org subdomain from tab URL and build the API-compatible instance URL
        const urlMatch = tab.url.match(/https:\/\/([^.]+)/);
        const orgSubdomain = urlMatch ? urlMatch[1] : null;

        let apiInstanceUrl;
        if (orgSubdomain && cookieResp.domain) {
          // Build from cookie domain for accuracy
          apiInstanceUrl = 'https://' + orgSubdomain + '.my.salesforce.com';
        } else {
          const fullMatch = tab.url.match(/(https:\/\/[^/]+)/);
          apiInstanceUrl = fullMatch ? fullMatch[1] : null;
        }

        sessionInfo = {
          instanceUrl: apiInstanceUrl,
          sessionId: cookieResp.sessionId
        };
        showConnected(sessionInfo.instanceUrl);
      } else {
        showDisconnected();
      }
    });
  }

  function showConnected(url) {
    statusDot.className = 'status-dot connected';
    statusText.textContent = 'Connected to Salesforce';
    orgName.textContent = url || '';
    btnLaunch.disabled = false;
  }

  function showDisconnected() {
    statusDot.className = 'status-dot disconnected';
    statusText.textContent = 'No Salesforce tab detected';
    orgName.textContent = 'Open a Salesforce org first, or use manual connection.';
  }

  btnLaunch.addEventListener('click', () => {
    if (sessionInfo) {
      launchApp(sessionInfo.instanceUrl, sessionInfo.sessionId);
    }
  });

  btnManual.addEventListener('click', () => {
    manualForm.classList.toggle('visible');
  });

  btnManualLaunch.addEventListener('click', () => {
    const url = document.getElementById('inputUrl').value.trim().replace(/\/+$/, '');
    const sid = document.getElementById('inputSession').value.trim();
    if (url && sid) {
      launchApp(url, sid);
    }
  });

  function launchApp(instanceUrl, sessionId) {
    chrome.runtime.sendMessage({
      action: 'openApp',
      params: { instanceUrl, sessionId }
    });
    window.close();
  }
});
