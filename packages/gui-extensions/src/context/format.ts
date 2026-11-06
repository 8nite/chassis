export function createSessionContextFormatter(locale: string) {
  
  const dateTime = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
  })

  return {
    number(value: number | null | undefined) {
      if (value === undefined) return "—"

      if (value === null) return "—"

      return value.toLocaleString(locale)
    },
    percent(value: number | null | undefined) {
      if (value === undefined) return "—"

      if (value === null) return "—"

      return value.toLocaleString(locale) + "%"
    },
    time(value: number | undefined) {
      if (!value) return "—"

      return dateTime.format(value)
    },
  }
}
