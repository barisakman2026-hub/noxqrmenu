/* NOX Lounge — Yönetim Paneli (Netlify Function ile JSON deploy) */
(function () {
  "use strict";

  var CONFIG_URL = "data/config.json";
  var MENU_URL = "data/menu.json";
  var DEPLOY_FN = "/.netlify/functions/deploy-json";

  var cfg = null;
  var menu = null;
  var dirty = false;

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function sha256hex(str) {
    var enc = new TextEncoder().encode(str);
    return crypto.subtle.digest("SHA-256", enc).then(function (buf) {
      return Array.from(new Uint8Array(buf)).map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }

  function setMsg(id, text, ok) {
    var el = $(id);
    el.textContent = text || "";
    el.className = "msg" + (ok ? " ok" : text ? " err" : "");
  }

  function initAuth() {
    $("auth-form").addEventListener("submit", function (e) {
      e.preventDefault();
      var pw = $("pw-input").value;
      if (!pw) return setMsg("auth-msg", "Şifre girin.", false);
      setMsg("auth-msg", "Kontrol ediliyor…", false);
      sha256hex(pw).then(function (hash) {
        if (hash === cfg.adminPasswordHash) {
          sessionStorage.setItem("nox_auth", "1");
          showPanel();
        } else {
          setMsg("auth-msg", "Hatalı şifre.", false);
        }
      });
    });
  }

  function showPanel() {
    $("auth-screen").style.display = "none";
    $("panel").style.display = "block";
    $("savebar").style.display = "flex";
    render();
  }

  function render() {
    $("updated-label").textContent = menu.meta.updated || "";
    renderSections();
  }

  function newSection() {
    var g = (menu.groups && menu.groups.length) ? menu.groups[0].id : "alkollu";
    return { id: "k" + Date.now(), group: g, title: "Yeni Bölüm", subtitle: "", items: [] };
  }
  function newItem() { return { name: "Yeni Ürün", price: 0, note: "" }; }

  function groupOptions(si) {
    var sec = menu.sections[si];
    var groups = (menu.groups && menu.groups.length)
      ? menu.groups
      : [{ id: "alkollu", title: "Alkollü İçecekler" }, { id: "alkolsuz", title: "Alkolsüz İçecekler" }, { id: "aperatif", title: "Aperatifler" }, { id: "ana-yemek", title: "Ana Yemekler" }, { id: "tatli", title: "Tatlılar" }];
    return groups.map(function (g) {
      return '<option value="' + esc(g.id) + '"' + (sec.group === g.id ? " selected" : "") + ">" + esc(g.title) + "</option>";
    }).join("");
  }

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
        '<input class="sec-title" data-si="' + si + '" value="' + esc(sec.title) + '" placeholder="Bölüm adı">' +
        '<select class="sec-group" data-si="' + si + '" aria-label="Ana grup"></select>' +
        "</div>" +
        '<div class="sec-meta">' +
        '<input class="sec-subtitle" data-si="' + si + '" value="' + esc(sec.subtitle || "") + '" placeholder="Alt not">' +
        "</div>" +
        '<div class="items-wrap"></div>' +
        '<button class="add-item" data-si="' + si + '">+ Ürün Ekle</button>' +
        "</div>";

      card.querySelector(".sec-group").innerHTML = groupOptions(si);
      var itemsWrap = card.querySelector(".items-wrap");
      sec.items.forEach(function (item, ii) { itemsWrap.appendChild(itemEditor(sec, item, si, ii)); });
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
      item.options.forEach(function (o, oi) { optRows.appendChild(optionRow(si, ii, oi, o)); });
      optWrap.appendChild(optRows);

      var addOpt = document.createElement("button");
      addOpt.className = "add-opt";
      addOpt.dataset.si = si;
      addOpt.dataset.ii = ii;
      addOpt.textContent = "+ Fiyat seçeneği ekle";
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
    label.placeholder = "Etiket";

    var price = document.createElement("input");
    price.className = "opt-price";
    price.type = "number";
    price.min = "0";
    price.step = "0.5";
    price.value = o.price != null ? o.price : "";

    var rm = document.createElement("button");
    rm.className = "rm rm-opt";
    rm.textContent = "✕";

    row.appendChild(label);
    row.appendChild(price);
    row.appendChild(rm);
    return row;
  }

  function onInput(e) {
    dirty = true;
    var t = e.target;
    var si;

    if (t.classList.contains("sec-group")) {
      si = parseInt(t.dataset.si, 10);
      if (menu.sections[si]) menu.sections[si].group = t.value;
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

  function deployFiles(files) {
    return fetch(DEPLOY_FN, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ files: files })
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) throw new Error(data.error || "Deploy hatası");
        return data;
      });
    });
  }

  function onSave() {
    var content = JSON.stringify(buildJSON(), null, 2) + "\n";
    setMsg("save-msg", "Kaydediliyor…", false);

    deployFiles({ "data/menu.json": content }).then(function (res) {
      dirty = false;
      setMsg("save-msg", "Kayıt Başarılı! Site güncellendi.", true);
    }).catch(function (err) {
      setMsg("save-msg", "Kayıt başarısız: " + err.message, false);
    });
  }

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

        setMsg("pw-msg", "Şifre kaydediliyor…", false);
        deployFiles({
          "data/config.json": configContent,
          "data/menu.json": menuContent
        }).then(function (res) {
          cfg.adminPasswordHash = newHash;
          $("pw-current").value = $("pw-new").value = $("pw-new2").value = "";
          setMsg("pw-msg", "Kayıt Başarılı! Şifre değişti.", true);
        }).catch(function (err) {
          setMsg("pw-msg", "Kayıt başarısız: " + err.message, false);
        });
      });
    });
  }

  function initPanel() {
    $("save-netlify").addEventListener("click", onSave);
    $("pw-save-netlify").addEventListener("click", onPasswordChange);
    $("logout").addEventListener("click", function () {
      sessionStorage.removeItem("nox_auth");
      location.reload();
    });
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
    }).catch(function () { return fallback || Promise.reject(new Error("Veri yok")); });
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
      setMsg("auth-msg", "Menü verisi yüklenemedi.", false);
    });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
