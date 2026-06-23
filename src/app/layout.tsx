import "./globals.css";
import type { ReactNode } from "react";
import { PostHogProvider } from "./PostHogProvider";

export const metadata = {
  title: "Ember",
  description: "Personal accountability engine",
  icons: { icon: "/icon.png", apple: "/icon.png" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
