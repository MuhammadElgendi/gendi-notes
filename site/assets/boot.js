/* Applies the stored theme before first paint, so the page never flashes the
   wrong background. Must be a separate file, not inline: the CSP is
   script-src 'self' with no 'unsafe-inline'. Load it synchronously in <head>. */
try {
  var t = localStorage.getItem("gendi-theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
} catch (e) {}
