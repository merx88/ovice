// Shared material instances: every mesh of the same finish reuses one material.
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { tokens } from '../theme/tokens'

/**
 * How shiny each finish is. Nothing in the room is mirror-sharp: highlights
 * are broad and soft, and metal is told from plastic by what it mirrors, not
 * by how crisply it mirrors it.
 */
const FINISH = {
  /** The bookshelf's frame. */
  chrome: { roughness: 0.375 },
  /** The inflated armchair. */
  silver: { roughness: 0.46 },
  /** Toy plastic: satin, with no coat over it. */
  glossy: { roughness: 0.6 },
  matte: { roughness: 0.875 },
} as const

/**
 * Polished metal with a satin finish (bookshelf frame). It has no color of
 * its own: it is white and shows whatever the studio puts in front of it.
 */
export const chrome = new MeshPhysicalMaterial({ color: tokens.white, metalness: 1, ...FINISH.chrome })

/** Balloon-like metal (the inflated armchair), a little softer and grayer than chrome. */
export const silver = new MeshPhysicalMaterial({ color: tokens.chrome, metalness: 1, ...FINISH.silver })

const glossyByColor = new Map<string, MeshPhysicalMaterial>()
const matteByColor = new Map<string, MeshStandardMaterial>()

/** Toy plastic with a soft sheen, in the given token color. */
export function glossy(color: string): MeshPhysicalMaterial {
  let material = glossyByColor.get(color)
  if (!material) {
    material = new MeshPhysicalMaterial({ color, ...FINISH.glossy })
    glossyByColor.set(color, material)
  }
  return material
}

/** Soft surface without sheen (book covers, leaves, the laptop shell). */
export function matte(color: string): MeshStandardMaterial {
  let material = matteByColor.get(color)
  if (!material) {
    material = new MeshStandardMaterial({ color, ...FINISH.matte })
    matteByColor.set(color, material)
  }
  return material
}
