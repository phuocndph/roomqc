/**
 * Chuyển số điện thoại VN sang format quốc tế cho Telegram
 * 0383792864 → +84383792864
 * 84383792864 → +84383792864
 * +84383792864 → +84383792864
 */
export function formatPhoneForTelegram(phone: string): string | null {
  if (!phone) return null
  
  // Loại bỏ ký tự không phải số và dấu +
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  // Nếu đã có +84
  if (cleaned.startsWith('+84')) {
    return cleaned
  }
  
  // Nếu bắt đầu bằng 84 (không có +)
  if (cleaned.startsWith('84') && cleaned.length >= 11) {
    return '+' + cleaned
  }
  
  // Nếu bắt đầu bằng 0 (format VN local)
  if (cleaned.startsWith('0')) {
    return '+84' + cleaned.slice(1)
  }
  
  // Trường hợp khác, thử thêm +84 nếu đủ 9 số
  if (cleaned.length === 9) {
    return '+84' + cleaned
  }
  
  return null
}

/**
 * Tạo Telegram deep link từ số điện thoại
 * Dùng tg:// protocol để mở app trực tiếp
 */
export function getTelegramPhoneLink(phone: string): string | null {
  const formatted = formatPhoneForTelegram(phone)
  if (!formatted) return null
  
  // Loại bỏ dấu + để dùng trong tg:// protocol
  const phoneWithoutPlus = formatted.replace('+', '')
  return `tg://resolve?phone=${phoneWithoutPlus}`
}

/**
 * Thử mở Telegram app, nếu thất bại thì gọi callback
 * Dùng kỹ thuật: nếu sau 1s trang vẫn visible → app không mở được
 */
export function openTelegramWithFallback(
  telegramUrl: string, 
  onFallback: () => void
): void {
  const start = Date.now()
  
  // Đặt timeout để kiểm tra sau 1 giây
  const timeout = setTimeout(() => {
    // Nếu page vẫn visible sau 1s → app không mở được
    if (!document.hidden && Date.now() - start < 2000) {
      onFallback()
    }
  }, 1000)
  
  // Thử mở app
  window.location.href = telegramUrl
  
  // Nếu app mở thành công, page sẽ bị blur/hidden
  const handleVisibilityChange = () => {
    if (document.hidden) {
      clearTimeout(timeout)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }
  document.addEventListener('visibilitychange', handleVisibilityChange)
}

/**
 * Lấy link tải Telegram phù hợp với thiết bị
 */
export function getTelegramDownloadLink(): string {
  const userAgent = navigator.userAgent.toLowerCase()
  
  if (/android/i.test(userAgent)) {
    return 'https://play.google.com/store/apps/details?id=org.telegram.messenger'
  }
  if (/iphone|ipad|ipod/i.test(userAgent)) {
    return 'https://apps.apple.com/app/telegram-messenger/id686449807'
  }
  // Desktop - trang download chung
  return 'https://desktop.telegram.org/'
}
