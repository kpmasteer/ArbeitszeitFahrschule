import type { CSSProperties } from 'react'

interface LogoProps {
  readonly compact?: boolean
  readonly inverse?: boolean
}

export function Logo({ compact = false, inverse = false }: LogoProps) {
  const color = inverse ? '#fff8f2' : '#b4232d'
  return (
    <div className={`logo ${compact ? 'logo--compact' : ''}`} aria-label="Fahrschulzeit">
      <span className="logo__sign" style={{ '--logo-color': color } as CSSProperties} aria-hidden="true">
        <span>F</span>
      </span>
      {!compact && (
        <span className="logo__wordmark">
          <strong>Fahrschul</strong>
          <span>zeit</span>
        </span>
      )}
    </div>
  )
}
