import { BusyIndicator, Text } from '@ui5/webcomponents-react'

interface AppLoadingStateProps {
  label: string
  variant?: 'fullscreen' | 'panel' | 'inline' | 'compact'
  className?: string
}

export default function AppLoadingState({
  label,
  variant = 'panel',
  className = '',
}: AppLoadingStateProps) {
  const classes = [
    'app-loading-state',
    `app-loading-state--${variant}`,
    className,
  ].filter(Boolean).join(' ')

  return (
    <div className={classes} role="status" aria-live="polite" aria-label={label}>
      <BusyIndicator active size={variant === 'inline' || variant === 'compact' ? 'S' : 'M'} />
      <Text className="app-loading-state__label">{label}</Text>
    </div>
  )
}
