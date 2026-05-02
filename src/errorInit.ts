if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.onerror = function (msg, _src, line, col, err) {
    document.body.style.cssText =
      'background:#0d1117;color:#f85149;font-family:monospace;padding:20px;overflow:auto;height:100vh;margin:0;';
    document.body.innerHTML =
      '<h2 style="margin:0 0 12px">App Crash</h2>' +
      '<pre style="color:#ff9900;white-space:pre-wrap;word-break:break-all">' +
      msg +
      '</pre>' +
      '<pre style="color:#e6edf3;font-size:11px;white-space:pre-wrap;word-break:break-all">' +
      (err ? err.stack : 'line ' + line + ':' + col) +
      '</pre>';
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    document.body.style.cssText =
      'background:#0d1117;color:#f85149;font-family:monospace;padding:20px;overflow:auto;height:100vh;margin:0;';
    document.body.innerHTML =
      '<h2 style="margin:0 0 12px">Unhandled Promise Rejection</h2>' +
      '<pre style="color:#e6edf3;white-space:pre-wrap;word-break:break-all">' +
      (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)) +
      '</pre>';
  });
}
