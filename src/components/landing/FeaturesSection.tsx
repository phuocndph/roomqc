import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import {
  BedDouble,
  Package,
  WashingMachine,
  Wrench,
  CalendarCheck,
  BarChart3,
  Truck,
  Building2,
} from 'lucide-react'

const featureKeys = [
  { key: 'rooms', icon: BedDouble },
  { key: 'inventory', icon: Package },
  { key: 'laundry', icon: WashingMachine },
  { key: 'maintenance', icon: Wrench },
  { key: 'bookings', icon: CalendarCheck },
  { key: 'reports', icon: BarChart3 },
  { key: 'distribution', icon: Truck },
  { key: 'multiHotel', icon: Building2 },
] as const

export const FeaturesSection = () => {
  const { t } = useTranslation('landing')

  return (
    <section id="features" className="py-14 sm:py-24 bg-[hsl(var(--background))]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-16">
          <h2 className="text-2xl sm:text-4xl font-bold text-foreground">
            {t('features.title')}
          </h2>
          <p className="mt-3 text-sm sm:text-base text-muted-foreground">
            {t('features.subtitle')}
          </p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          {featureKeys.map(({ key, icon: Icon }, i) => (
            <motion.div
              key={key}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1, margin: '-50px' }}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group p-5 rounded-lg border bg-card hover:shadow-md transition-all"
            >
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-sm">
                {t(`features.${key}.title`)}
              </h3>
              <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                {t(`features.${key}.description`)}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
