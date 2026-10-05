import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle, ArrowRight, Lightbulb, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { contextualHelpMap, type ContextualHelpItem } from '@/data/contextualHelp'
import { helpGuides } from '@/data/helpGuides'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function findHelpForPath(pathname: string): ContextualHelpItem | null {
  // Exact match first
  if (contextualHelpMap[pathname]) return contextualHelpMap[pathname]
  
  // Try parent paths: /inventory/inbound -> /inventory -> /
  const parts = pathname.split('/').filter(Boolean)
  for (let i = parts.length - 1; i >= 0; i--) {
    const parentPath = '/' + parts.slice(0, i).join('/')
    if (contextualHelpMap[parentPath]) return contextualHelpMap[parentPath]
  }
  return null
}

export const ContextualHelpButton = () => {
  const [open, setOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  
  const helpContent = findHelpForPath(location.pathname)
  
  if (!helpContent) return null

  const relatedGuides = helpContent.relatedGuideIds
    ?.map(id => {
      for (const role of helpGuides) {
        const guide = role.guides.find(g => g.id === id)
        if (guide) return guide
      }
      return null
    })
    .filter(Boolean) ?? []

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            onClick={() => setOpen(true)}
          >
            <HelpCircle className="h-4 w-4 text-muted-foreground" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Hướng dẫn trang này</TooltipContent>
      </Tooltip>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5 text-primary" />
              {helpContent.title}
            </SheetTitle>
            <SheetDescription>{helpContent.description}</SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-5">
            {/* Quick steps */}
            <div>
              <h4 className="text-sm font-semibold mb-2">Thao tác nhanh</h4>
              <div className="space-y-1.5 pl-2 border-l-2 border-primary/20">
                {helpContent.quickSteps.map((step, idx) => (
                  <div key={idx} className="flex gap-2">
                    <span className="text-xs font-mono text-primary font-medium shrink-0 mt-0.5">
                      {idx + 1}.
                    </span>
                    <p className="text-sm">{step}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tips */}
            {helpContent.tips && helpContent.tips.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-950/20 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-700 dark:text-amber-500">Mẹo hữu ích</span>
                </div>
                {helpContent.tips.map((tip, idx) => (
                  <p key={idx} className="text-xs text-amber-700 dark:text-amber-400">• {tip}</p>
                ))}
              </div>
            )}

            {/* Related guides */}
            {relatedGuides.length > 0 && (
              <div>
                <h4 className="text-sm font-semibold mb-2">Hướng dẫn chi tiết</h4>
                <div className="space-y-1.5">
                  {relatedGuides.map(guide => {
                    if (!guide) return null
                    const Icon = guide.icon
                    return (
                      <button
                        key={guide.id}
                        type="button"
                        className="w-full flex items-center gap-2.5 p-2.5 rounded-lg border hover:bg-accent/50 transition-colors text-left"
                        onClick={() => {
                          setOpen(false)
                          navigate('/help')
                        }}
                      >
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="text-sm flex-1">{guide.title}</span>
                        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Link to full help */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                setOpen(false)
                navigate('/help')
              }}
            >
              <BookOpen className="h-4 w-4 mr-2" />
              Xem tất cả hướng dẫn
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
