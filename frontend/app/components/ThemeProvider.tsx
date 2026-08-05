"use client";

import { useEffect } from "react";
import ThemeToggle from "./ThemeToggle";

export default function ThemeProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  useEffect(() => {
    const savedTheme = window.localStorage.getItem("charis_theme");
    document.documentElement.dataset.theme = savedTheme === "dark" ? "dark" : "light";
  }, []);

  return <><ThemeToggle />{children}</>;
}
