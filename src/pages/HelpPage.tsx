import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { 
  HelpCircle, 
  Search
} from 'lucide-react'
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { helpGuides, type HelpGuide } from '@/data/helpGuides'
import { GuideCard } from '@/components/help/GuideCard'
import { useBreakpoint } from '@/lib/breakpoints'

export default function HelpPage() {
  const { t } = useTranslation('common')
  const { isMobile } = useBreakpoint()
  const [searchQuery, setSearchQuery] = useState('')

  const filterGuides = (guides: HelpGuide[]) => {
    if (!searchQuery.trim()) return guides
    const q = searchQuery.toLowerCase()
    return guides.filter(g =>
      g.title.toLowerCase().includes(q) ||
      g.description.toLowerCase().includes(q) ||
      g.detailedDescription?.toLowerCase().includes(q) ||
      g.steps.some(s => 
        s.title.toLowerCase().includes(q) || 
        s.detailedDescription?.toLowerCase().includes(q)
      )
    )
  }

  if (isMobile) {
    return (
      <div className="min-h-screen bg-background pb-20">
        <div className="bg-gradient-to-br from-primary/10 via-primary/5 to-background border-b">
          <div className="px-4 py-6">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h1 className="text-xl font-bold">Hướng dẫn sử dụng</h1>
                <p className="text-xs text-muted-foreground">Chọn vai trò để xem hướng dẫn phù hợp</p>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 py-4 space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Tìm hướng dẫn..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-sm"
            />
          </div>

          <Accordion type="single" collapsible className="space-y-2">
            {helpGuides.map(role => {
              const filtered = filterGuides(role.guides)
              if (filtered.length === 0) return null
              return (
                <AccordionItem key={role.roleId} value={role.roleId} className="border rounded-lg px-3">
                  <AccordionTrigger className="py-3 text-sm font-semibold hover:no-underline">
                    <div className="text-left">
                      <p>{role.roleLabel}</p>
                      <p className="text-xs font-normal text-muted-foreground">{filtered.length} bài hướng dẫn</p>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="space-y-2 pb-3">
                    {filtered.map(guide => (
                      <GuideCard key={guide.id} guide={guide} />
                    ))}
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Hướng dẫn sử dụng</h1>
        <p className="mt-1 text-muted-foreground">Chọn vai trò để xem hướng dẫn các chức năng phù hợp</p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Tìm hướng dẫn..."
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          className="pl-9 h-9"
        />
      </div>

      <Tabs defaultValue="housekeeping">
        <TabsList className="w-full justify-start">
          {helpGuides.map(role => (
            <TabsTrigger key={role.roleId} value={role.roleId} className="text-sm">
              {role.roleLabel}
            </TabsTrigger>
          ))}
        </TabsList>

        {helpGuides.map(role => {
          const filtered = filterGuides(role.guides)
          return (
            <TabsContent key={role.roleId} value={role.roleId} className="space-y-3">
              <p className="text-sm text-muted-foreground">{role.roleDescription}</p>
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Không tìm thấy hướng dẫn phù hợp</p>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {filtered.map(guide => (
                    <GuideCard key={guide.id} guide={guide} />
                  ))}
                </div>
              )}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
