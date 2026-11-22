// Apply a saved appearance before the first paint. Daylight is the default.
try {
  const preference = localStorage.getItem("aeris.theme.preference");
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", dark ? "#0c1423" : "#ffffff");
} catch {
  document.documentElement.dataset.theme = "light";
}
