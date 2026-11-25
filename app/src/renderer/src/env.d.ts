/// <reference types="vite/client" />
import type { CakappApi } from '../../shared/types'

declare global {
  interface Window {
    yogurt: CakappApi
    Cakapp: CakappApi
  }
}
