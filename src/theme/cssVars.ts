import { tokens } from './tokens'

/** The custom property a stylesheet reads a colour token from: `uiOrange` → `--c-ui-orange`. */
export function cssVarName(token: string): string {
  return `--c-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`
}

/**
 * Hands every colour token to the stylesheets as a custom property, so that
 * CSS never has to spell a colour out. Call it once, before the first render.
 */
export function applyCssVars(root: HTMLElement = document.documentElement): void {
  for (const [token, value] of Object.entries(tokens)) root.style.setProperty(cssVarName(token), value)
}
