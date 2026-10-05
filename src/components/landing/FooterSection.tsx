import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { ArrowRight } from 'lucide-react'
import logoRoomQc from '@/assets/logo-roomqc.png'

export const FooterSection = () => {
  const { t } = useTranslation('landing')

  return (
    <>
      {/* CTA Section */}
      <section id="contact" className="py-20 sm:py-28 bg-gradient-to-br from-[hsl(215,28%,12%)] to-[hsl(220,30%,18%)] text-center">
        <div className="max-w-2xl mx-auto px-4">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            {t('cta.title')}
          </h2>
          <p className="mt-4 text-[hsl(210,20%,65%)]">
            {t('cta.subtitle')}
          </p>
          <Button size="lg" asChild className="mt-8 text-base px-8 h-12 shadow-lg shadow-[hsl(214,84%,56%,0.25)]">
            <Link to="/auth/register">
              {t('cta.button')}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[hsl(215,28%,10%)] text-[hsl(210,20%,60%)] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Brand */}
            <div>
              <Link to="/" className="flex items-center gap-2 mb-4">
                <img src={logoRoomQc} alt="RoomQc" className="h-6 w-6 rounded-md object-cover" />
                <span className="text-base font-bold text-white">RoomQc</span>
              </Link>
              <p className="text-xs leading-relaxed">{t('footer.description')}</p>
            </div>

            {/* Product */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('footer.product')}</h4>
              <ul className="space-y-2 text-xs">
                <li><button type="button" onClick={() => document.querySelector('#features')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">{t('nav.features')}</button></li>
                <li><button type="button" onClick={() => document.querySelector('#pricing')?.scrollIntoView({ behavior: 'smooth' })} className="hover:text-white transition-colors">{t('nav.pricing')}</button></li>
              </ul>
            </div>

            {/* Support */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('footer.support')}</h4>
              <ul className="space-y-2 text-xs">
                <li><span className="hover:text-white transition-colors cursor-pointer">{t('footer.helpCenter')}</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">{t('footer.documentation')}</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">{t('footer.contactUs')}</span></li>
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">{t('footer.legal')}</h4>
              <ul className="space-y-2 text-xs">
                <li><span className="hover:text-white transition-colors cursor-pointer">{t('footer.terms')}</span></li>
                <li><span className="hover:text-white transition-colors cursor-pointer">{t('footer.privacy')}</span></li>
              </ul>
            </div>
          </div>

          <div className="border-t border-[hsl(215,20%,18%)] mt-10 pt-6 text-center text-xs">
            {t('footer.copyright')}
          </div>
        </div>
      </footer>
    </>
  )
}
