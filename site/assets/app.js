/* Gendi Notes — progressive enhancement only.
   Every feature here is an addition; the site is fully usable with JS off. */
(function () {
  "use strict";

  /* ---- theme toggle -------------------------------------------------------
     Cycles light -> dark -> system. Stored per-viewer; wrapped in try/catch
     because storage throws outright in some privacy modes. */
  var KEY = "gendi-theme";
  var root = document.documentElement;

  function readStored() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function store(v) {
    try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch (e) {}
  }
  function apply(v) {
    if (v === "light" || v === "dark") root.setAttribute("data-theme", v);
    else root.removeAttribute("data-theme");
  }
  function label(v) {
    return v === "light" ? "☀" : v === "dark" ? "☾" : "◐";
  }

  var current = readStored();
  apply(current);

  var toggle = document.getElementById("theme-toggle");
  if (toggle) {
    toggle.textContent = label(current);
    toggle.addEventListener("click", function () {
      current = current === "light" ? "dark" : current === "dark" ? null : "light";
      apply(current);
      store(current);
      toggle.textContent = label(current);
      toggle.setAttribute("aria-label", "Theme: " + (current || "system"));
    });
  }

  /* ---- sidebar filter ----------------------------------------------------
     Matches against the link text plus a data-keywords attribute so a search
     for "coredns" finds the DNS note even though the title does not say it. */
  var search = document.getElementById("nav-search");
  if (search) {
    var groups = [].slice.call(document.querySelectorAll(".nav-group"));
    var empty = document.getElementById("nav-empty");

    search.addEventListener("input", function () {
      var q = search.value.trim().toLowerCase();
      var total = 0;

      groups.forEach(function (group) {
        var shown = 0;
        [].slice.call(group.querySelectorAll("li")).forEach(function (li) {
          var a = li.querySelector("a");
          if (!a) return;
          var hay = (a.textContent + " " + (a.getAttribute("data-keywords") || "")).toLowerCase();
          var hit = !q || hay.indexOf(q) !== -1;
          li.hidden = !hit;
          if (hit) shown++;
        });
        group.hidden = shown === 0;
        total += shown;
      });

      if (empty) empty.hidden = total !== 0;
    });

    /* "/" focuses search, Escape clears it */
    document.addEventListener("keydown", function (e) {
      var typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === "/" && !typing) { e.preventDefault(); search.focus(); }
      if (e.key === "Escape" && document.activeElement === search) {
        search.value = "";
        search.dispatchEvent(new Event("input"));
        search.blur();
      }
    });
  }

  /* ---- active TOC entry --------------------------------------------------
     Highlights the heading currently in view. rootMargin pushes the trigger
     line below the sticky header so the highlight matches what you read. */
  var tocLinks = [].slice.call(document.querySelectorAll(".toc a"));
  if (tocLinks.length && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) { byId[a.getAttribute("href").slice(1)] = a; });

    var headings = tocLinks
      .map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); })
      .filter(Boolean);

    var visible = [];
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var id = entry.target.id;
        var i = visible.indexOf(id);
        if (entry.isIntersecting) { if (i === -1) visible.push(id); }
        else if (i !== -1) visible.splice(i, 1);
      });

      if (!visible.length) return;
      /* pick the topmost visible heading in document order */
      var best = headings.filter(function (h) { return visible.indexOf(h.id) !== -1; })[0];
      if (!best) return;
      tocLinks.forEach(function (a) { a.classList.remove("is-active"); });
      if (byId[best.id]) byId[best.id].classList.add("is-active");
    }, { rootMargin: "-72px 0px -70% 0px", threshold: 0 });

    headings.forEach(function (h) { observer.observe(h); });
  }

  /* ---- close the mobile drawer after navigating ------------------------- */
  var navToggle = document.getElementById("nav-toggle");
  if (navToggle) {
    document.querySelectorAll(".sidebar a").forEach(function (a) {
      a.addEventListener("click", function () { navToggle.checked = false; });
    });
  }
})();
