import { StrictMode } from 'react'
import type { ReactElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Analytics } from '@vercel/analytics/react'
import './index.css'
import App from './App.tsx'

const AppComponent = App as unknown as () => ReactElement

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppComponent />
    <Analytics />
  </StrictMode>,
)
