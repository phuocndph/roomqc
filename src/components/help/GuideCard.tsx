import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  ChevronRight, ArrowRight, Lightbulb, AlertTriangle, 
  Info, CheckCircle2, BookOpen
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type HelpGuide } from '@/data/helpGuides'

export const GuideCard = ({ guide }: { guide: HelpGuide }) => {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const Icon = guide.icon

  return (
    <div className="border rounded-lg">
      <button
        type="button"
        className="w-full flex items-center gap-3 p-3 text-left hover:bg-accent/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{guide.title}</p>
          <p className="text-xs text-muted-foreground truncate">{guide.description}</p>
        </div>
        <ChevronRight className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`} />
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Detailed description */}
          {guide.detailedDescription && (
            <div className="bg-muted/50 rounded-md p-2.5">
              <div className="flex items-start gap-2">
                <BookOpen className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">{guide.detailedDescription}</p>
              </div>
            </div>
          )}

          {/* Prerequisites */}
          {guide.prerequisites && guide.prerequisites.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-950/20 rounded-md p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Điều kiện trước khi thực hiện</span>
              </div>
              {guide.prerequisites.map((pre, idx) => (
                <p key={idx} className="text-xs text-blue-700 dark:text-blue-400">• {pre}</p>
              ))}
            </div>
          )}

          {/* Steps */}
          <div className="space-y-3 pl-2 border-l-2 border-primary/20 ml-4">
            {guide.steps.map((step, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex gap-2">
                  <span className="text-xs font-mono text-primary font-medium shrink-0 mt-0.5">
                    {idx + 1}.
                  </span>
                  <div className="space-y-1 flex-1">
                    <p className="text-sm font-medium">{step.title}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                    
                    {/* Detailed step description */}
                    {step.detailedDescription && (
                      <p className="text-xs text-muted-foreground/80 leading-relaxed mt-1">
                        {step.detailedDescription}
                      </p>
                    )}

                    {/* Step warnings */}
                    {step.warnings && step.warnings.length > 0 && (
                      <div className="mt-1.5 space-y-0.5">
                        {step.warnings.map((warning, wIdx) => (
                          <div key={wIdx} className="flex items-start gap-1.5">
                            <AlertTriangle className="h-3 w-3 text-red-500 mt-0.5 shrink-0" />
                            <p className="text-xs text-red-600 dark:text-red-400">{warning}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Step note */}
                    {step.note && (
                      <div className="flex items-start gap-1.5 mt-1.5">
                        <Info className="h-3 w-3 text-blue-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-blue-600 dark:text-blue-400">{step.note}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tips */}
          {guide.tips && guide.tips.length > 0 && (
            <div className="bg-amber-50 dark:bg-amber-950/20 rounded-md p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <Lightbulb className="h-3.5 w-3.5 text-amber-600" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-500">Mẹo</span>
              </div>
              {guide.tips.map((tip, idx) => (
                <p key={idx} className="text-xs text-amber-700 dark:text-amber-400">• {tip}</p>
              ))}
            </div>
          )}

          {/* Important Notes */}
          {guide.importantNotes && guide.importantNotes.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950/20 rounded-md p-2.5 space-y-1">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600" />
                <span className="text-xs font-medium text-red-700 dark:text-red-400">Lưu ý quan trọng</span>
              </div>
              {guide.importantNotes.map((note, idx) => (
                <p key={idx} className="text-xs text-red-700 dark:text-red-400">• {note}</p>
              ))}
            </div>
          )}

          {guide.navigateTo && (
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => navigate(guide.navigateTo!)}
            >
              <ArrowRight className="h-3 w-3 mr-1.5" />
              Đi tới trang
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
