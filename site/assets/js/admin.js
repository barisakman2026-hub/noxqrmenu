/* NOX Lounge — Yönetim Paneli (GitHub API entegrasyonu) */
(function () {
  "use strict";

  var CONFIG_URL = "data/config.json";
  var MENU_URL = "data/menu.json";
  var GITHUB_API = "https://api.github.com";

  /* Sitede yayında olan ve deploy'a dahil edilecek tüm dosyalar. */
  var SITE_FILES = [
    "index.html",
    "yonetim-kzJNFLxj5Zw.html",
    "yonetim-qr.html",
    "assets/css/admin.css",
    "assets/css/style.css",
    "assets/img/favicon.svg",
    "assets/img/logo.png",
    "assets/js/admin.js",
    "assets/js/menu.js",
    "assets/js/qrcode.js",
    "assets/js/jszip.min.js",
    "assets/video/intro.mp4",
    "data/config.json",
    "data/lang.json",
    "data/menu.json",
    "data/i18n/lang_ar.json",
    "data/i18n/lang_de.json",
    "data/i18n/lang_en.json",
    "data/i18n/lang_es.json",
    "data/i18n/lang_ja.json",
    "data/i18n/lang_ru.json",
    "data/i18n/lang_zh.json",
    "qr/admin.png",
    "qr/menu.png"
  ];

  var cfg = null;       // config.json içeriği
  var menu = null;      // menu.json içeriği (düzenlenen kopya)
  var dirty = false;

  /* ---------- yardımcılar ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function sha256hex(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.from(new Uint8Array(buf))
        .map(function (b) { return b.toString(16).padStart(2, "0"); })
        .join("");
    });
  }

  /* ---------- token şifreleme (Web Crypto, PBKDF2 + AES-GCM) ---------- */
  var sessionPw = null;      // giriş şifresi (yalnız bellekte, oturum süresince)
  var TOKEN_ENC_KEY = "nox_github_token";

  function b64enc(buf) {
    var bin = "";
    var u = new Uint8Array(buf);
    for (var i = 0; i < u.length; i++) bin += String.fromCharCode(u[i]);
    return btoa(bin);
  }
  function b64dec(s) {
    var bin = atob(s);
    var u = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  }

  function deriveKey(pw, salt) {
    return crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: 150000, hash: "SHA-256" },
          base,
          { name: "AES-GCM", length: 256 },
          false,
          ["encrypt", "decrypt"]
        );
      });
  }

  /* Token'ı panel şifresiyle şifreleyip localStorage'a yazar (asla düz metin değil). */
  function storeTokenEncrypted(token, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return deriveKey(pw, salt).then(function (key) {
      return crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        key,
        new TextEncoder().encode(token)
      );
    }).then(function (ct) {
      localStorage.setItem(TOKEN_ENC_KEY, "v1:" + b64enc(salt) + ":" + b64enc(iv) + ":" + b64enc(ct));
      $("gh-token").placeholder = "🔒 token şifreli kayıtlı (yeni gireceksen üzerine yaz)";
    });
  }

  /* Şifreli token'ı çözer. Yanlış şifrede null döner. */
  function decryptToken(pw) {
    var raw = localStorage.getItem(TOKEN_ENC_KEY);
    if (!raw) return Promise.resolve(null);
    var parts = raw.split(":");
    if (parts.length !== 4) return Promise.resolve(null);
    var salt = b64dec(parts[1]), iv = b64dec(parts[2]), ct = b64dec(parts[3]);
    return deriveKey(pw, salt).then(function (key) {
      return crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, ct);
    }).then(function (pt) {
      return new TextDecoder().decode(pt);
    }).catch(function () {
      return null;
    });
  }

  /* Kullanılacak token: alana yeni yazıldıysa o (ve şifreli kaydedilir),
     değilse şifreli depodan çözülür. Şifre gerekirse sorar. */
  function resolveToken() {
    var fieldVal = $("gh-token").value.trim();
    if (fieldVal) {
      var p = sessionPw || window.prompt("Token şifreli saklanacak — korumak için yönetim şifrenizi girin:");
      if (!p) return Promise.reject(new Error("Token kaydedilmedi: şifre gerekli."));
      return storeTokenEncrypted(fieldVal, p).then(function () {
        sessionPw = p;
        $("gh-token").value = "";
        return fieldVal;
      });
    }
    if (sessionPw) return decryptToken(sessionPw);
    var asked = window.prompt("Kayıtlı token şifreli — çözmek için yönetim şifrenizi girin:");
    if (!asked) return Promise.resolve(null);
    sessionPw = asked;
    return decryptToken(asked);
  }

  function setMsg(id, text, ok) {
    var el = $(id);
    el.textContent = text || "";
    el.className = "msg" + (ok ? " ok" : text ? " err" : "");
  }

  /* ---------- giriş ---------- */
  function initAuth() {
    $("auth-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = $("pw-input").value;
      if (!pw) return setMsg("auth-msg", "Şifre girin.", false);
      setMsg("auth-msg", "Kontrol ediliyor…", false);
      sha256hex(pw).then(function (hash) {
        if (hash === cfg.adminPasswordHash) {
          sessionPw = pw;
          sessionStorage.setItem("nox_auth", "1");
          showPanel();
        } else {
          setMsg("auth-msg", "Hatalı şifre.", false);
        }
      });
    });
  }

  /* ---------- panel ---------- */
  function showPanel() {
    $("auth-screen").style.display = "none";
    $("panel").style.display = "block";
    $("savebar").style.display = "flex";
    render();
  }

  function render() {
    $("updated-label").textContent = menu.meta.updated || "";
    renderSections();
    var settings = loadSettings();
    if (settings.owner) $("gh-owner").value = settings.owner;
    if (settings.repo) $("gh-repo").value = settings.repo;
    $("gh-token").value = "";
    $("gh-token").placeholder = localStorage.getItem(TOKEN_ENC_KEY)
      ? "🔒 token şifreli kayıtlı (yeni gireceksen üzerine yaz)"
      : "ghp_...";
  }

  function newSection() {
    var g = (menu.groups && menu.groups.length) ? menu.groups[0].id : "alkollu";
    return { id: "k" + Date.now(), group: g, title: "Yeni Bölüm", subtitle: "", items: [] };
  }
  function newItem() {
    return { name: "Yeni Ürün", price: 0, note: "" };
  }

  function groupOptions(si) {
    var sec = menu.sections[si];
    var groups = (menu.groups && menu.groups.length)
      ? menu.groups
      : [{ id: "alkollu", title: "Alkollü İçecekler" }, { id: "alkolsuz", title: "Alkolsüz İçecekler" }, { id: "aperatif", title: "Aperatifler" }, { id: "ana-yemek", title: "Ana Yemekler" }, { id: "tatli", title: "Tatlılar" }];
    return groups.map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (sec.group === g.id ? " selected" : "") + ">" + esc(g.title) + "</option>";
    }).join("");
  }

  /* ---------- bölüm render ---------- */
  function renderSections() {
    var wrap = $("sections-wrap");
    wrap.innerHTML = "";
    menu.sections.forEach(function (sec, si) {
      var card = document.createElement("div");
      card.className = "sec-card";
      card.innerHTML =
        '<div class="sec-head" data-si="' + si + '">' +
        '<span class="chev">▼</span>' +
        '<span class="t">' + esc(sec.title || "Bölüm") + '</span>' +
        '<span class="count">' + sec.items.length + ' ürün</span>' +
        '<button class="icon-btn rm-sec" data-si="' + si + '" title="Bölümü sil">✕</button>' +
        "</div>" +
        '<div class="sec-body">' +
        '<div class="sec-meta">' +
        '<input class="sec-title" data-si="' + si + '" value="' + esc(sec.title) + '" placeholder="Bölüm adı (örn. Bira)">' +
        '<select class="sec-group" data-si="' + si + '" title="Ana grup" aria-label="Ana grup"></select>' +
        "</div>" +
        '<div class="sec-meta">' +
        '<input class="sec-subtitle" data-si="' + si + '" value="' + esc(sec.subtitle || "") + '" placeholder="Alt not (opsiyonel)">' +
        "</div>" +
        '<div class="items-wrap"></div>' +
        '<button class="add-item" data-si="' + si + '">+ Ürün Ekle</button>' +
        "</div>";

      card.querySelector(".sec-group").innerHTML = groupOptions(si);
      var itemsWrap = card.querySelector(".items-wrap");
      sec.items.forEach(function (item, ii) {
        itemsWrap.appendChild(itemEditor(sec, item, si, ii));
      });
      wrap.appendChild(card);
    });

    wrap.addEventListener("input", onInput);
    wrap.addEventListener("change", onInput);
    wrap.addEventListener("click", onClick);
  }

  function itemEditor(sec, item, si, ii) {
    var box = document.createElement("div");
    box.className = "item-edit";
    box.dataset.si = si;
    box.dataset.ii = ii;

    var name = document.createElement("input");
    name.className = "name-input";
    name.value = item.name || "";
    name.placeholder = "Ürün adı";

    var price = document.createElement("input");
    price.className = "price-input";
    price.type = "number";
    price.min = "0";
    price.step = "0.5";
    price.value = item.price != null ? item.price : "";

    var unit = document.createElement("input");
    unit.className = "unit-input";
    unit.value = item.note || "";
    unit.placeholder = "Birim (örn. 50cl)";

    var rm = document.createElement("button");
    rm.className = "rm";
    rm.title = "Ürünü sil";
    rm.textContent = "✕";

    box.appendChild(name);
    box.appendChild(price);
    box.appendChild(unit);
    box.appendChild(rm);

    if (item.options && item.options.length) {
      var optWrap = document.createElement("div");
      optWrap.className = "opt-edit";
      optWrap.dataset.si = si;
      optWrap.dataset.ii = ii;

      var optRows = document.createElement("div");
      optRows.className = "opt-rows";
      item.options.forEach(function (o, oi) {
        optRows.appendChild(optionRow(si, ii, oi, o));
      });
      optWrap.appendChild(optRows);

      var addOpt = document.createElement("button");
      addOpt.className = "add-opt";
      addOpt.dataset.si = si;
      addOpt.dataset.ii = ii;
      addOpt.textContent = "+ Fiyat seçeneği ekle (bardak/şişe)";
      optWrap.appendChild(addOpt);
      box.appendChild(optWrap);
    }

    return box;
  }

  function optionRow(si, ii, oi, o) {
    var row = document.createElement("div");
    row.className = "opt-row";
    row.dataset.si = si;
    row.dataset.ii = ii;
    row.dataset.oi = oi;

    var label = document.createElement("input");
    label.className = "opt-label";
    label.value = o.label || "";
    label.placeholder = "Etiket (örn. Bardak)";

    var price = document.createElement("input");
    price.className = "opt-price";
    price.type = "number";
    price.min = "0";
    price.step = "0.5";
    price.value = o.price != null ? o.price : "";

    var rm = document.createElement("button");
    rm.className = "rm rm-opt";
    rm.textContent = "✕";
    rm.title = "Seçeneği sil";

    row.appendChild(label);
    row.appendChild(price);
    row.appendChild(rm);
    return row;
  }

  /* ---------- olaylar ---------- */
  function onInput(e) {
    dirty = true;
    var t = e.target;
    var si;

    if (t.classList.contains("sec-group")) {
      si = parseInt(t.dataset.si, 10);
      var secG = menu.sections[si];
      if (!secG) return;
      secG.group = t.value;
      return;
    }

    if (t.classList.contains("sec-title") || t.classList.contains("sec-subtitle")) {
      si = parseInt(t.dataset.si, 10);
      var sec0 = menu.sections[si];
      if (!sec0) return;
      if (t.classList.contains("sec-title")) {
        sec0.title = t.value;
        var head = t.closest(".sec-card").querySelector(".sec-head .t");
        if (head) head.textContent = t.value || "Bölüm";
      } else {
        sec0.subtitle = t.value;
      }
      return;
    }

    var box = t.closest(".item-edit");
    if (!box) return;
    si = parseInt(box.dataset.si, 10);
    var sec = menu.sections[si];
    if (!sec) return;

    if (t.classList.contains("name-input")) {
      sec.items[parseInt(box.dataset.ii, 10)].name = t.value;
    } else if (t.classList.contains("price-input")) {
      sec.items[parseInt(box.dataset.ii, 10)].price = t.value === "" ? null : parseFloat(t.value);
    } else if (t.classList.contains("unit-input")) {
      sec.items[parseInt(box.dataset.ii, 10)].note = t.value;
    } else if (t.classList.contains("opt-label") || t.classList.contains("opt-price")) {
      var row = t.closest(".opt-row");
      var item = sec.items[parseInt(row.dataset.ii, 10)];
      var opt = item.options[parseInt(row.dataset.oi, 10)];
      if (t.classList.contains("opt-label")) opt.label = t.value;
      else opt.price = t.value === "" ? null : parseFloat(t.value);
    }
  }

  function onClick(e) {
    var t = e.target;

    if (t.classList.contains("sec-head") || t.closest(".sec-head")) {
      if (t.classList.contains("rm-sec")) return;
      t.closest(".sec-card").classList.toggle("closed");
      return;
    }

    if (t.classList.contains("rm-sec")) {
      var si0 = parseInt(t.dataset.si, 10);
      if (confirm("Bu bölüm silinsin mi?")) {
        menu.sections.splice(si0, 1);
        dirty = true;
        renderSections();
      }
      return;
    }

    if (t.classList.contains("add-item")) {
      var si1 = parseInt(t.dataset.si, 10);
      menu.sections[si1].items.push(newItem());
      dirty = true;
      var wrap = t.closest(".sec-card").querySelector(".items-wrap");
      wrap.appendChild(itemEditor(menu.sections[si1], menu.sections[si1].items[menu.sections[si1].items.length - 1], si1, menu.sections[si1].items.length - 1));
      return;
    }

    if (t.classList.contains("rm")) {
      var box = t.closest(".item-edit");
      var si2 = parseInt(box.dataset.si, 10);
      var ii2 = parseInt(box.dataset.ii, 10);
      if (t.classList.contains("rm-opt")) {
        var oi = parseInt(t.closest(".opt-row").dataset.oi, 10);
        var opts = menu.sections[si2].items[ii2].options;
        opts.splice(oi, 1);
        if (!opts.length) delete menu.sections[si2].items[ii2].options;
      } else {
        menu.sections[si2].items.splice(ii2, 1);
      }
      dirty = true;
      renderSections();
      return;
    }

    if (t.classList.contains("add-opt")) {
      var si3 = parseInt(t.dataset.si, 10);
      var ii3 = parseInt(t.dataset.ii, 10);
      var it = menu.sections[si3].items[ii3];
      if (!it.options) it.options = [];
      it.options.push({ label: "", price: null });
      dirty = true;
      var rows = t.closest(".opt-edit").querySelector(".opt-rows");
      rows.appendChild(optionRow(si3, ii3, it.options.length - 1, it.options[it.options.length - 1]));
      return;
    }
  }

  /* ---------- kaydetme ---------- */
  function buildJSON() {
    menu.meta.updated = new Date().toISOString().slice(0, 10);
    var copy = JSON.parse(JSON.stringify(menu));
    copy.sections.forEach(function (s) {
      s.items.forEach(function (it) {
        if (it.options) it.options.forEach(function (o) {
          if (o.price == null) delete o.price;
          if (!o.label) delete o.label;
        });
        if (it.price == null && !it.options) it.price = 0;
        if (it.note === "") delete it.note;
      });
    });
    return copy;
  }

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem("nox_github") || "{}");
      if (s.token) {
        var legacy = s.token;
        delete s.token;
        localStorage.setItem("nox_github", JSON.stringify(s));
        if (sessionPw) {
          storeTokenEncrypted(legacy, sessionPw).catch(function () {});
        }
      }
      return s;
    } catch (e) { return {}; }
  }
  function saveSettings(s) {
    var cur = loadSettings();
    var next = {
      owner: s.owner != null ? s.owner : cur.owner,
      repo: s.repo != null ? s.repo : cur.repo
    };
    localStorage.setItem("nox_github", JSON.stringify(next));
  }

  /* ---------- GitHub API ---------- */
  function githubHeaders(token) {
    return {
      Authorization: "token " + token,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json"
    };
  }

  function githubGetFile(token, owner, repo, path) {
    return fetch(GITHUB_API + "/repos/" + owner + "/" + repo + "/contents/" + path, {
      headers: { Authorization: "token " + token, Accept: "application/vnd.github.v3+json" }
    }).then(function (r) {
      if (r.status === 404) return null; // dosya yoksa yeni oluşturulacak
      if (!r.ok) throw new Error("GitHub dosya okuma hatası (HTTP " + r.status + ")");
      return r.json();
    });
  }

  function githubPutFile(token, owner, repo, path, content, message, sha) {
    var body = {
      message: message,
      content: btoa(unescape(encodeURIComponent(content))),
      branch: "main"
    };
    if (sha) body.sha = sha;

    return fetch(GITHUB_API + "/repos/" + owner + "/" + repo + "/contents/" + path, {
      method: "PUT",
      headers: githubHeaders(token),
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (err) {
          throw new Error("GitHub yazma hatası (" + path + "): " + (err.message || "HTTP " + r.status));
        });
      }
      return r.json();
    });
  }

  function githubPush(token, owner, repo, files) {
    /* files: { path: content } — sırayla her dosyayı GitHub'a yazar */
    var paths = Object.keys(files);
    var chain = Promise.resolve();

    paths.forEach(function (path) {
      chain = chain.then(function () {
        return githubGetFile(token, owner, repo, path).then(function (existing) {
          var sha = existing ? existing.sha : null;
          return githubPutFile(token, owner, repo, path, files[path], "NOX QR Menu guncelleme: " + path, sha);
        });
      });
    });

    return chain;
  }

  function validateGitHub(owner, repo, token) {
    return fetch(GITHUB_API + "/repos/" + owner + "/" + repo, {
      headers: { Authorization: "token " + token, Accept: "application/vnd.github.v3+json" }
    }).then(function (r) {
      if (r.status === 404) throw new Error("Repo bulunamadı: " + owner + "/" + repo);
      if (!r.ok) throw new Error("GitHub erişim hatası (HTTP " + r.status + ")");
      return r.json();
    }).then(function (data) {
      return { name: data.full_name, url: data.html_url, private: data.private };
    });
  }

  /* ---------- kaydet ---------- */
  function onSave() {
    var content = JSON.stringify(buildJSON(), null, 2) + "\n";
    var owner = $("gh-owner").value.trim();
    var repo = $("gh-repo").value.trim();
    if (!owner || !repo) {
      setMsg("save-msg", "Kaydedilemedi: ⚙ GitHub bölümünde owner/repo gir.", false);
      return;
    }
    setMsg("save-msg", "Kaydediliyor (GitHub'a push yapılıyor)…", false);
    resolveToken().then(function (token) {
      if (!token) {
        setMsg("save-msg", "Kaydedilemedi: ⚙ bölümüne GitHub Token gir (şifreli saklanır).", false);
        return;
      }
      saveSettings({ owner: owner, repo: repo });
      var files = {};
      files["data/menu.json"] = content;
      return githubPush(token, owner, repo, files).then(function () {
        dirty = false;
        setMsg("save-msg", "Kayıt Başarılı! GitHub'a push edildi — Netlify 1-2 dk içinde otomatik deploy edecek.", true);
      });
    }).catch(function (err) {
      setMsg("save-msg", "Kayıt başarısız: " + err.message, false);
    });
  }

  /* ---------- şifre değiştirme ---------- */
  function onPasswordChange() {
    var cur = $("pw-current").value;
    var n1 = $("pw-new").value;
    var n2 = $("pw-new2").value;
    if (!cur || !n1 || !n2) return setMsg("pw-msg", "Tüm alanları doldurun.", false);

    sha256hex(cur).then(function (hash) {
      if (hash !== cfg.adminPasswordHash) return setMsg("pw-msg", "Mevcut şifre hatalı.", false);
      if (n1.length < 6) return setMsg("pw-msg", "Yeni şifre en az 6 karakter olmalı.", false);
      if (n1 !== n2) return setMsg("pw-msg", "Yeni şifreler eşleşmiyor.", false);
      if (n1 === cur) return setMsg("pw-msg", "Yeni şifre mevcut şifreyle aynı olamaz.", false);

      sha256hex(n1).then(function (newHash) {
        var updated = JSON.parse(JSON.stringify(cfg));
        updated.adminPasswordHash = newHash;
        var configContent = JSON.stringify(updated, null, 2) + "\n";
        var menuContent = JSON.stringify(buildJSON(), null, 2) + "\n";

        var apply = function () {
          cfg.adminPasswordHash = newHash;
          sessionPw = n1;
          $("pw-current").value = $("pw-new").value = $("pw-new2").value = "";
        };

        var owner = $("gh-owner").value.trim();
        var repo = $("gh-repo").value.trim();
        if (!owner || !repo) {
          setMsg("pw-msg", "Şifre kaydedilemedi: ⚙ GitHub bölümünde owner/repo gir.", false);
          return;
        }
        setMsg("pw-msg", "Şifre kaydediliyor (GitHub'a push yapılıyor)…", false);
        resolveToken().then(function (token) {
          if (!token) {
            setMsg("pw-msg", "Şifre kaydedilemedi: ⚙ bölümüne GitHub Token gir (şifreli saklanır).", false);
            return;
          }
          var files = {};
          files["data/config.json"] = configContent;
          files["data/menu.json"] = menuContent;
          return githubPush(token, owner, repo, files).then(function () {
            apply();
            return decryptToken(cur).then(function (oldToken) {
              if (oldToken) return storeTokenEncrypted(oldToken, n1);
              return null;
            });
          }).then(function () {
            setMsg("pw-msg", "Kayıt Başarılı! Şifre değişti ve GitHub'a push edildi — Netlify 1-2 dk içinde deploy edecek.", true);
          });
        }).catch(function (err) {
          setMsg("pw-msg", "Kayıt başarısız: " + err.message, false);
        });
      });
    });
  }

  function initPasswordChange() {
    $("pw-save-github").addEventListener("click", onPasswordChange);
  }

  /* ---------- GitHub doğrulama ---------- */
  function validateGitHubRepo() {
    resolveToken().then(function (token) {
      if (!token) return setMsg("gh-msg", "Token yok: ⚙ bölümüne GitHub Token gir (şifreli saklanır).", false);
      var owner = $("gh-owner").value.trim();
      var repo = $("gh-repo").value.trim();
      if (!owner || !repo) return setMsg("gh-msg", "Owner ve Repo alanlarını doldur.", false);
      setMsg("gh-msg", "Repo doğrulanıyor…", false);
      return validateGitHub(owner, repo, token).then(function (info) {
        saveSettings({ owner: owner, repo: repo });
        setMsg("gh-msg", "Repo bulundu: " + info.name + (info.private ? " (private)" : " (public)") + " — " + info.url, true);
      });
    }).catch(function (err) {
      setMsg("gh-msg", "Hata: " + err.message, false);
    });
  }

  /* ---------- kurulum ---------- */
  function initPanel() {
    $("save-github").addEventListener("click", onSave);
    $("gh-validate").addEventListener("click", validateGitHubRepo);
    $("logout").addEventListener("click", function () {
      sessionStorage.removeItem("nox_auth");
      location.reload();
    });
    initPasswordChange();
    $("add-section").addEventListener("click", function () {
      menu.sections.push(newSection());
      dirty = true;
      renderSections();
    });
    window.addEventListener("beforeunload", function (e) {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    });
  }

  function fetchJSON(url, fallback) {
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }).catch(function () {
      /* fetch çalışmazsa (örn. file:// ile açıldıysa) gömülü yedeği kullan */
      if (fallback) return fallback;
      throw new Error("Veri yok: " + url);
    });
  }

  function boot() {
    initAuth();
    initPanel();

    Promise.all([
      fetchJSON(CONFIG_URL, window.CONFIG_FALLBACK),
      fetchJSON(MENU_URL, window.MENU_FALLBACK)
    ]).then(function (res) {
      cfg = res[0];
      menu = res[1];
      if (sessionStorage.getItem("nox_auth") === "1") showPanel();
    }).catch(function () {
      setMsg("auth-msg", "Menü verisi yüklenemedi. Sayfayı yenileyin.", false);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
