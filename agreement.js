(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);
  const nowStr = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  document.getElementById("docDate").textContent = nowStr;

  const inClaimant = document.getElementById("inClaimant");
  const inPolicyholder = document.getElementById("inPolicyholder");
  const inAddress = document.getElementById("inAddress");
  const inAmount = document.getElementById("inAmount");
  const inFee = document.getElementById("inFee");
  const printBtn = document.getElementById("printBtn");

  if (printBtn) {
    printBtn.addEventListener("click", () => window.print());
  }

  function cleanParam(key, maxLen) {
    return String(params.get(key) || "")
      .replace(/[\u0000-\u001F\u007F<>`]/g, "")
      .trim()
      .slice(0, maxLen);
  }

  const codeParam = cleanParam("code", 32);
  if (codeParam) document.getElementById("docCode").textContent = codeParam;
  if (params.get("claimant")) inClaimant.value = cleanParam("claimant", 90);
  if (params.get("payee")) inPolicyholder.value = cleanParam("payee", 90);
  if (params.get("address")) inAddress.value = cleanParam("address", 130);

  inAmount.value = cleanParam("amount", 16) || "28450.00";
  inFee.value = cleanParam("fee", 6) || "25";

  function fmt(n) {
    return "$" + (Number(n) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function sync() {
    document.getElementById("docClaimant").textContent = inClaimant.value.trim() || "____________________________";
    document.getElementById("docPolicyholder").textContent =
      inPolicyholder.value.trim() || "____________________________";
    document.getElementById("docAddress").textContent =
      inAddress.value.trim() || "________________________________________________";

    const gross = Math.max(0, Number(inAmount.value) || 0);
    const pct = Math.min(50, Math.max(0, Number(inFee.value) || 25));
    const feeAmt = Math.round(gross * (pct / 100) * 100) / 100;
    const netAmt = Math.round((gross - feeAmt) * 100) / 100;

    document.getElementById("docGross").textContent = fmt(gross);
    document.getElementById("docFee").textContent = `${pct}% (${fmt(feeAmt)})`;
    document.getElementById("docNet").textContent = fmt(netAmt);
  }

  [inClaimant, inPolicyholder, inAddress, inAmount, inFee].forEach((el) => el.addEventListener("input", sync));
  sync();
})();
