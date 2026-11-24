/* Runs in <head> before first paint so the page never flashes the wrong theme. */
(function () {
  var theme = null;
  try { theme = localStorage.getItem("vkfz.theme"); } catch (e) { /* storage blocked: ignore */ }
  if (theme !== "light" && theme !== "dark") {
    theme = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  }
  document.documentElement.setAttribute("data-theme", theme);
})();

/* Same for the sidebar: if the reader folded it away, keep it folded on the next page. */
(function () {
  try { if (localStorage.getItem("vkfz.nav") === "hidden") document.documentElement.setAttribute("data-nav", "hidden"); } catch (e) { /* ignore */ }
})();

/* Start downloading the two fonts the first screen needs, so text doesn't visibly
   switch font after the page appears. Only when served over http(s): browsers refuse
   font preloads from file://, and the site must still open straight from disk. */
(function () {
  try {
    if (!/^https?:$/.test(location.protocol)) return;
    var me = document.currentScript && document.currentScript.src;
    if (!me) return;
    var base = me.replace(/js\/theme-init\.js(\?.*)?$/, "assets/fonts/");
    ["atkinson-hyperlegible-latin-400-normal", "barlow-semi-condensed-latin-700-normal"].forEach(function (f) {
      var l = document.createElement("link");
      l.rel = "preload"; l.as = "font"; l.type = "font/woff2"; l.crossOrigin = "anonymous";
      l.href = base + f + ".woff2";
      document.head.appendChild(l);
    });
  } catch (e) { /* preloading is only an optimisation */ }
})();
