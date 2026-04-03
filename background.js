// Background service worker
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSalesforceCookie') {
    const tabUrl = request.tabUrl || '';
    // Extract org subdomain from the tab URL (e.g. "salsa-totalenergies" from "salsa-totalenergies.my.salesforce-setup.com")
    const orgMatch = tabUrl.match(/https:\/\/([^.]+)/);
    const orgSubdomain = orgMatch ? orgMatch[1] : null;

    // Build list of domains to search, most specific first
    const domainsToTry = [];
    if (orgSubdomain) {
      domainsToTry.push(orgSubdomain + '.my.salesforce.com');
      domainsToTry.push(orgSubdomain + '.lightning.force.com');
    }
    domainsToTry.push('.salesforce.com', '.force.com', '.salesforce-setup.com');

    // Try each domain in order until we find a sid cookie
    function tryNextDomain(index) {
      if (index >= domainsToTry.length) {
        sendResponse({ sessionId: null });
        return;
      }
      chrome.cookies.getAll({ domain: domainsToTry[index], name: 'sid' }, (cookies) => {
        if (cookies && cookies.length > 0) {
          sendResponse({ sessionId: cookies[0].value, domain: cookies[0].domain });
        } else {
          tryNextDomain(index + 1);
        }
      });
    }

    tryNextDomain(0);
    return true; // async
  }

  if (request.action === 'openApp') {
    chrome.tabs.create({ url: chrome.runtime.getURL('app.html') + '?' + new URLSearchParams(request.params).toString() });
    sendResponse({ ok: true });
    return true;
  }
});
