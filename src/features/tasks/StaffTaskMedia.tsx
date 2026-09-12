import { useEffect, useState } from 'react'
import { resolveStaffMediaSrc } from '../../lib/staffTaskMedia'

type Props = {
  src: string
  alt?: string
  className?: string
  download?: string
  as?: 'img' | 'audio' | 'a'
}

/** Показывает media: data URL сразу, blob-path — после авторизованной загрузки. */
export function StaffTaskMedia({ src, alt = '', className, download, as = 'img' }: Props) {
  const immediate =
    src.startsWith('data:') || src.startsWith('blob:') || /^https?:/i.test(src) ? src : ''
  const [href, setHref] = useState(immediate)

  useEffect(() => {
    let alive = true
    if (immediate) {
      setHref(immediate)
      return () => {
        alive = false
      }
    }
    setHref('')
    void resolveStaffMediaSrc(src).then((u: string) => {
      if (alive) setHref(u)
    })
    return () => {
      alive = false
    }
  }, [src, immediate])

  if (!href) return null
  if (as === 'audio') {
    return <audio className={className} controls preload="metadata" src={href} />
  }
  if (as === 'a') {
    return (
      <a className={className} href={href} download={download} target="_blank" rel="noreferrer">
        {download || alt || 'Файл'}
      </a>
    )
  }
  return <img className={className} src={href} alt={alt} />
}
