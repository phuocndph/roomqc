import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Plus, X, PackagePlus, PackageMinus, ClipboardList, QrCode } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { QuickEntrySheet } from './QuickEntrySheet'

interface FABAction {
  icon: React.ElementType
  label: string
  onClick: () => void
  color: string
}

export function MobileInventoryFAB() {
  const navigate = useNavigate()
  const { t } = useTranslation('inventory')
  const [isOpen, setIsOpen] = useState(false)
  const [quickEntryType, setQuickEntryType] = useState<'in' | 'out' | null>(null)

  const actions: FABAction[] = [
    {
      icon: PackagePlus,
      label: t('quickEntry.quickInbound'),
      onClick: () => {
        setIsOpen(false)
        setQuickEntryType('in')
      },
      color: 'bg-blue-500',
    },
    {
      icon: PackageMinus,
      label: t('quickEntry.quickOutbound'),
      onClick: () => {
        setIsOpen(false)
        setQuickEntryType('out')
      },
      color: 'bg-orange-500',
    },
    {
      icon: ClipboardList,
      label: t('adjustment.title'),
      onClick: () => {
        setIsOpen(false)
        navigate('/inventory/adjustments/new')
      },
      color: 'bg-purple-500',
    },
    {
      icon: QrCode,
      label: t('quickEntry.scanCode'),
      onClick: () => {
        setIsOpen(false)
        toast.info(t('quickEntry.scanDeveloping'))
      },
      color: 'bg-emerald-500',
    },
  ]

  return (
    <>
      {/* Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
          />
        )}
      </AnimatePresence>

      {/* FAB Container */}
      <div className="fixed bottom-20 right-4 z-50 flex flex-col-reverse items-end gap-3">
        {/* Action buttons */}
        <AnimatePresence>
          {isOpen && actions.map((action, index) => (
            <motion.div
              key={action.label}
              initial={{ opacity: 0, y: 20, scale: 0.8 }}
              animate={{ 
                opacity: 1, 
                y: 0, 
                scale: 1,
                transition: { delay: index * 0.05 }
              }}
              exit={{ 
                opacity: 0, 
                y: 10, 
                scale: 0.8,
                transition: { delay: (actions.length - index - 1) * 0.03 }
              }}
              className="flex items-center gap-3"
            >
              <span className="px-3 py-1.5 rounded-lg bg-background shadow-lg text-sm font-medium whitespace-nowrap">
                {action.label}
              </span>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={action.onClick}
                className={cn(
                  "flex items-center justify-center w-12 h-12 rounded-full shadow-lg text-white",
                  action.color
                )}
              >
                <action.icon className="h-5 w-5" />
              </motion.button>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Main FAB */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "flex items-center justify-center w-14 h-14 rounded-full shadow-xl text-white transition-colors",
            isOpen ? "bg-muted-foreground" : "bg-primary"
          )}
        >
          <motion.div
            animate={{ rotate: isOpen ? 45 : 0 }}
            transition={{ duration: 0.2 }}
          >
            {isOpen ? <X className="h-6 w-6" /> : <Plus className="h-6 w-6" />}
          </motion.div>
        </motion.button>
      </div>

      {/* Quick Entry Sheet */}
      <QuickEntrySheet
        open={quickEntryType !== null}
        onOpenChange={(open) => !open && setQuickEntryType(null)}
        type={quickEntryType || 'in'}
      />
    </>
  )
}
