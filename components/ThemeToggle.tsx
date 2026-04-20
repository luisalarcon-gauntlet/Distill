"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Render nothing until mounted — avoids hydration mismatch on the toggle button itself
  if (!mounted) return null;

  const isDark = theme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "var(--text-11)",
        color: "var(--fg-muted)",
        background: "transparent",
        border: "var(--hairline)",
        borderRadius: "var(--r-md)",
        padding: "4px 10px",
        cursor: "pointer",
      }}
    >
      {isDark ? "Library mode" : "Dark mode"}
    </button>
  );
}
