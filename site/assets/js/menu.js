/* NOX Lounge — menü render motoru */
(function () {
  "use strict";

  /* data.groups yoksa (eski veri) kullanılacak varsayılan ana gruplar */
  var DEFAULT_GROUPS = [
    { id: "alkollu", title: "Alkollü İçecekler" },
    { id: "alkolsuz", title: "Alkolsüz İçecekler" },
    { id: "aperatif", title: "Aperatifler" },
    { id: "ana-yemek", title: "Ana Yemekler" },
    { id: "tatli", title: "Tatlılar" }
  ];

  var state = { data: null, group: null, active: null, lang: "tr", dict: null };

  var el = {
    groupNav: document.getElementById("groupnav"),
    nav: document.getElementById("catnav-inner"),
    sections: document.getElementById("sections"),
    error: document.getElementById("error"),
  };

  /* ---------- çoklu dil (i18n) ---------- */

  var LANGS = ["tr", "en", "ru", "ar", "de", "zh", "ja", "es"];
  var LANG_NAMES = {
    tr: "Türkçe", en: "English", ru: "Русский", ar: "العربية",
    de: "Deutsch", zh: "中文", ja: "日本語", es: "Español"
  };

  /* data/lang.json yüklenmiş çeviri paketi — anında dil değişimi için */
  var langData = null;

  /* Kayıtlı tercih → tarayıcı dili → Türkçe */
  function detectLang() {
    try {
      var saved = localStorage.getItem("nox_lang");
      if (saved && LANGS.indexOf(saved) !== -1) return saved;
    } catch (e) { /* depolama kapalıysa tarayıcı diline geç */ }
    var code = (navigator.language || "").toLowerCase().slice(0, 2);
    if (LANGS.indexOf(code) !== -1) return code;
    return "tr";
  }

  /* Düz nesne birleştirme: nesneler anahtar anahtar derinlemesine birleşir,
     dizgiler/değerler üzerine yazılır (over kazanır). */
  function deepMerge(base, over) {
    var isPlain = function (v) {
      return v != null && typeof v === "object" && !Array.isArray(v);
    };
    if (!isPlain(base) || !isPlain(over)) return over === undefined ? base : over;
    var out = {};
    Object.keys(base).forEach(function (k) {
      out[k] = isPlain(over[k]) ? deepMerge(base[k], over[k]) : (over[k] !== undefined ? over[k] : base[k]);
    });
    Object.keys(over).forEach(function (k) {
      if (!Object.prototype.hasOwnProperty.call(out, k)) out[k] = over[k];
    });
    return out;
  }

  /* Noktalı yol ile sözlük araması; eksik ya da değer nesneyse fallback döner */
  function t(path, fb) {
    if (!state.dict) return fb;
    var cur = state.dict;
    var segs = path.split(".");
    for (var i = 0; i < segs.length; i++) {
      if (cur == null || typeof cur !== "object") return fb;
      cur = cur[segs[i]];
      if (cur === undefined || cur === null) return fb;
    }
    if (typeof cur === "object") return fb;
    return cur;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtPrice(n) {
    var v = Number(n);
    if (Number.isNaN(v)) return String(n);
    return v.toLocaleString("tr-TR") + " ₺";
  }

  /* ---------- döviz karşılıkları (TCMB satış kuru) ---------- */

  var FX_CACHE_KEY = "nox_fx_v1";
  var fx = { ok: false, usd: null, eur: null, date: null };

  function parseNum(v) {
    if (v == null) return NaN;
    if (typeof v === "number") return v;
    return parseFloat(String(v).replace(",", "."));
  }

  function fmtFx(v) {
    return v.toLocaleString("tr-TR", { maximumFractionDigits: 2 });
  }

  /* Her fiyatın altında $ ve € karşılığı */
  function fxLine(tl) {
    if (!fx.ok || fx.usd == null || fx.eur == null) return "";
    var p = Number(tl);
    if (!Number.isFinite(p)) return "";
    return '<small class="fx">$' + fmtFx(p / fx.usd) + " · €" + fmtFx(p / fx.eur) + "</small>";
  }

  function readFxCache() {
    try { return JSON.parse(localStorage.getItem(FX_CACHE_KEY) || "null"); }
    catch (e) { return null; }
  }

  function writeFxCache(u, e, d) {
    try { localStorage.setItem(FX_CACHE_KEY, JSON.stringify({ u: u, e: e, d: d })); }
    catch (err) { /* depolama kapalıysa sessizce geç */ }
  }

  /* Döviz notu satırı (çevrilebilir) */
  function setFxNote() {
    var note = document.getElementById("fx-note");
    if (note) {
      note.textContent = t("ui.fxNote", "Döviz karşılıkları TCMB satış kuru ile hesaplanır") + " · " + (fx.date || "");
    }
  }

  function applyFx(u, e, d) {
    fx.ok = true;
    fx.usd = u;
    fx.eur = e;
    fx.date = d;
    setFxNote();
    renderSections();
  }

  function fetchJson(url, ms) {
    return Promise.race([
      fetch(url).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      }),
      new Promise(function (_, reject) {
        setTimeout(function () { reject(new Error("timeout")); }, ms);
      })
    ]);
  }

  /* TCMB verisi sunan üç kaynak — sırayla denenir */
  function fxSources() {
    var today = new Date().toISOString().slice(0, 10);
    return [
      function () {
        return fetchJson("https://raw.githubusercontent.com/kessinc/darphane/main/kurlar.json", 8000)
          .then(function (j) {
            var t = j.resmi_tcmb_kurlari;
            if (!t) return null;
            var u = parseNum(t.USD && t.USD.satis);
            var e = parseNum(t.EUR && t.EUR.satis);
            if (!isFinite(u) || !isFinite(e)) return null;
            return { u: u, e: e, d: String(j.son_guncelleme || today).slice(0, 10) };
          });
      },
      function () {
        return fetchJson("https://api.genelpara.com/json/?list=doviz&sembol=USD,EUR", 8000)
          .then(function (j) {
            if (!j.data) return null;
            var u = parseNum(j.data.USD && j.data.USD.satis);
            var e = parseNum(j.data.EUR && j.data.EUR.satis);
            if (!isFinite(u) || !isFinite(e)) return null;
            return { u: u, e: e, d: today };
          });
      },
      function () {
        return fetchJson("https://hasanadiguzel.com.tr/api/kurgetir", 8000)
          .then(function (j) {
            var arr = j.TCMB_AnlikKurBilgileri;
            if (!arr || !arr.length) return null;
            var usd = null, eur = null;
            arr.forEach(function (c) {
              var n = c.CurrencyName || "";
              var v = parseNum(c.ForexSelling);
              if (!isFinite(v)) return;
              if (n === "US DOLLAR") usd = v;
              if (n === "EURO") eur = v;
            });
            if (usd == null || eur == null) return null;
            return { u: usd, e: eur, d: today };
          });
      }
    ];
  }

  function loadFx() {
    var cached = readFxCache();
    var today = new Date().toISOString().slice(0, 10);
    if (cached && cached.d === today && isFinite(cached.u) && isFinite(cached.e)) {
      applyFx(cached.u, cached.e, cached.d);
      return;
    }
    var sources = fxSources();
    var i = 0;
    function next() {
      if (i >= sources.length) {
        if (cached && isFinite(cached.u) && isFinite(cached.e)) {
          applyFx(cached.u, cached.e, cached.d);
        }
        return;
      }
      sources[i++]().then(function (r) {
        if (!r) return next();
        writeFxCache(r.u, r.e, r.d);
        applyFx(r.u, r.e, r.d);
      }, next);
    }
    next();
  }

  function priceMarkup(item) {
    if (item.options && item.options.length) {
      var html = "";
      item.options.forEach(function (o) {
        html +=
          '<div class="price-block">' +
          '<span class="price">' + fmtPrice(o.price) + "</span>" +
          (o.label ? "<small>" + escapeHtml(t("notes." + o.label, o.label)) + "</small>" : "") +
          fxLine(o.price) +
          "</div>";
      });
      return '<div class="item-prices">' + html + "</div>";
    }
    var note = item.note ? "<small>" + escapeHtml(t("notes." + item.note, item.note)) + "</small>" : "";
    return '<div class="item-prices"><div class="price-block"><span class="price">' +
      fmtPrice(item.price) + "</span>" + note + fxLine(item.price) + "</div></div>";
  }

  function itemMarkup(item, secId) {
    var name = t("sections." + secId + ".items." + item.name + ".name", item.name);
    var desc = t("sections." + secId + ".items." + item.name + ".desc", item.desc || "");
    return (
      '<div class="menu-item" role="listitem">' +
      '<div class="item-row">' +
      '<span class="item-name">' + escapeHtml(name) + "</span>" +
      '<span class="item-dots"></span>' +
      priceMarkup(item) +
      "</div>" +
      (desc ? '<div class="item-note">' + escapeHtml(desc) + "</div>" : "") +
      "</div>"
    );
  }

  /* ---------- ana gruplar ---------- */

  function groupDefs() {
    if (state.data && state.data.groups && state.data.groups.length) {
      return state.data.groups;
    }
    return DEFAULT_GROUPS;
  }

  /* Bölümün grubu; atanmamışsa ilk gruba düşer */
  function groupOf(s) {
    var defs = groupDefs();
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].id === s.group) return defs[i].id;
    }
    return defs.length ? defs[0].id : null;
  }

  function sectionsOfGroup() {
    return state.data.sections.filter(function (s) {
      return groupOf(s) === state.group;
    });
  }

  function renderGroupNav() {
    if (!el.groupNav) return;
    var html = "";
    groupDefs().forEach(function (g) {
      html +=
        '<button type="button" data-group="' + escapeHtml(g.id) + '" ' +
        'class="group-tab' + (g.id === state.group ? " active" : "") + '">' +
        escapeHtml(t("groups." + g.id, g.title)) + "</button>";
    });
    el.groupNav.innerHTML = html;
  }

  function bindGroupNav() {
    if (!el.groupNav) return;
    el.groupNav.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      activateGroup(btn.getAttribute("data-group"), true);
    });
  }

  function renderNav() {
    var html = "";
    sectionsOfGroup().forEach(function (s) {
      html +=
        '<button type="button" data-target="' + escapeHtml(s.id) + '" ' +
        'class="' + (s.id === state.active ? "active" : "") + '">' +
        escapeHtml(t("sections." + s.id + ".title", s.title)) + "</button>";
    });
    el.nav.innerHTML = html;
  }

  function renderSections() {
    var html = "";
    sectionsOfGroup().forEach(function (s) {
      var title = t("sections." + s.id + ".title", s.title);
      var sub = t("sections." + s.id + ".subtitle", s.subtitle || "");
      var items = s.items.map(function (it) { return itemMarkup(it, s.id); }).join("");
      html +=
        '<section id="sec-' + escapeHtml(s.id) + '" class="menu-section' +
        (s.id === state.active ? " active" : "") + '" aria-label="' + escapeHtml(title) + '">' +
        (sub ? '<p class="item-note" style="text-align:center;margin:4px 0 10px;">' + escapeHtml(sub) + "</p>" : "") +
        '<div class="menu-list" role="list">' + items + "</div>" +
        "</section>";
    });
    el.sections.innerHTML = html;
  }

  function activate(id, scroll) {
    if (!state.data) return;
    state.active = id;
    var btns = el.nav.querySelectorAll("button");
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle("active", btns[i].getAttribute("data-target") === id);
    }
    var secs = el.sections.querySelectorAll(".menu-section");
    for (var j = 0; j < secs.length; j++) {
      secs[j].classList.toggle("active", secs[j].id === "sec-" + id);
    }
    if (scroll) {
      var target = document.getElementById("sec-" + id);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function activateGroup(gid, scroll) {
    if (!state.data) return;
    var defs = groupDefs();
    var found = false;
    for (var i = 0; i < defs.length; i++) {
      if (defs[i].id === gid) { found = true; break; }
    }
    if (!found) gid = defs.length ? defs[0].id : null;
    state.group = gid;

    var secs = sectionsOfGroup();
    state.active = secs.length ? secs[0].id : null;

    renderGroupNav();
    renderNav();
    renderSections();

    /* aktif grup sekmesini kaydırmalı şeritte ortala (yalnız kullanıcı etkileşiminde) */
    if (el.groupNav) {
      var activeTab = el.groupNav.querySelector(".group-tab.active");
      if (activeTab) activeTab.scrollIntoView({ inline: "center", block: "nearest" });
    }

    if (scroll && el.sections) {
      el.sections.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function bindNav() {
    el.nav.addEventListener("click", function (e) {
      var btn = e.target.closest("button");
      if (!btn) return;
      activate(btn.getAttribute("data-target"), true);
    });
  }

  function applyTexts() {
    document.title = state.data.meta.title || "NOX Lounge — Menü";
    var tag = document.getElementById("hero-tagline");
    if (tag && state.data.meta.tagline) tag.textContent = t("meta.tagline", state.data.meta.tagline);
    var ig = document.getElementById("ig-url");
    if (ig && state.data.meta.instagram) ig.href = state.data.meta.instagram;
    var igText = document.getElementById("ig-handle");
    if (igText && state.data.meta.instagramHandle) igText.textContent = state.data.meta.instagramHandle;
    var updated = document.getElementById("updated");
    if (updated && state.data.meta.updated) updated.textContent = state.data.meta.updated;
    var follow = document.getElementById("ig-follow");
    if (follow) follow.textContent = t("ui.follow", "Bizi takip edin");
    var view = document.getElementById("ig-view");
    if (view) view.textContent = t("ui.igView", "Instagram'da Gör");
    var ftag = document.getElementById("f-tag");
    if (ftag) ftag.textContent = t("ui.footerTag", "Güzel anların lezzetli eşliği");
  }

  /* Dil seçici: <select id="lang-sel"> seçeneklerini doldurur */
  function renderLangSel() {
    var sel = document.getElementById("lang-sel");
    if (!sel) return;
    sel.innerHTML = "";
    LANGS.forEach(function (code) {
      var opt = document.createElement("option");
      opt.value = code;
      opt.textContent = LANG_NAMES[code];
      sel.appendChild(opt);
    });
    sel.value = state.lang;
  }

  function bindLangSel() {
    var sel = document.getElementById("lang-sel");
    if (!sel) return;
    sel.addEventListener("change", function () {
      try { localStorage.setItem("nox_lang", sel.value); } catch (e) { /* depolama kapalıysa sessizce geç */ }
      setLang(sel.value);
    });
  }

  /* Dile geç: sözlüğü yeniden kur, tüm metinleri yeniden çiz */
  function setLang(code) {
    state.lang = code;
    if (langData) {
      var tr = langData.tr || {};
      state.dict = code === "tr" ? tr : deepMerge(tr, langData[code] || {});
    } else {
      state.dict = null;
    }
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
    renderLangSel();
    applyTexts();
    setFxNote();
    renderGroupNav();
    renderNav();
    renderSections();
    if (state.active) activate(state.active, false);
  }

  function fail(msg) {
    hideIntro();
    el.sections.innerHTML = "";
    el.nav.innerHTML = "";
    if (el.groupNav) el.groupNav.innerHTML = "";
    el.error.style.display = "block";
    el.error.textContent = msg || "Menü yüklenemedi. Lütfen tekrar deneyin.";
  }

  function load() {
    /* önce dili belirle — sayfa ilk boyanmada algılanan dilde gelsin */
    state.lang = detectLang();
    document.documentElement.lang = state.lang;
    document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";

    var menuP = fetch("data/menu.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(function () {
        /* fetch çalışmazsa (örn. dosya çift tıklanarak file:// ile açıldıysa)
           sayfaya gömülü yedeği kullan — tools/build.py ile üretilir. */
        return window.MENU_FALLBACK;
      });

    /* çeviri paketi; yüklenemezse (örn. dosya çift tıklanarak file:// ile açıldıysa)
       sayfaya gömülü yedeği kullan — tools/build.py ile üretilir. */
    var langP = fetch("data/lang.json", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(function () {
        return window.LANG_FALLBACK || null;
      });

    Promise.all([menuP, langP])
      .then(function (res) {
        var data = res[0];
        if (!data || !data.sections || !data.sections.length) throw new Error("Boş menü");
        state.data = data;
        langData = res[1];
        if (!langData) {
          state.dict = null;
        } else {
          var tr = langData.tr || {};
          state.dict = state.lang === "tr" ? tr : deepMerge(tr, langData[state.lang] || {});
        }
        var defs = groupDefs();
        state.group = defs.length ? defs[0].id : null;
        var secs = sectionsOfGroup();
        state.active = secs.length ? secs[0].id : null;
        applyTexts();
        renderGroupNav();
        renderNav();
        renderSections();
        setFxNote();
        renderLangSel();
        bindGroupNav();
        bindNav();
        bindLangSel();
        loadFx();
        initIntro();
      })
      .catch(function () {
        fail();
      });
  }

  /* ---------- açılış videosu (intro) ---------- */

  var introEl = document.getElementById("intro");
  var introVideo = document.getElementById("intro-video");
  var introSkip = document.getElementById("intro-skip");
  var introDone = false;
  var INTRO_SKIP_MS = 900;
  var INTRO_TIMEOUT_MS = 12000;

  function hideIntro() {
    if (!introEl || introDone) return;
    introDone = true;
    document.body.classList.remove("no-scroll");
    if (introVideo) {
      try { introVideo.pause(); } catch (e) { /* oynatıcı kapalıysa yok say */ }
    }
    introEl.classList.add("is-hidden");
    setTimeout(function () {
      if (introEl && introEl.parentNode) introEl.parentNode.removeChild(introEl);
    }, 800);
  }

  function initIntro() {
    if (!introEl || !introVideo) return;
    if (introSkip) {
      introSkip.textContent = t("ui.skipIntro", "Menüye Geç");
      introSkip.addEventListener("click", hideIntro);
    }
    var timeoutId = setTimeout(hideIntro, INTRO_TIMEOUT_MS);
    function finish() { clearTimeout(timeoutId); hideIntro(); }
    function markReady() {
      if (introDone) return;
      introEl.classList.add("is-ready");
      document.body.classList.add("no-scroll");
      if (introSkip) introSkip.hidden = false;
      setTimeout(function () { introEl.classList.add("is-skippable"); }, INTRO_SKIP_MS);
    }
    introVideo.addEventListener("ended", finish);
    introVideo.addEventListener("error", finish);
    introVideo.addEventListener("canplay", markReady);
    function mediaFailed() {
      return !!introVideo.error || introVideo.networkState === 3;
    }
    /* ağ hatası bazı tarayıcılarda 'error' olayı üretmez; NETWORK_NO_SOURCE ile kalır */
    if (mediaFailed()) finish();
    else if (introVideo.readyState >= 3) markReady();
    else setTimeout(function () { if (mediaFailed()) finish(); }, 1500);
    var p = introVideo.play();
    if (p && typeof p.catch === "function") {
      p.catch(function () { clearTimeout(timeoutId); hideIntro(); });
    }
  }

  document.addEventListener("DOMContentLoaded", load);
})();