// Shared material instances: every mesh of the same finish reuses one material.
import { MeshPhysicalMaterial, MeshStandardMaterial } from 'three'
import { tokens } from '../theme/tokens'

/**
 * Mirror-polished metal (bookshelf frame). A mirror has no color of its own:
 * it is white and shows whatever the studio puts in front of it.
 */
export const chrome = new MeshPhysicalMaterial({ color: tokens.white, metalness: 1, roughness: 0.15 })

/** Polished, balloon-like metal (the inflated armchair), a little softer and grayer than chrome. */
export const silver = new MeshPhysicalMaterial({ color: tokens.chrome, metalness: 1, roughness: 0.22 })

const glossyByColor = new Map<string, MeshPhysicalMaterial>()
const matteByColor = new Map<string, MeshStandardMaterial>()

/** Glossy toy plastic in the given token color. */
export function glossy(color: string): MeshPhysicalMaterial {
  let material = glossyByColor.get(color)
  if (!material) {
    material = new MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.12 })
    glossyByColor.set(color, material)
  }
  return material
}

/** Soft, low-sheen surface (book covers, leaves, the laptop shell). */
export function matte(color: string): MeshStandardMaterial {
  let material = matteByColor.get(color)
  if (!material) {
    material = new MeshStandardMaterial({ color, roughness: 0.65 })
    matteByColor.set(color, material)
  }
  return material
}
