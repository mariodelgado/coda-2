import type { Metadata } from "next"
import { Geist, Geist_Mono, IBM_Plex_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { ThemeProvider } from "@/components/theme-provider"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

// Instrument-grade monospace for all readouts, fidelities, temps, traces.
// IBM Plex Mono has excellent optical sizes and tabular figures.
const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
})

export const metadata: Metadata = {
  title: "Conductor QPU",
  description: "Quantum instrument control plane — real traces, drift surface, calibration.",
  icons: { icon: "/favicon.ico" },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${ibmPlexMono.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-[#0a0a0b] font-sans text-zinc-200 antialiased">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} forcedTheme="dark">
          {children}
          <Toaster position="top-center" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  )
}
