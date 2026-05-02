const fs = require('fs');
const path = require('path');

const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
const html = fs.readFileSync(indexPath, 'utf8');

const script = `
  <script>
    window.onerror = function(msg, src, line, col, err) {
      document.body.style.cssText = 'background:#0d1117;color:#f85149;font-family:monospace;padding:20px;overflow:auto;height:100vh;margin:0;box-sizing:border-box;';
      document.body.innerHTML = '<h2 style="margin:0 0 12px">App Crash</h2><pre style="color:#ff9900;white-space:pre-wrap;word-break:break-all">' + msg + '</pre><pre style="color:#e6edf3;font-size:11px;white-space:pre-wrap;word-break:break-all">' + (err ? err.stack : 'line ' + line + ':' + col) + '</pre><pre style="color:#8b949e;font-size:10px">src: ' + src + '</pre>';
      return false;
    };
    window.addEventListener('unhandledrejection', function(e) {
      document.body.style.cssText = 'background:#0d1117;color:#f85149;font-family:monospace;padding:20px;overflow:auto;height:100vh;margin:0;box-sizing:border-box;';
      document.body.innerHTML = '<h2 style="margin:0 0 12px">Unhandled Promise</h2><pre style="color:#e6edf3;white-space:pre-wrap;word-break:break-all">' + (e.reason && e.reason.stack ? e.reason.stack : String(e.reason)) + '</pre>';
    });
    // Show a visible marker so we know this script ran
    document.addEventListener('DOMContentLoaded', function() {
      if (document.getElementById('root') && !document.getElementById('root').children.length) {
        setTimeout(function() {
          if (!document.getElementById('root').children.length) {
            document.body.style.cssText = 'background:#0d1117;color:#ff9900;font-family:monospace;padding:20px;';
            document.body.innerHTML = '<h2>Script loaded but React did not mount</h2><p style="color:#8b949e">The JS bundle may have failed to load or execute.</p>';
          }
        }, 3000);
      }
    });
  </script>`;

const patched = html.replace('</head>', script + '\n  </head>');
fs.writeFileSync(indexPath, patched, 'utf8');
console.log('Injected error handler into dist/index.html');
