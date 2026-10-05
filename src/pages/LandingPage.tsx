import { lazy, Suspense } from 'react'
import { LandingNavbar } from '@/components/landing/LandingNavbar'
import { HeroSection } from '@/components/landing/HeroSection'
import { SectionErrorBoundary } from '@/components/SectionErrorBoundary'

const FeaturesSection = lazy(() =>
  import('@/components/landing/FeaturesSection').then((m) => ({ default: m.FeaturesSection }))
)
const PricingSection = lazy(() =>
  import('@/components/landing/PricingSection').then((m) => ({ default: m.PricingSection }))
)
const FooterSection = lazy(() =>
  import('@/components/landing/FooterSection').then((m) => ({ default: m.FooterSection }))
)

const SectionSkeleton = () => <div className="min-h-[40vh]" aria-hidden="true" />

const LandingPage = () => {
  return (
    <div className="min-h-screen">
      <SectionErrorBoundary name="navbar"><LandingNavbar /></SectionErrorBoundary>
      <SectionErrorBoundary name="hero"><HeroSection /></SectionErrorBoundary>
      <SectionErrorBoundary name="features">
        <Suspense fallback={<SectionSkeleton />}>
          <FeaturesSection />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary name="pricing">
        <Suspense fallback={<SectionSkeleton />}>
          <PricingSection />
        </Suspense>
      </SectionErrorBoundary>
      <SectionErrorBoundary name="footer">
        <Suspense fallback={<SectionSkeleton />}>
          <FooterSection />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  )
}

export default LandingPage
