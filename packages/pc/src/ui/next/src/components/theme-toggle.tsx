"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");

  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    if (current === "light" || current === "dark") setTheme(current);
  }, []);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("micshare-theme", next);
    } catch {
      /* ignora */
    }
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Alternar tema"
      className="flex h-9 w-9 items-center justify-center rounded-full border border-border
                 bg-surface text-base transition-colors hover:bg-surface-2"
    >
      {theme === "dark" ? "🌙" : "☀️"}
    </button>
  );
}
