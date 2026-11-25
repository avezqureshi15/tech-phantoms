/* global document, window, URL, FormData, fetch, CustomEvent */
(function () {
  var script = document.currentScript;
  if (!script || script.dataset.diyaMounted === "true") return;

  var publicId = script.getAttribute("data-widget-id");
  if (!publicId) return;
  script.dataset.diyaMounted = "true";

  var apiBase = new URL(script.src, window.location.href).origin;
  var apiPath = apiBase + "/api/public/widget/" + encodeURIComponent(publicId);
  var context = {};
  var configured = false;
  var pendingSubmissionId = null;
  function mount() {
    if (document.getElementById("diya-enquiry-widget")) return;

    var host = document.createElement("div");
    host.id = "diya-enquiry-widget";
    var shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all: initial; color: #211d1a; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; font-size: 14px; line-height: 1.45; }
        *, *::before, *::after { box-sizing: border-box; }
        button, input, textarea { font: inherit; }
        button { cursor: pointer; }
        .launcher { position: fixed; z-index: 2147483000; right: 22px; bottom: 22px; display: flex; align-items: center; gap: 11px; min-height: 58px; padding: 8px 19px 8px 10px; border: 0; border-radius: 999px; background: var(--diya-accent, #b7503c); color: #fffaf4; box-shadow: 0 12px 35px #26160f38, inset 0 1px #ffffff36; transition: transform 180ms ease, box-shadow 180ms ease; }
        .launcher:hover { transform: translateY(-2px); box-shadow: 0 16px 40px #26160f4a, inset 0 1px #ffffff36; }
        .sun { display: grid; width: 39px; height: 39px; place-items: center; border: 1px solid #ffffff70; border-radius: 50%; background: #ffffff1a; }
        .launcher-label { font-size: 13px; font-weight: 650; letter-spacing: .01em; }
        .panel { position: fixed; z-index: 2147483001; right: 22px; bottom: 92px; display: flex; width: min(390px, calc(100vw - 28px)); max-height: min(690px, calc(100svh - 118px)); flex-direction: column; overflow: hidden; border: 1px solid #e9dfd6; border-radius: 24px; background: #fffdf9; box-shadow: 0 28px 90px #28191038, 0 4px 14px #28191012; color: #211d1a; }
        [hidden] { display: none !important; }
        .head { position: relative; padding: 22px 23px 21px; background: linear-gradient(135deg, var(--diya-accent, #b7503c), color-mix(in srgb, var(--diya-accent, #b7503c), #36211d 30%)); color: #fffaf4; }
        .head-kicker { margin: 0 0 7px; color: #fffaf4b8; font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; }
        .head h2 { margin: 0; padding-right: 36px; font-family: Georgia, "Times New Roman", serif; font-size: 25px; font-weight: 500; letter-spacing: -.025em; }
        .head p { max-width: 285px; margin: 8px 0 0; color: #fffaf4e3; font-size: 12px; line-height: 1.55; }
        .close { position: absolute; top: 16px; right: 16px; display: grid; width: 34px; height: 34px; place-items: center; border: 1px solid #ffffff50; border-radius: 50%; background: #ffffff18; color: white; }
        .close:hover { background: #ffffff2b; }
        .form-wrap { overflow-y: auto; padding: 19px 22px 21px; }
        .fields { display: grid; gap: 13px; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 11px; }
        label.field { display: grid; gap: 6px; color: #51473f; font-size: 11px; font-weight: 650; letter-spacing: .015em; }
        .field input, .field textarea { width: 100%; min-width: 0; border: 1px solid #e4d9cf; border-radius: 11px; outline: none; background: #fff; color: #211d1a; font-size: 13px; font-weight: 450; letter-spacing: 0; transition: border 150ms ease, box-shadow 150ms ease; }
        .field input { height: 42px; padding: 0 12px; }
        .field textarea { min-height: 92px; resize: vertical; padding: 11px 12px; line-height: 1.5; }
        .field input::placeholder, .field textarea::placeholder { color: #aaa096; }
        .field input:focus, .field textarea:focus { border-color: var(--diya-accent, #b7503c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--diya-accent, #b7503c) 13%, transparent); }
        .contact-hint { margin: -5px 0 0; color: #83776d; font-size: 10px; }
        .product-context { margin: 0; padding: 9px 11px; border: 1px solid #ead8ca; border-radius: 10px; background: #faf2e9; color: #705744; font-size: 11px; }
        .consent { display: flex; align-items: flex-start; gap: 9px; color: #746a61; font-size: 10px; line-height: 1.5; }
        .consent input { width: 15px; height: 15px; margin: 0; accent-color: var(--diya-accent, #b7503c); }
        .submit { display: flex; width: 100%; min-height: 46px; align-items: center; justify-content: center; gap: 9px; border: 0; border-radius: 13px; background: var(--diya-accent, #b7503c); color: #fffaf4; font-size: 13px; font-weight: 700; transition: filter 150ms ease, transform 150ms ease; }
        .submit:hover { filter: brightness(.94); transform: translateY(-1px); }
        .submit:disabled { cursor: wait; opacity: .65; transform: none; }
        .error { min-height: 16px; margin: 0; color: #a92d27; font-size: 11px; }
        .fineprint { margin: 12px 0 0; color: #9b9188; font-size: 9px; text-align: center; }
        .success { padding: 38px 24px 42px; text-align: center; }
        .success-mark { display: grid; width: 58px; height: 58px; margin: 0 auto 18px; place-items: center; border-radius: 50%; background: #e9f3e8; color: #3b7649; }
        .success h3 { margin: 0; font-family: Georgia, "Times New Roman", serif; font-size: 27px; font-weight: 500; }
        .success p { margin: 10px auto 0; max-width: 270px; color: #776d64; font-size: 13px; line-height: 1.6; }
        .hp { position: absolute !important; left: -10000px !important; width: 1px !important; height: 1px !important; overflow: hidden !important; }
        @media (max-width: 520px) {
          .launcher { right: 14px; bottom: 14px; min-height: 54px; }
          .panel { right: 10px; bottom: 78px; width: calc(100vw - 20px); max-height: calc(100svh - 92px); border-radius: 21px; }
          .head { padding: 19px 20px 18px; }
          .form-wrap { padding: 17px 18px 19px; }
        }
        @media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; } }
      </style>
      <button class="launcher" type="button" aria-haspopup="dialog" aria-expanded="false" hidden>
        <span class="sun" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none"><path d="M12 3.1c1.2 3.2 2.5 4.5 5.7 5.7-3.2 1.2-4.5 2.5-5.7 5.7-1.2-3.2-2.5-4.5-5.7-5.7 3.2-1.2 4.5-2.5 5.7-5.7Z" fill="currentColor"/><path d="M18.7 14.6c.6 1.7 1.3 2.4 3 3-1.7.6-2.4 1.3-3 3-.6-1.7-1.3-2.4-3-3 1.7-.6 2.4-1.3 3-3Z" fill="currentColor"/></svg></span>
        <span class="launcher-label">Ask us anything</span>
      </button>
      <section class="panel" role="dialog" aria-modal="false" aria-labelledby="diya-title" hidden>
        <header class="head">
          <p class="head-kicker">A little help, thoughtfully</p>
          <h2 id="diya-title">Talk to <span class="brand-name">our team</span></h2>
          <p class="welcome">Have a question? Send us a note.</p>
          <button class="close" type="button" aria-label="Close enquiry form"><svg width="17" height="17" viewBox="0 0 20 20" fill="none"><path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg></button>
        </header>
        <div class="form-wrap">
          <form class="fields">
            <p class="product-context" hidden></p>
            <label class="field">Your name<input name="name" autocomplete="name" maxlength="100" placeholder="How should we address you?" required /></label>
            <div class="row">
              <label class="field">Email<input name="email" type="email" autocomplete="email" maxlength="254" placeholder="you@example.com" /></label>
              <label class="field">Phone<input name="phone" type="tel" autocomplete="tel" maxlength="32" placeholder="Optional" /></label>
            </div>
            <p class="contact-hint">Add an email or phone so the store can get back to you.</p>
            <label class="field">Your enquiry<textarea name="message" maxlength="2000" rows="3" placeholder="Tell us what you need help with…" required></textarea></label>
            <label class="consent"><input name="contactConsent" type="checkbox" required /><span>I agree that <span class="brand-name">the store</span> may use my details to respond to this enquiry.</span></label>
            <label class="hp" aria-hidden="true">Leave this field empty<input name="website" tabindex="-1" autocomplete="off" /></label>
            <p class="error" role="alert" aria-live="polite"></p>
            <button class="submit" type="submit"><span>Send enquiry</span><svg width="16" height="16" viewBox="0 0 20 20" fill="none"><path d="M3.5 10h12m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
            <p class="fineprint">Your message goes directly to the store team.</p>
          </form>
          <div class="success" hidden role="status" aria-live="polite">
            <span class="success-mark"><svg width="24" height="24" viewBox="0 0 24 24" fill="none"><path d="m6 12.5 4 4 8-9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
            <h3>Note received.</h3>
            <p>Your enquiry is with <span class="brand-name">the store</span>. They have your contact details and can follow up with you.</p>
          </div>
        </div>
      </section>
    `;

    document.body.appendChild(host);

    var launcher = shadow.querySelector(".launcher");
    var panel = shadow.querySelector(".panel");
    var closeButton = shadow.querySelector(".close");
    var form = shadow.querySelector("form");
    var error = shadow.querySelector(".error");
    var submit = shadow.querySelector(".submit");
    var success = shadow.querySelector(".success");
    var productContext = shadow.querySelector(".product-context");
    var brandLabels = shadow.querySelectorAll(".brand-name");
    var welcome = shadow.querySelector(".welcome");

    function open(nextContext) {
      if (!configured) return false;
      if (nextContext && typeof nextContext === "object") context = nextContext;
      var productName = typeof context.productName === "string" ? context.productName.slice(0, 160) : "";
      productContext.textContent = productName ? "Asking about: " + productName : "";
      productContext.hidden = !productName;
      panel.hidden = false;
      launcher.setAttribute("aria-expanded", "true");
      window.setTimeout(function () { form.querySelector('[name="name"]').focus(); }, 20);
      return true;
    }

    function close() {
      panel.hidden = true;
      launcher.setAttribute("aria-expanded", "false");
      launcher.focus();
    }

    launcher.addEventListener("click", function () { open(); });
    closeButton.addEventListener("click", close);
    window.addEventListener("diya:open", function (event) { open(event.detail); });
    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !panel.hidden) close();
    });

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      error.textContent = "";
      var values = new FormData(form);
      var email = String(values.get("email") || "").trim();
      var phone = String(values.get("phone") || "").trim();
      if (!email && !phone) {
        error.textContent = "Please add an email address or phone number.";
        return;
      }

      submit.disabled = true;
      submit.querySelector("span").textContent = "Sending…";
      if (!pendingSubmissionId) {
        pendingSubmissionId = window.crypto && typeof window.crypto.randomUUID === "function"
          ? window.crypto.randomUUID()
          : "web-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      }
      var payload = {
        submissionId: pendingSubmissionId,
        name: String(values.get("name") || "").trim(),
        email: email,
        phone: phone,
        message: String(values.get("message") || "").trim(),
        contactConsent: values.get("contactConsent") === "on",
        website: String(values.get("website") || ""),
        pageUrl: (window.location.origin + window.location.pathname).slice(0, 2048),
        pageTitle: document.title.slice(0, 200),
        productName: typeof context.productName === "string" ? context.productName.slice(0, 160) : "",
      };

      try {
        var response = await fetch(apiPath + "/enquiries", {
          method: "POST",
          credentials: "omit",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        var result = await response.json().catch(function () { return {}; });
        if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "We couldn't send that just now. Please try again.");
        form.hidden = true;
        success.hidden = false;
        context = {};
        pendingSubmissionId = null;
      } catch (submitError) {
        error.textContent = submitError instanceof Error ? submitError.message : "We couldn't send that just now. Please try again.";
      } finally {
        submit.disabled = false;
        submit.querySelector("span").textContent = "Send enquiry";
      }
    });

    window.DiyaWidget = { open: open };

    fetch(apiPath, { credentials: "omit" })
      .then(function (response) {
        if (!response.ok) throw new Error("Widget is not enabled for this website");
        return response.json();
      })
      .then(function (config) {
        if (typeof config.accentColor === "string" && /^#[\da-f]{6}$/i.test(config.accentColor)) host.style.setProperty("--diya-accent", config.accentColor);
        var brand = typeof config.brandName === "string" ? config.brandName.slice(0, 100) : "our team";
        brandLabels.forEach(function (label) { label.textContent = brand; });
        welcome.textContent = typeof config.welcomeText === "string" ? config.welcomeText : "Have a question? Send us a note.";
        configured = true;
        launcher.hidden = false;
        window.dispatchEvent(new CustomEvent("diya:ready"));
      })
      .catch(function () {
        launcher.hidden = true;
      });
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount, { once: true });
})();
