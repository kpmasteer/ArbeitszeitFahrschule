import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

interface StatCardProps {
  readonly icon: LucideIcon
  readonly label: string
  readonly value: ReactNode
  readonly helper?: ReactNode
  readonly tone?: 'red' | 'blue' | 'green' | 'amber' | 'neutral'
  readonly featured?: boolean
}

export function StatCard({ icon: Icon, label, value, helper, tone = 'neutral', featured = false }: StatCardProps) {
  return (
    <article className={`stat-card stat-card--${tone} ${featured ? 'stat-card--featured' : ''}`}>
      <div className="stat-card__top">
        <span className="stat-card__icon"><Icon size={18} strokeWidth={1.9} /></span>
        <span className="stat-card__label">{label}</span>
      </div>
      <strong className="stat-card__value">{value}</strong>
      {helper && <span className="stat-card__helper">{helper}</span>}
    </article>
  )
}
