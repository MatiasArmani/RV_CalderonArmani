import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { Providers } from '@/components/providers'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
})

export const metadata: Metadata = {
  title: 'EquipAR - Plataforma Industrial 3D & AR',
  description: 'Gestiona modelos 3D industriales y crea experiencias de realidad aumentada para tu empresa.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" className={inter.variable}>
      <body className="min-h-screen bg-background antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
