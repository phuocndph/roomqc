import { useNavigate } from 'react-router-dom'
import { PackagePlus, PackageMinus } from 'lucide-react'
import { motion } from 'framer-motion'

export function MobilePrimaryActions() {
  const navigate = useNavigate()

  return (
    <div className="px-4">
      <div className="grid grid-cols-2 gap-3">
        <motion.button
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/inventory/inbound/new')}
          className="relative overflow-hidden flex items-center justify-center gap-3 h-16 rounded-2xl bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-lg shadow-blue-500/30 active:shadow-md transition-shadow"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
          <PackagePlus className="h-6 w-6 relative z-10" />
          <span className="text-base font-semibold relative z-10">Nhập kho</span>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => navigate('/inventory/outbound/new')}
          className="relative overflow-hidden flex items-center justify-center gap-3 h-16 rounded-2xl bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-lg shadow-orange-500/30 active:shadow-md transition-shadow"
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent" />
          <div className="absolute -right-4 -top-4 w-20 h-20 bg-white/10 rounded-full blur-xl" />
          <PackageMinus className="h-6 w-6 relative z-10" />
          <span className="text-base font-semibold relative z-10">Xuất kho</span>
        </motion.button>
      </div>
    </div>
  )
}
