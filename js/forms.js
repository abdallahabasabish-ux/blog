/* forms.js — إرسال طلب خدمة إلى Firestore عبر REST مباشر (بلا SDK)
   القاعدة الحاكمة: لا كلمة "تم الإرسال" إلا بعد استجابة 2xx فعلية.
   عند الفشل: ملخص قابل للنسخ + قنوات بديلة — بلا أي تمثيل. */
(function () {
  "use strict";
  var AB = window.AB, LANG = AB.LANG, T = AB.T;
  function $(sel, root) { return (root || document).querySelector(sel); }
  var CFG = window.BLOG_CONFIG;
  var STR = UI_STR[LANG].form;

  var form = $("#reqForm");
  if (!form) return;

  /* تعبئة الخدمات من config — الـ id يطابق enum قواعد Firestore */
  var sel = $("#reqService");
  if (sel) {
    sel.innerHTML = '<option value="">' + STR.servicePick + "</option>" +
      CFG.services.map(function (s) {
        return '<option value="' + s.id + '">' + AB.esc(s[LANG]) + "</option>";
      }).join("");
    /* تعبئة مسبقة من الرابط: ?service=adsense-prep (روابط الفوتر) */
    var pre = new URLSearchParams(location.search).get("service");
    if (pre && CFG.services.some(function (s) { return s.id === pre; })) sel.value = pre;
  }

  var status = $("#formStatus");
  var btn = $("#reqSubmit");
  var hp = $("#reqCompany"); /* honeypot — حقل مخفي عن البشر */

  function setStatus(kind, html) {
    if (!status) return;
    status.hidden = false;
    status.className = "status " + (kind === "ok" ? "status-ok" : "status-err");
    status.innerHTML = html;
    status.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function vEmail(s) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s); }

  function collectPayload() {
    var fd = new FormData(form);
    var get = function (k) { return String(fd.get(k) || "").trim(); };
    var data = {
      name: get("name"),
      email: get("email"),
      service: get("service"),
      message: get("message"),
      sourcePage: "blog:" + (LANG === "en" ? "en/" : "") + "contact"
    };
    var phone = get("phone"), website = get("website");
    if (phone) data.phone = phone;
    if (website) data.website = website;
    return data;
  }

  function buildSummary(d) {
    var svc = CFG.services.filter(function (s) { return s.id === d.service; })[0];
    return (LANG === "ar" ? "طلب خدمة من ABDALLAH ABAS\n" : "Service request from ABDALLAH ABAS\n") +
      "— " + (LANG === "ar" ? "الاسم" : "Name") + ": " + d.name + "\n" +
      "— " + (LANG === "ar" ? "البريد" : "Email") + ": " + d.email + "\n" +
      (d.phone ? "— " + (LANG === "ar" ? "الهاتف" : "Phone") + ": " + d.phone + "\n" : "") +
      (d.website ? "— " + (LANG === "ar" ? "الموقع" : "Website") + ": " + d.website + "\n" : "") +
      "— " + (LANG === "ar" ? "الخدمة" : "Service") + ": " + (svc ? svc[LANG] : d.service) + "\n" +
      "— " + (LANG === "ar" ? "التفاصيل" : "Details") + ": " + d.message;
  }

  function submitToFirestore(d) {
    var f = CFG.firebase;
    var url = "https://firestore.googleapis.com/v1/projects/" + f.projectId +
      "/databases/(default)/documents/service_requests?key=" + encodeURIComponent(f.apiKey);
    var fields = {
      name: { stringValue: d.name },
      email: { stringValue: d.email },
      service: { stringValue: d.service },
      message: { stringValue: d.message },
      sourcePage: { stringValue: d.sourcePage },
      createdAt: { timestampValue: new Date().toISOString() }
    };
    if (d.phone) fields.phone = { stringValue: d.phone };
    if (d.website) fields.website = { stringValue: d.website };
    return fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: fields })
    }).then(function (r) {
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          var msg = (j.error && j.error.message) || ("HTTP " + r.status);
          throw new Error(msg);
        });
      }
      return r.json();
    });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (hp && hp.value) { return; } /* بوت صامت */

    var d = collectPayload();
    if (!d.name || !d.email || !d.service || !d.message) {
      setStatus("err", "<b>" + STR.errRequired + "</b>");
      return;
    }
    if (!vEmail(d.email)) {
      setStatus("err", "<b>" + STR.errEmail + "</b>");
      return;
    }

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = STR.sending;
    status.hidden = true;

    var fbReady = CFG.firebaseReady && CFG.firebaseReady();

    var flow = fbReady
      ? submitToFirestore(d)
      : Promise.reject(new Error("firebase-not-configured"));

    flow.then(function () {
      /* 2xx فعلي فقط هنا */
      setStatus("ok", "<b>" + STR.okTitle + "</b>" + STR.okBody);
      form.reset();
    }).catch(function (err) {
      console && console.warn && console.warn("[blog] request submit failed:", err && err.message);
      var waText = STR.waPrefill + "\n" + buildSummary(d);
      var mailHref = "mailto:" + CFG.contact.email +
        "?subject=" + encodeURIComponent(LANG === "ar" ? "طلب خدمة من المدونة" : "Service request from the blog") +
        "&body=" + encodeURIComponent(buildSummary(d));
      setStatus("err",
        "<b>" + STR.failTitle + "</b>" + STR.failBody +
        '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
        '<button type="button" class="btn btn-ghost btn-sm" id="copySummaryBtn">' + AB.icon("copy") + STR.copySummary + "</button>" +
        '<a class="btn btn-ghost btn-sm" href="https://wa.me/' + CFG.contact.whatsapp + "?text=" + encodeURIComponent(waText) + '" target="_blank" rel="noopener noreferrer">' + AB.icon("whatsapp") + "WhatsApp</a>" +
        '<a class="btn btn-ghost btn-sm" href="' + mailHref + '">' + AB.icon("mail") + "Email</a></div>");
      var cs = document.getElementById("copySummaryBtn");
      if (cs) cs.addEventListener("click", function () { AB.copy(buildSummary(d)); });
    }).then(function () {
      btn.disabled = false;
      btn.textContent = label;
    });
  });
})();
