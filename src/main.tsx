import { StrictMode, useEffect, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'

const AppComponent = App as unknown as () => ReactElement

export function ThemeLock(): null {
  useEffect(() => {
    const applyLightThemeLock = () => {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
      document.documentElement.setAttribute('data-theme', 'light')
      document.body.classList.remove('dark')
      document.body.classList.add('light')
      document.body.setAttribute('data-theme', 'light')
    }

    applyLightThemeLock()

    const observer = new MutationObserver(() => {
      applyLightThemeLock()
    })

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => observer.disconnect()
  }, [])

  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeLock />
    <AppComponent />
    <Analytics />
  </StrictMode>,
)
