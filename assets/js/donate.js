// Copy button for the donation address. Without JavaScript the address is still
// selectable text and the wallet link still works.
const button = document.getElementById("copy-zcash");
const address = document.getElementById("zcash-address");
if (button && address && navigator.clipboard) {
  button.hidden = false;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(address.textContent.trim());
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy address"; }, 1800);
    } catch { button.textContent = "Select and copy the address"; }
  });
}
