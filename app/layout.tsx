import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'SSC Revision Vault', template: '%s · SSC Revision Vault' },
  description:
    'A private, chapter-wise revision system for SSC CGL — capture questions, attach handwritten solutions and revise every chapter.',
  applicationName: 'SSC Revision Vault',
  appleWebApp: { capable: true, title: 'Revision Vault', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F8F5' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        {/* theme init removed — light only */}
      </head>
      <body>{children}</body>
    </html>
  )
}