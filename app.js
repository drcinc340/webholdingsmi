(function () {
  "use strict";

  const STATIC_SANDBOX_DEMOS = Object.freeze({
    "104200": {
      verifier: "KOWALSKI",
      record: {
        code: "REF-104-200",
        isDemo: true,
        maskedPayee: "R. KOWALSKI (SAMPLE BENEFICIARY)",
        category: "Unclaimed Life Insurance Benefit",
        jurisdictionAnchor: "Dearborn / Wayne County, MI",
        grossAmount: 28450.0,
        feePercent: 25,
        feeAmount: 7112.5,
        netToClaimant: 21337.5
      }
    },
    "310500": {
      verifier: "SULLIVAN",
      record: {
        code: "REF-310-500",
        isDemo: true,
        maskedPayee: "E. SULLIVAN (SAMPLE BENEFICIARY)",
        category: "Matured Annuity Contract",
        jurisdictionAnchor: "Sterling Heights / Macomb County, MI",
        grossAmount: 44910.4,
        feePercent: 20,
        feeAmount: 8982.08,
        netToClaimant: 35928.32
      }
    }
  });

  let activeFormToken = "";
  let cachedZkVault = null;

  function formatUsd(amount) {
    const n = Number(amount) || 0;
    return "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToHex(u8) {
    let s = "";
    for (let i = 0; i < u8.length; i++) {
      s += u8[i].toString(16).padStart(2, "0");
    }
    return s;
  }

  async function loadZkVault() {
    if (cachedZkVault) return cachedZkVault;
    const res = await fetch("vault-index.json", { credentials: "same-origin" });
    if (!res.ok) return null;
    cachedZkVault = await res.json();
    return cachedZkVault;
  }

  async function verifyViaZeroKnowledgeVault(rawName, rawPinDigits) {
    if (!window.crypto || !window.crypto.subtle || rawPinDigits.length !== 6) return null;
    const vault = await loadZkVault();
    if (!vault || !vault.entries) return null;

    const enc = new TextEncoder();
    const dec = new TextDecoder();
    const words = String(rawName || "")
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 2);
    const collapsed = String(rawName || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (collapsed.length >= 2 && !words.includes(collapsed)) words.unshift(collapsed);

    const slotSaltBytes = enc.encode(vault.slotSalt || "WH-ZK-SLOT-2026-MI");

    for (const word of words) {
      const passBytes = enc.encode(`${word}:${rawPinDigits}`);
      const baseKey = await window.crypto.subtle.importKey("raw", passBytes, "PBKDF2", false, [
        "deriveBits",
        "deriveKey"
      ]);

      const slotBits = await window.crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: slotSaltBytes,
          iterations: Number(vault.slotIters || 65000),
          hash: "SHA-256"
        },
        baseKey,
        128
      );
      const slotHex = bytesToHex(new Uint8Array(slotBits));
      const slotRecord = vault.entries[slotHex];
      if (!slotRecord) continue;

      const [recSaltB64, ivB64, ctB64] = slotRecord;
      const aesKey = await window.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: b64ToBytes(recSaltB64),
          iterations: Number(vault.aesIters || 120000),
          hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );

      const plainBuf = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBytes(ivB64) },
        aesKey,
        b64ToBytes(ctB64)
      );
      return JSON.parse(dec.decode(plainBuf));
    }
    return null;
  }

  function refreshSecurityFormToken() {
    fetch("api/security/form-token", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && data.ok) {
          activeFormToken = data.formToken || "";
        }
      })
      .catch(() => {});
  }

  refreshSecurityFormToken();

  // Mobile Menu Toggle
  const mobileMenuBtn = document.getElementById("mobileMenuBtn");
  const mainNav = document.getElementById("mainNav");
  if (mobileMenuBtn && mainNav) {
    mobileMenuBtn.addEventListener("click", () => {
      mainNav.classList.toggle("open");
    });
    mainNav.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => mainNav.classList.remove("open"));
    });
  }

  // Client Reference Verification
  const verifyForm = document.getElementById("verifyForm");
  const referenceInput = document.getElementById("referenceInput");
  const verifierNameInput = document.getElementById("verifierNameInput");
  const verifyBtn = document.getElementById("verifyBtn");
  const certErrorBox = document.getElementById("certErrorBox");
  const statementDrawer = document.getElementById("statementDrawer");

  function showVerifyError(msg) {
    if (statementDrawer) statementDrawer.classList.add("hidden");
    if (!certErrorBox) return;
    certErrorBox.textContent = msg;
    certErrorBox.classList.remove("hidden");
  }

  function renderStatement(notice) {
    if (certErrorBox) certErrorBox.classList.add("hidden");
    if (statementDrawer) statementDrawer.classList.remove("hidden");

    const codeEl = document.getElementById("certCodeLabel");
    const payeeEl = document.getElementById("certPayeeLabel");
    const grossEl = document.getElementById("certGrossAmount");
    const catEl = document.getElementById("certCategory");
    const anchorEl = document.getElementById("certAnchor");
    const netEl = document.getElementById("certNetAmount");

    if (codeEl) {
      codeEl.textContent = notice.isDemo
        ? `ILLUSTRATIVE PREVIEW • ${notice.code}`
        : `AUDIT REFERENCE • ${notice.code}`;
    }
    if (payeeEl) payeeEl.textContent = notice.maskedPayee;
    if (grossEl) grossEl.textContent = formatUsd(notice.grossAmount);
    if (catEl) catEl.textContent = notice.category;
    if (anchorEl) {
      anchorEl.textContent = String(notice.jurisdictionAnchor || "").replace(
        /^Recorded (Michigan |Corporate |Custodial |Property )?Audit Anchor — /i,
        ""
      );
    }
    if (netEl) {
      netEl.textContent = `${formatUsd(notice.netToClaimant)} (${100 - notice.feePercent}% Net to Client)`;
    }

    const agreementLink = document.getElementById("certAgreementLink");
    if (agreementLink) {
      const qs = new URLSearchParams({
        code: notice.code,
        payee: notice.maskedPayee,
        amount: String(notice.grossAmount.toFixed(2)),
        fee: String(notice.feePercent),
        category: notice.category
      });
      agreementLink.href = `agreement-preview.html?${qs.toString()}`;
    }

    const refField = document.getElementById("intakeRefCode");
    const payeeField = document.getElementById("insuredOrPayeeName");
    if (refField) refField.value = notice.code;
    if (payeeField && !notice.isDemo) payeeField.value = notice.maskedPayee;
  }

  async function verifyNoticeDualFactor(rawCode, rawVerifierName) {
    const cleanedCode = String(rawCode || "").trim().toUpperCase().replace(/\s+/g, "");
    const digitsOnly = cleanedCode.replace(/\D/g, "");
    const cleanedName = String(rawVerifierName || "").trim();

    if (!cleanedCode || !cleanedName) {
      showVerifyError("Please enter both the recorded Last Name (or Entity) and the 6-Digit Reference PIN.");
      return;
    }

    if (referenceInput) referenceInput.value = cleanedCode;
    if (verifierNameInput) verifierNameInput.value = cleanedName;

    if (STATIC_SANDBOX_DEMOS[digitsOnly] && cleanedName.toUpperCase().includes(STATIC_SANDBOX_DEMOS[digitsOnly].verifier)) {
      renderStatement(STATIC_SANDBOX_DEMOS[digitsOnly].record);
      return;
    }

    const originalLabel = verifyBtn ? verifyBtn.textContent : "View Summary";
    if (verifyBtn) {
      verifyBtn.disabled = true;
      verifyBtn.textContent = "Verifying...";
    }

    try {
      const res = await fetch("api/verify-notice", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceCode: cleanedCode, verifierName: cleanedName })
      });
      if (res.ok) {
        const data = await res.json();
        if (data && data.ok && data.notice) {
          renderStatement(data.notice);
          return;
        }
      }
      if (res.status === 400 || res.status === 403 || res.status === 429) {
        const errData = await res.json().catch(() => ({}));
        showVerifyError(
          errData.error ||
            "Unable to match that Last Name and Reference PIN. Please contact Client Services at (313) 588-4864."
        );
        return;
      }
      throw new Error("Fallback to zero-knowledge static vault");
    } catch {
      try {
        const zkMatch = await verifyViaZeroKnowledgeVault(cleanedName, digitsOnly);
        if (zkMatch) {
          renderStatement(zkMatch);
          return;
        }
      } catch {}
      showVerifyError(
        "Unable to match that Last Name and Reference PIN. Please confirm your Reference PIN with our office at (313) 588-4864."
      );
    } finally {
      if (verifyBtn) {
        verifyBtn.disabled = false;
        verifyBtn.textContent = originalLabel;
      }
    }
  }

  if (verifyForm) {
    verifyForm.addEventListener("submit", (e) => {
      e.preventDefault();
      verifyNoticeDualFactor(referenceInput.value, verifierNameInput.value);
    });
  }

  document.querySelectorAll(".sample-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const code = chip.getAttribute("data-code");
      const name = chip.getAttribute("data-name");
      verifyNoticeDualFactor(code, name);
    });
  });

  // Contingency Fee Estimator
  const calcCategory = document.getElementById("calcCategory");
  const calcAmountInput = document.getElementById("calcAmountInput");
  const calcAmountSlider = document.getElementById("calcAmountSlider");

  function updateCalculator(source) {
    if (!calcCategory || !calcAmountInput || !calcAmountSlider) return;
    let gross = Number(source === "slider" ? calcAmountSlider.value : calcAmountInput.value);
    if (!Number.isFinite(gross) || gross < 0) gross = 0;

    if (source === "slider") {
      calcAmountInput.value = String(gross);
    } else if (gross >= 1500 && gross <= 100000) {
      calcAmountSlider.value = String(gross);
    }

    const feePct = Number(calcCategory.value) || 25;
    const feeAmt = Math.round(gross * (feePct / 100) * 100) / 100;
    const netAmt = Math.round((gross - feeAmt) * 100) / 100;

    document.getElementById("calcGrossDisplay").textContent = formatUsd(gross);
    document.getElementById("calcFeeLabel").textContent = `Contingency Fee (${feePct}% Upon Recovery)`;
    document.getElementById("calcFeeDisplay").textContent = formatUsd(feeAmt);
    document.getElementById("calcNetDisplay").textContent = formatUsd(netAmt);

    const previewBtn = document.getElementById("calcPreviewAgreementBtn");
    if (previewBtn) {
      const selectedOpt = calcCategory.options[calcCategory.selectedIndex];
      const catLabel = (selectedOpt && selectedOpt.getAttribute("data-label")) || "Unclaimed Life Insurance / Benefit";
      const qs = new URLSearchParams({
        amount: gross.toFixed(2),
        fee: String(feePct),
        category: catLabel
      });
      previewBtn.href = `agreement-preview.html?${qs.toString()}`;
    }
  }

  if (calcCategory && calcAmountInput && calcAmountSlider) {
    calcCategory.addEventListener("change", () => updateCalculator("select"));
    calcAmountInput.addEventListener("input", () => updateCalculator("input"));
    calcAmountSlider.addEventListener("input", () => updateCalculator("slider"));
    updateCalculator("input");
  }

  // Safe DOM Builder for Intake Receipt (Pure textContent DOM nodes only)
  function renderIntakeReceipt(box, titleText, detailText) {
    while (box.firstChild) box.removeChild(box.firstChild);
    const strong = document.createElement("strong");
    strong.textContent = titleText;
    const br = document.createElement("br");
    const span = document.createElement("span");
    span.textContent = detailText;
    box.appendChild(strong);
    box.appendChild(br);
    box.appendChild(span);
    box.classList.remove("hidden");
  }

  const claimIntakeForm = document.getElementById("claimIntakeForm");
  const intakeSubmitBtn = document.getElementById("intakeSubmitBtn");
  const intakeSuccessBox = document.getElementById("intakeSuccessBox");

  if (claimIntakeForm) {
    claimIntakeForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const payload = {
        formToken: activeFormToken,
        websiteUrl: document.getElementById("websiteUrl").value,
        inquiryType: document.getElementById("inquiryType").value,
        referenceCode: document.getElementById("intakeRefCode").value,
        insuredOrPayeeName: document.getElementById("insuredOrPayeeName").value,
        relationship: document.getElementById("relationship").value,
        contactName: document.getElementById("contactName").value,
        lastKnownCityState: document.getElementById("lastKnownCityState").value,
        phone: document.getElementById("phone").value,
        email: document.getElementById("email").value,
        preferredMeeting: document.getElementById("preferredMeeting").value,
        notes: document.getElementById("notes").value
      };

      intakeSubmitBtn.disabled = true;
      intakeSubmitBtn.textContent = "Submitting...";

      try {
        const res = await fetch("api/claim-intake", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || "Online submission unavailable.");
        }

        renderIntakeReceipt(
          intakeSuccessBox,
          `Inquiry Confirmation: ${data.confirmationId}`,
          `Logged ${data.submittedAt}. A Managing Partner will contact you directly, or you may reach Client Services at (313) 588-4864.`
        );
        claimIntakeForm.reset();
        refreshSecurityFormToken();
      } catch {
        renderIntakeReceipt(
          intakeSuccessBox,
          "Client Services Desk: (313) 588-4864",
          "Please contact Managing Partners Adriano Vagnini or Josh Dinverno directly at (313) 588-4864 to schedule your consultation or notary appointment."
        );
      } finally {
        intakeSubmitBtn.disabled = false;
        intakeSubmitBtn.textContent = "Submit Client Inquiry";
      }
    });
  }
})();
