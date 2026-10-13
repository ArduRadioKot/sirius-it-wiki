(() => {
  const media = matchMedia("(prefers-color-scheme: dark)");
  const order = ["system", "light", "dark"];
  const labels = {
    system: "Тема: как на устройстве",
    light: "Тема: светлая",
    dark: "Тема: тёмная",
  };

  const read = () => {
    try {
      return localStorage.getItem("sirius-theme") || "system";
    } catch {
      return "system";
    }
  };

  const syncControls = (choice) => {
    document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
      el.dataset.themeChoice = choice;
      el.setAttribute("aria-label", `${labels[choice]}. Нажмите, чтобы сменить`);
      el.title = labels[choice];
    });
    document.querySelectorAll("[data-theme-picker]").forEach((el) => {
      el.value = choice;
    });
  };

  window.setTheme = (choice = read()) => {
    if (!order.includes(choice)) choice = "system";
    const dark = choice === "dark" || (choice === "system" && media.matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = dark ? "#000000" : "#00a7a7";
    try {
      localStorage.setItem("sirius-theme", choice);
    } catch {}
    syncControls(choice);
  };

  const cycleTheme = () => {
    const current = read();
    const next = order[(order.indexOf(current) + 1) % order.length];
    setTheme(next);
  };

  setTheme();
  media.addEventListener("change", () => setTheme());

  document.addEventListener("DOMContentLoaded", () => {
    setTheme();
    document.querySelectorAll("[data-theme-toggle]").forEach((el) => {
      el.addEventListener("click", cycleTheme);
    });
    document.querySelectorAll("[data-theme-picker]").forEach((el) => {
      el.onchange = () => setTheme(el.value);
    });
  });
})();
