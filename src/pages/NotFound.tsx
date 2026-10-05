import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Home } from 'lucide-react'

export default function NotFound() {
  const { t } = useTranslation('common')
  
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <h1 className="text-9xl font-bold text-muted-foreground">{t('notFound.title')}</h1>
      <h2 className="mt-4 text-2xl font-semibold">{t('notFound.heading')}</h2>
      <p className="mt-2 text-muted-foreground">
        {t('notFound.description')}
      </p>
      <Button asChild className="mt-6">
        <Link to="/">
          <Home className="mr-2 h-4 w-4" />
          {t('notFound.goHome')}
        </Link>
      </Button>
    </div>
  )
}
