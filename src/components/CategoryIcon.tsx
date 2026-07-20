import {
  BriefcaseBusiness,
  CircleGauge,
  ClipboardCheck,
  GraduationCap,
  Presentation,
  Route,
  Shapes,
} from 'lucide-react'
import type { CategoryIcon as CategoryIconName } from '../app/app-types'

const icons = {
  'steering-wheel': CircleGauge,
  presentation: Presentation,
  'clipboard-check': ClipboardCheck,
  briefcase: BriefcaseBusiness,
  route: Route,
  'graduation-cap': GraduationCap,
  shapes: Shapes,
}

interface CategoryIconProps {
  readonly name: CategoryIconName
  readonly size?: number
}

export function CategoryIcon({ name, size = 18 }: CategoryIconProps) {
  const Icon = icons[name]
  return <Icon size={size} strokeWidth={1.9} />
}
