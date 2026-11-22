// How long a plan runs, as a person says it: 12 months is 1 year, 24 months 2 years, anything else in months
export function monthsLabel(t: (key: string, params?: Record<string, string | number>) => string, months: number): string {
  if (months > 0 && months % 12 === 0) {
    const years = months / 12
    return years === 1 ? t('order.duration.year') : t('order.duration.years', { count: years })
  }
  return months === 1 ? t('order.duration.month') : t('order.duration.months', { count: months })
}
