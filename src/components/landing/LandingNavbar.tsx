import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/contexts/AuthContext'
import { Button } from '@/components/ui/button'
import { Menu, X } from 'lucide-react'
import logoRoomQc from '@/assets/logo-roomqc.png'

export const LandingNavbar = () => {
  const { t } = useTranslation('landing')
  const { isAuthenticated } = useAuth()
  const [mobileOpen, setMobileOpen] = useState(false)

  const navLinks = [
    { label: t('nav.features'), href: '#features' },
    { label: t('nav.pricing'), href: '#pricing' },
    { label: t('nav.contact'), href: '#contact' },
  ]

  const scrollTo = (href: string) => {
    setMobileOpen(false)
    const el = document.querySelector(href)
    el?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-[hsl(215,28%,17%)]/95 backdrop-blur-md border-b border-[hsl(215,20%,25%)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src={logoRoomQc} alt="RoomQc" className="h-7 w-7 rounded-md object-cover" />
            <span className="text-lg font-bold text-white">RoomQc</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-6">
            {navLinks.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => scrollTo(link.href)}
                className="text-sm text-[hsl(210,40%,80%)] hover:text-white transition-colors"
              >
                {link.label}
              </button>
            ))}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {isAuthenticated ? (
              <Button asChild size="sm">
                <Link to="/">{t('nav.dashboard')}</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" asChild className="text-[hsl(210,40%,80%)] hover:text-white hover:bg-[hsl(215,25%,23%)]">
                  <Link to="/auth/login">{t('nav.login')}</Link>
                </Button>
                <Button size="sm" asChild>
                  <Link to="/auth/register">{t('nav.register')}</Link>
                </Button>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            type="button"
            className="md:hidden text-white p-2"
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="md:hidden bg-[hsl(215,28%,17%)] border-t border-[hsl(215,20%,25%)] px-4 pb-4">
          <div className="flex flex-col gap-2 pt-3">
            {navLinks.map((link) => (
              <button
                key={link.href}
                type="button"
                onClick={() => scrollTo(link.href)}
                className="text-sm text-[hsl(210,40%,80%)] hover:text-white py-2 text-left"
              >
                {link.label}
              </button>
            ))}
            <div className="border-t border-[hsl(215,20%,25%)] pt-3 mt-2 flex flex-col gap-2">
              {isAuthenticated ? (
                <Button asChild size="sm">
                  <Link to="/">{t('nav.dashboard')}</Link>
                </Button>
              ) : (
                <>
                  <Button variant="ghost" size="sm" asChild className="text-[hsl(210,40%,80%)] justify-start">
                    <Link to="/auth/login">{t('nav.login')}</Link>
                  </Button>
                  <Button size="sm" asChild>
                    <Link to="/auth/register">{t('nav.register')}</Link>
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
