import { ReactNode, ComponentType, useMemo } from 'react'
import { useSearchParams, Navigate } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/shared/PageHeader'
import { useBreakpoint } from '@/lib/breakpoints'

export interface HubTab {
  id: string
  label: string
  /** Provide either a Component (no props) or a render function. */
  Component?: ComponentType
  render?: () => ReactNode
}

interface Props {
  title: string
  description?: string
  question?: string
  tabs: HubTab[]
  defaultTab?: string
  /** Optional content rendered above tabs (e.g. KPI scorecard strip). */
  scorecard?: ReactNode
}

/**
 * Generic shell for consolidated report hubs.
 * - Single PageHeader at top with the operational question.
 * - Sticky tab strip backed by `?tab=` query param so old URLs can redirect.
 * - Each tab renders an existing report page component unmodified.
 *   (Each existing page already provides its own filters/header which act as the
 *   tab's section header. Visual unification will come later.)
 */
export function ReportHubShell({
  title,
  description,
  question,
  tabs,
  defaultTab,
  scorecard,
}: Props) {
  const [params, setParams] = useSearchParams()
  const { isMobile } = useBreakpoint()
  const initial = defaultTab ?? tabs[0]?.id

  const current = useMemo(() => {
    const t = params.get('tab')
    if (t && tabs.some((x) => x.id === t)) return t
    return initial
  }, [params, tabs, initial])

  if (!tabs.length) return <Navigate to="/reports" replace />

  const handleChange = (val: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', val)
    setParams(next, { replace: true })
  }

  return (
    <div className="space-y-4">
      {!isMobile && (
        <PageHeader title={title} description={question ?? description} />
      )}

      {scorecard}

      <Tabs value={current} onValueChange={handleChange} className="space-y-4">
        <div className="sticky top-0 z-10 bg-background -mx-4 px-4 py-2 border-b">
          <TabsList className="h-9">
            {tabs.map((t) => (
              <TabsTrigger key={t.id} value={t.id} className="text-xs">
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((t) => {
          const C = t.Component
          return (
            <TabsContent key={t.id} value={t.id} className="mt-0">
              {t.render ? t.render() : C ? <C /> : null}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
