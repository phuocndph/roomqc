import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ArrowRight, Sparkles } from 'lucide-react'
// LazyMotion + domAnimation: tải tree-shaken bản mini của Framer Motion
// (~12KB thay vì ~120KB) — chỉ Hero của landing page cần animate.
import { LazyMotion, domAnimation, m } from 'framer-motion'

export const HeroSection = () => {
  const { t } = useTranslation('landing')

  return (
    <LazyMotion features={domAnimation} strict>
      <section className="relative min-h-[80svh] sm:min-h-[90vh] flex items-center pt-16 overflow-hidden bg-gradient-to-br from-[hsl(215,28%,12%)] via-[hsl(215,28%,17%)] to-[hsl(220,30%,20%)]">
        <div className="absolute inset-0 bg-[linear-gradient(hsl(214,84%,56%,0.03)_1px,transparent_1px),linear-gradient(90deg,hsl(214,84%,56%,0.03)_1px,transparent_1px)] bg-[size:60px_60px]" />
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[hsl(214,84%,56%,0.08)] rounded-full blur-[120px]" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[hsl(192,85%,50%,0.06)] rounded-full blur-[120px]" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-20">
          <div className="max-w-3xl mx-auto text-center">
            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <span className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-medium bg-[hsl(214,84%,56%,0.1)] text-[hsl(214,84%,70%)] border border-[hsl(214,84%,56%,0.2)]">
                <Sparkles className="h-3.5 w-3.5" />
                {t('hero.badge')}
              </span>
            </m.div>

            <m.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="mt-6 text-3xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white leading-tight"
            >
              {t('hero.title')}{' '}
              <span className="bg-gradient-to-r from-[hsl(214,84%,56%)] to-[hsl(192,85%,50%)] bg-clip-text text-transparent">
                {t('hero.titleHighlight')}
              </span>
            </m.h1>

            <m.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="mt-5 text-base sm:text-lg text-[hsl(210,20%,65%)] max-w-2xl mx-auto leading-relaxed"
            >
              {t('hero.subtitle')}
            </m.p>

            <m.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3"
            >
              <Button size="lg" asChild className="text-base px-8 h-12 w-full sm:w-auto shadow-lg shadow-[hsl(214,84%,56%,0.25)]">
                <Link to="/auth/register">
                  {t('hero.cta')}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-base px-8 h-12 w-full sm:w-auto border-[hsl(215,20%,30%)] bg-transparent text-white hover:bg-[hsl(215,25%,23%)] hover:text-white"
                onClick={() => document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' })}
              >
                {t('hero.ctaSecondary')}
              </Button>
            </m.div>

            <m.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="mt-4 text-xs text-[hsl(210,20%,50%)]"
            >
              {t('hero.noCard')}
            </m.p>
          </div>

          <m.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-10 sm:mt-20 grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-8 max-w-3xl mx-auto"
          >
            {[
              { value: '10,000+', label: t('stats.rooms') },
              { value: '200+', label: t('stats.hotels') },
              { value: '500K+', label: t('stats.transactions') },
              { value: '99.9%', label: t('stats.uptime') },
            ].map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-2xl sm:text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-[hsl(210,20%,50%)] mt-1">{stat.label}</p>
              </div>
            ))}
          </m.div>
        </div>
      </section>
    </LazyMotion>
  )
}
