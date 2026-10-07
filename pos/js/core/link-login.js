// Login link: https://<app>/#u=<username>&p=<password> (both encodeURIComponent-encoded).
// Loaded as a classic script before the app module, so it runs before the hash router reads location.hash.
// The credentials stay in the URL fragment (never sent to a server), are removed from the address bar at once,
// are never stored or logged, and only pre-fill the login form. The user still presses Sign in.
(function () {
  var params = new URLSearchParams(location.hash.replace(/^#/, ''));
  var u = params.get('u');
  var p = params.get('p');
  params = null;
  if (u === null || p === null) return; // no hash, a normal route (#/dashboard) or only one value: do nothing
  history.replaceState(null, '', location.pathname + location.search); // router then starts on its default route

  var tries = 0;
  (function fill() {
    var loginView = document.getElementById('view-login');
    var appView = document.getElementById('view-app');
    var user = document.getElementById('login-username');
    var pass = document.getElementById('login-password');
    // Already signed in: the app view is shown instead of the login form, so discard the values.
    if (appView && !appView.classList.contains('d-none')) { u = p = null; return; }
    if (!user || !pass || !loginView || loginView.classList.contains('d-none')) {
      if (++tries < 100) setTimeout(fill, 100); else u = p = null;
      return;
    }
    user.value = u;
    pass.value = p;
    u = p = null;
    user.dispatchEvent(new Event('input', { bubbles: true }));
    pass.dispatchEvent(new Event('input', { bubbles: true }));

    var btn = document.getElementById('login-btn');
    if (btn && !document.getElementById('link-login-hint')) {
      var hint = document.createElement('div');
      hint.id = 'link-login-hint';
      hint.className = 'link-login-hint';
      hint.setAttribute('dir', 'rtl');
      hint.setAttribute('lang', 'ur');
      hint.setAttribute('role', 'status');
      hint.textContent = 'یوزر نیم اور پاس ورڈ خود بخود بھر دیے گئے ہیں۔ بس لاگ ان دبائیں';
      btn.parentNode.insertBefore(hint, btn);
      btn.classList.add('btn-attention');
      // On small phones the button can be below the fold: bring it into view so it is the obvious next tap.
      setTimeout(function () { btn.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 300);
    }
  })();
})();
