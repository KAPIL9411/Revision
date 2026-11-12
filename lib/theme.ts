export type ThemeChoice = 'light' | 'dark' | 'system'

export const THEME_STORAGE_KEY = 'vault:theme'
export const THEME_EVENT = 'vault:theme'

export function readThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system'
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

function prefersDark() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'dark') return 'dark'
  if (choice === 'light') return 'light'
  return prefersDark() ? 'dark' : 'light'
}

export function applyTheme(choice: ThemeChoice) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(choice)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
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
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');var d=c==='dark'||((!c||c==='system')&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;if(d){r.classList.add('dark');}r.style.colorScheme=d?'dark':'light';}catch(e){}})()`
