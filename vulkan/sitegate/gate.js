/* =========================================================================
   gate.js — unlocks a site built by tools/protect.mjs.

   The password is turned into an AES-256-GCM key with PBKDF2-SHA256 (the
   same scheme as the AMDVLK Driver Atlas). Then:
     1. the page body is decrypted and inserted (without its scripts),
     2. the page's scripts run in their original order: inline ones are
        decrypted from the body, file ones are loaded as small encrypted
        wrapper files that call SITEGATE.exec(), which decrypts and runs them,
     3. files a site loads later on its own (lazy data) also go through
        SITEGATE.exec(), using the key kept for this tab.
   The derived key (never the password) is kept in sessionStorage for this
   tab, scoped to this build's salt, so other pages don't ask again.
   ========================================================================= */
(function () {
  "use strict";
  var L = window.SITEGATE_LOCK;
  var KEY_NAME = "sitegate-key-" + L.salt;
  var subtle = window.crypto && window.crypto.subtle;
  var aesKey = null;

  function fromB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function toB64(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function store(v) { try { if (v === null) sessionStorage.removeItem(KEY_NAME); else sessionStorage.setItem(KEY_NAME, v); } catch (e) { /* storage blocked: ask on each page */ } }
  function stored() { try { return sessionStorage.getItem(KEY_NAME); } catch (e) { return null; } }

  function decrypt(b64text) {
    var d = fromB64(b64text);
    return subtle.decrypt({ name: "AES-GCM", iv: d.slice(0, 12) }, aesKey, d.slice(12)).then(function (pt) {
      return new TextDecoder().decode(pt);
    });
  }
  function runCode(code) {
    var s = document.createElement("script");
    s.textContent = code;
    document.body.appendChild(s);
  }

  // Encrypted wrapper files call this. Runs now if unlocked, otherwise after unlocking.
  var queue = [];
  window.SITEGATE = {
    exec: function (ciphertext) {
      var el = document.currentScript;
      var job = function () { return decrypt(ciphertext).then(runCode); };
      var p = aesKey ? job() : new Promise(function (res, rej) { queue.push(function () { job().then(res, rej); }); });
      if (el) el.sitegateDone = p;
      return p;
    }
  };

  // Load one encrypted wrapper file and wait until its code has run.
  function loadWrapper(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = function () { (s.sitegateDone || Promise.resolve()).then(resolve, reject); };
      s.onerror = function () { reject(new Error("could not load " + src)); };
      document.body.appendChild(s);
    });
  }

  function start(bodyHtml) {
    // Separate the body's markup from its scripts, keeping the scripts' order.
    var tpl = document.createElement("template");
    tpl.innerHTML = bodyHtml;
    var scripts = Array.prototype.map.call(tpl.content.querySelectorAll("script"), function (s) {
      var info = { src: s.getAttribute("src"), code: s.textContent };
      s.remove();
      return info;
    });
    var gate = document.getElementById("sitegate");
    if (gate) gate.remove();
    document.body.insertBefore(tpl.content, document.body.firstChild);
    return scripts.reduce(function (chain, sc) {
      return chain.then(function () { return sc.src ? loadWrapper(sc.src) : runCode(sc.code); });
    }, Promise.resolve()).then(function () {
      queue.splice(0).forEach(function (f) { f(); });
    });
  }

  function unlock(rawBits) {
    return subtle.importKey("raw", rawBits, "AES-GCM", false, ["decrypt"]).then(function (key) {
      aesKey = key;
      return decrypt(L.check);
    }).then(function (check) {
      if (check !== L.checkText) throw new Error("wrong key");
      return decrypt(document.getElementById("sitegate-body").textContent);
    }).then(function (bodyHtml) {
      store(toB64(rawBits));
      return bodyHtml;
    }, function (e) {
      aesKey = null;  // wrong password (or a tampered build): nothing was shown
      throw e;
    });
  }

  function derive(password) {
    return subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]).then(function (base) {
      return subtle.deriveBits({ name: "PBKDF2", salt: fromB64(L.salt), iterations: L.iterations, hash: "SHA-256" }, base, 256);
    });
  }

  // The password was right; any failure from here on is a loading problem, not a wrong password.
  function run(bodyHtml) {
    return start(bodyHtml).catch(function (e) { console.error("sitegate:", e); });
  }

  var gate = document.getElementById("sitegate");
  var form = document.getElementById("sitegate-form");
  if (!subtle) {
    gate.classList.remove("checking");
    form.innerHTML = "<h1>" + document.title + "</h1><p>This browser cannot decrypt the site (Web Crypto is unavailable). Open it over https, or in a current version of Chrome, Edge, Firefox or Safari.</p>";
    return;
  }
  var input = document.getElementById("sitegate-pw"), err = document.getElementById("sitegate-error");
  var submit = document.getElementById("sitegate-submit"), showBtn = document.getElementById("sitegate-show");
  function showForm() { gate.classList.remove("checking"); input.focus(); }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    derive(input.value).then(unlock).then(run, function () {
      submit.disabled = false;
      submit.textContent = "Unlock";
      err.hidden = false;
      input.select();
    });
  });
  showBtn.addEventListener("click", function () {
    var show = input.type === "password";
    input.type = show ? "text" : "password";
    showBtn.textContent = show ? "Hide" : "Show";
    showBtn.setAttribute("aria-pressed", show ? "true" : "false");
    input.focus();
  });

  var saved = stored();
  if (saved) unlock(fromB64(saved)).then(run, function () { store(null); showForm(); });
  else showForm();
})();
