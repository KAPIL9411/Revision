export type ThemeChoice = 'light'

export const THEME_STORAGE_KEY = 'vault:theme'
export const THEME_EVENT = 'vault:theme'

export function readThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'light'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' ? stored : 'light'
  } catch {
    return 'light'
  }
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  return 'light'
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('dark')
  root.style.colorScheme = 'light'
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    /* storage blocked: the class still applies for this session */
  }
  applyTheme(choice)
  window.dispatchEvent(new CustomEvent<ThemeChoice>(THEME_EVENT, { detail: choice }))
}

export function subscribeTheme(listener: () => void) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(THEME_EVENT, listener)
  return () => window.removeEventListener(THEME_EVENT, listener)
}

export function getThemeSnapshot(): ThemeChoice {
  return readThemeChoice()
}

/** Runs before first paint so a dark choice never flashes a white page. */
export const THEME_INIT_SCRIPT = `(function(){try{var r=document.documentElement;r.classList.remove('dark');r.style.colorScheme='light';}catch(e){}})()`