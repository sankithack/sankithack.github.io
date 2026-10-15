/* Unlocks a page built by tools/protect.js: derives the AES-256-GCM key from the password (PBKDF2-SHA256), decrypts
 * the page body and its scripts, then runs them. The derived key (never the password) is kept in sessionStorage for
 * this tab, scoped to this build's salt, so moving between pages does not ask again. */
(function () {
  "use strict";
  var L = window.DRV_LOCK, E = window.DRV_ENC || {};
  var gate = document.getElementById("gate"), form = document.getElementById("gate-form");
  var input = document.getElementById("gate-pw"), err = document.getElementById("gate-error");
  var submit = document.getElementById("gate-submit"), showBtn = document.getElementById("gate-show");
  var KEY = "drv-key-" + L.salt;

  function fromB64(s) { var b = atob(s), u = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
  function toB64(buf) { var u = new Uint8Array(buf), s = ""; for (var i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }
  function store(v) { try { if (v === null) sessionStorage.removeItem(KEY); else sessionStorage.setItem(KEY, v); } catch (e) { /* storage blocked: ask on each page */ } }
  function stored() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function showForm() { gate.classList.remove("checking"); input.focus(); }
  // Motion follows the site's switches: the OS reduce-motion setting and the Motion toggle (stored per browser).
  function motionOff() {
    var off = false;
    try { off = localStorage.getItem("drv-motion") === "off"; } catch (e) { /* ignore */ }
    return off || !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, motionOff() ? 0 : ms); }); }

  if (!window.crypto || !window.crypto.subtle) {
    gate.classList.remove("checking");
    form.innerHTML = '<h1>AMDVLK Driver Atlas</h1><p>This browser cannot decrypt the site (Web Crypto is unavailable). Open it in a current version of Chrome, Edge, Firefox or Safari.</p>';
    return;
  }
  var subtle = window.crypto.subtle;

  function derive(password) {
    return subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]).then(function (base) {
      return subtle.deriveBits({ name: "PBKDF2", salt: fromB64(L.salt), iterations: L.iterations, hash: "SHA-256" }, base, 256);
    });
  }
  function decryptWith(key, b64text) {
    var d = fromB64(b64text);
    return subtle.decrypt({ name: "AES-GCM", iv: d.slice(0, 12) }, key, d.slice(12)).then(function (pt) {
      return new TextDecoder().decode(pt);
    });
  }
  // Decrypt everything first; only touch the page once all of it succeeded.
  function unlock(raw, animate) {
    return subtle.importKey("raw", raw, "AES-GCM", false, ["decrypt"]).then(function (key) {
      return decryptWith(key, L.check).then(function (check) {
        if (check !== L.checkText) throw new Error("wrong key");
        var parts = [decryptWith(key, document.getElementById("page-body").textContent)];
        L.order.forEach(function (name) { parts.push(decryptWith(key, E[name])); });
        return Promise.all(parts);
      });
    }).then(function (texts) {
      store(toB64(raw));
      if (!animate) return texts;
      // Success: the pad reaches the end of the trace, then the card lifts away.
      gate.classList.remove("working");
      gate.classList.add("done");
      return wait(260).then(function () { gate.classList.add("leaving"); return wait(300); }).then(function () { return texts; });
    }).then(function (texts) {
      gate.remove();
      document.getElementById("page-body").remove();
      document.body.insertAdjacentHTML("afterbegin", texts[0]);
      texts.slice(1).forEach(function (code) {
        var s = document.createElement("script");
        s.textContent = code;
        document.body.appendChild(s);
      });
      if (animate && !motionOff()) {
        var layout = document.querySelector(".layout");
        if (layout) {
          layout.classList.add("unlocked-in");
          layout.addEventListener("animationend", function () { layout.classList.remove("unlocked-in"); }, { once: true });
        }
      }
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    err.hidden = true;
    submit.disabled = true;
    submit.textContent = "Unlocking…";
    gate.classList.remove("error");
    gate.classList.add("working");
    derive(input.value).then(function (raw) { return unlock(raw, true); }).catch(function () {
      submit.disabled = false;
      submit.textContent = "Unlock";
      gate.classList.remove("working");
      void gate.offsetWidth;            // restart the shake if it is already applied
      gate.classList.add("error");
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
  if (saved) {
    unlock(fromB64(saved), false).catch(function () { store(null); showForm(); });
  } else {
    showForm();
  }
})();
