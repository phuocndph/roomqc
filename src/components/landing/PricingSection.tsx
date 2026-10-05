import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

const plans = ['starter', 'professional', 'enterprise'] as const

export const PricingSection = () => {
  const { t } = useTranslation('landing')

  return (
    <section id="pricing" className="py-14 sm:py-24 bg-muted/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground">
            {t('pricing.title')}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            {t('pricing.subtitle')}
          </p>
        </div>

        {/* Cards */}
        <div className="grid md:grid-cols-3 gap-5 sm:gap-6 max-w-5xl mx-auto">
          {plans.map((plan, i) => {
            const isPro = plan === 'professional'
            const featuresRaw: unknown = t(`pricing.${plan}.features`, { returnObjects: true, defaultValue: [] }) as unknown
            // i18n có thể trả về array (đúng), string (bundle cũ), hoặc object — chuẩn hoá an toàn
            let features: string[] = []
            if (Array.isArray(featuresRaw)) {
              features = (featuresRaw as unknown[]).filter((v): v is string => typeof v === 'string')
            } else if (typeof featuresRaw === 'string') {
              features = (featuresRaw as string).split(/\r?\n|;|\|/).map((s) => s.trim()).filter(Boolean)
            } else if (featuresRaw && typeof featuresRaw === 'object') {
              features = Object.values(featuresRaw as Record<string, unknown>)
                .filter((v): v is string => typeof v === 'string')
            }




            return (
              <motion.div
                key={plan}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.4, delay: i * 0.1 }}
                className={cn(
                  'relative flex flex-col rounded-lg border p-5 sm:p-6',
                  isPro
                    ? 'border-primary bg-card sm:shadow-lg sm:shadow-primary/10 ring-1 ring-primary/20'
                    : 'bg-card'
                )}
              >
                {isPro && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-medium bg-primary text-primary-foreground">
                    {t('pricing.popular')}
                  </span>
                )}

                <div className="mb-6">
                  <h3 className="font-semibold text-foreground">{t(`pricing.${plan}.name`)}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{t(`pricing.${plan}.description`)}</p>
                </div>

                <div className="mb-6">
                  <span className="text-3xl font-bold text-foreground">
                    {t(`pricing.${plan}.price`)}
                  </span>
                  {plan === 'professional' && (
                    <span className="text-sm text-muted-foreground ml-1">{t('pricing.perRoom')}</span>
                  )}
                </div>

                <ul className="flex-1 space-y-2.5 mb-6 sm:mb-8">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-xs text-foreground">
                      <Check className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                      {feature}
                    </li>
                  ))}
                </ul>

                {plan === 'enterprise' ? (
                  <Button variant="outline" className="w-full" asChild>
                    <a href="mailto:roomqc@gmail.com">{t('pricing.ctaEnterprise')}</a>
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isPro ? 'default' : 'outline'}
                    asChild
                  >
                    <Link to="/auth/register">{t('pricing.cta')}</Link>
                  </Button>
                )}
              </motion.div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
