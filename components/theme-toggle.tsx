"use client"

import * as React from "react"
import { MoonIcon, SunIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTheme } from "@/components/theme-provider"

function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme()
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])
  const isDark = theme === "dark"
  if (!mounted) {
    return (
      <Button type="button" variant="ghost" size="icon" className={className} aria-label="Toggle theme" disabled>
        <MoonIcon />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={className}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggle}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

export { ThemeToggle }
