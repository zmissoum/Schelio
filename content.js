// Content script - runs on Salesforce pages
// Extracts session information for API calls

(function() {
  // Listen for messages from popup/app
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'getSessionInfo') {
      const info = extractSessionInfo();
      sendResponse(info);
    }
    return true;
  });

  function extractSessionInfo() {
    const result = {
      instanceUrl: null,
      sessionId: null,
      orgId: null
    };

    // Try to get instance URL from current page
    const url = window.location.href;
    const match = url.match(/(https:\/\/[^/]+)/);
    if (match) {
      result.instanceUrl = match[1];
    }

    // Try to extract session ID from cookie
    const sidCookie = document.cookie.split(';').find(c => c.trim().startsWith('sid='));
    if (sidCookie) {
      result.sessionId = sidCookie.split('=')[1];
    }

    // Try to get org ID from page
    try {
      const metaOrgId = document.querySelector('meta[name="org-id"]');
      if (metaOrgId) {
        result.orgId = metaOrgId.getAttribute('content');
      }
    } catch(e) {}

    return result;
  }
})();
