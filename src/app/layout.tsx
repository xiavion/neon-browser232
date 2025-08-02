import "./globals.css"

import type { Metadata } from "next"
import { Inter } from "next/font/google"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Xiavion Browser",
  description: "Özelleştirilmiş neon tarayıcı",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="tr">
      <body className={inter.className + " min-h-screen bg-background text-foreground"}>
        {children}
      </body>
    </html>
  )
}
