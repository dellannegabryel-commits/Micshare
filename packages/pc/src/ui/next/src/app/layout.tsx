import type { Metadata } from "next";
import "./globals.css";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = {
  title: "Micshare PC",
  description: "Servidor de áudio peer-to-peer — celular como microfone do PC",
};

/* Aplica o tema salvo antes da primeira pintura (sem flash). */
const themeInit = `
(function () {
  try {
    var t = localStorage.getItem("micshare-theme");
    if (!t) t = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body className="min-h-screen font-sans">
        <header
          className="sticky top-0 z-10 flex items-center justify-between border-b border-border
                     bg-background/80 px-6 py-3 backdrop-blur-xl"
        >
          <div className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold text-white"
              style={{ background: "var(--primary)" }}
            >
              M
            </span>
            <div>
              <div className="text-sm font-semibold leading-tight">Micshare PC</div>
              <div className="text-xs leading-tight text-muted">servidor de áudio</div>
            </div>
          </div>
          <ThemeToggle />
        </header>
        <main className="mx-auto w-full max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
