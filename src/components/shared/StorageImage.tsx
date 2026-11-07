import { forwardRef, useEffect, useState, type AnchorHTMLAttributes, type ImgHTMLAttributes } from 'react'
import { cachedStorageUrl, resolveStorageUrl } from '@/lib/storageImageUrl'

/** Resolve a stored file value to a URL the browser can open (signed for the
 * private item-images bucket, unchanged otherwise). */
export function useStorageUrl(value: string | null | undefined): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => cachedStorageUrl(value) ?? undefined)
  useEffect(() => {
    let alive = true
    const now = cachedStorageUrl(value)
    setUrl(now ?? undefined)
    if (!now && value) {
      void resolveStorageUrl(value).then((next) => { if (alive) setUrl(next ?? undefined) })
    }
    return () => { alive = false }
  }, [value])
  return url
}

/** Drop-in replacement for <img> for user-uploaded images. */
export const StorageImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  function StorageImage({ src, ...rest }, ref) {
    const url = useStorageUrl(typeof src === 'string' ? src : undefined)
    return <img ref={ref} src={url} {...rest} />
  },
)

/** Drop-in replacement for <a href> pointing at an uploaded file. */
export const StorageLink = forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(
  function StorageLink({ href, ...rest }, ref) {
    const url = useStorageUrl(href)
    return <a ref={ref} href={url} aria-disabled={!url} {...rest} />
  },
)
