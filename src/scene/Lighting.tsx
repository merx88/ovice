import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import { BackSide, Color } from 'three'
import { tokens } from '../theme/tokens'
import type { Vec3 } from './layout'

// --- Direct lights ----------------------------------------------------------

/** The key light sits to the left and in front of the furniture, fairly low. */
const KEY_LIGHT = { position: [-4, 5.5, 9], intensity: 2.4 } as const
/** A weak light from behind keeps tops and back edges from going dull. */
const RIM_LIGHT = { position: [3, 3, -6], intensity: 0.6 } as const
/** Area (half-extents, m) and softness of the key light's shadow map. */
const SHADOW = { halfWidth: 4.2, halfHeight: 3.2, near: 1, far: 22, mapSize: 1024, radius: 6, blurSamples: 12 } as const

// --- Studio environment -----------------------------------------------------

const ENV_RESOLUTION = 256
/** How strongly the studio lights the scene, balanced against the key light. */
const ENV_INTENSITY = 0.62
/** Radius of the bright room the reflections are rendered from. */
const STUDIO_RADIUS = 20
/**
 * The studio's dark floor lies well below eye level, so upright chrome seen
 * from slightly above still mirrors the bright room and only undersides pick
 * up the dark floor.
 */
const STUDIO_FLOOR_Y = -6
const studioWallColor = new Color(tokens.bg).multiplyScalar(0.9)
const studioFloorColor = new Color(tokens.floor).multiplyScalar(0.35)
/** Every panel is turned to face this point. */
const STUDIO_FOCUS: Vec3 = [0, 1, 0]

interface StudioPanel {
  color: string
  intensity: number
  position: Vec3
  /** Width and height in metres. */
  size: readonly [number, number]
}

const STUDIO_PANELS: readonly StudioPanel[] = [
  // Soft ceiling panel.
  { color: tokens.white, intensity: 1.5, position: [0, 9, 3], size: [14, 10] },
  // Key panel, front left: the main highlight on glossy surfaces.
  { color: tokens.white, intensity: 2.2, position: [-10, 6, 8], size: [7, 7] },
  // Dark cards: the thin streaks that make chrome read as chrome.
  { color: tokens.black, intensity: 1, position: [-15, 3, 6], size: [1.2, 12] },
  { color: tokens.black, intensity: 1, position: [13, 3, -8], size: [1.5, 12] },
  { color: tokens.black, intensity: 1, position: [6, 2, 16], size: [0.8, 12] },
]

// --- Contact shadows --------------------------------------------------------

/** Footprint (m) the contact shadows cover and how high above the floor they look. */
const CONTACT = { width: 7, depth: 4, centerZ: -0.4, height: 0.9, lift: 0.004, opacity: 0.6, blur: 2.2 } as const

/**
 * Image-based light from a studio built out of panels (nothing to download),
 * a key light that casts soft shadows, and contact shadows that ground every
 * piece. The studio and the contact shadows are rendered once, as the
 * furniture does not move.
 */
export function Lighting() {
  return (
    <>
      <Environment resolution={ENV_RESOLUTION} frames={1} environmentIntensity={ENV_INTENSITY}>
        <mesh scale={STUDIO_RADIUS}>
          <sphereGeometry args={[1, 32, 16]} />
          <meshBasicMaterial color={studioWallColor} side={BackSide} />
        </mesh>
        <Lightformer
          form="circle"
          color={studioFloorColor}
          rotation-x={-Math.PI / 2}
          position={[0, STUDIO_FLOOR_Y, 0]}
          scale={STUDIO_RADIUS * 2}
        />
        {STUDIO_PANELS.map(({ color, intensity, position, size }, index) => (
          <Lightformer
            key={index}
            form="rect"
            color={color}
            intensity={intensity}
            position={[...position]}
            scale={[size[0], size[1], 1]}
            target={[...STUDIO_FOCUS]}
          />
        ))}
      </Environment>

      <directionalLight
        castShadow
        position={[...KEY_LIGHT.position]}
        intensity={KEY_LIGHT.intensity}
        shadow-mapSize={[SHADOW.mapSize, SHADOW.mapSize]}
        shadow-radius={SHADOW.radius}
        shadow-blurSamples={SHADOW.blurSamples}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
      >
        <orthographicCamera
          attach="shadow-camera"
          args={[-SHADOW.halfWidth, SHADOW.halfWidth, SHADOW.halfHeight, -SHADOW.halfHeight, SHADOW.near, SHADOW.far]}
        />
      </directionalLight>
      <directionalLight position={[...RIM_LIGHT.position]} intensity={RIM_LIGHT.intensity} />

      <ContactShadows
        position={[0, CONTACT.lift, CONTACT.centerZ]}
        scale={[CONTACT.width, CONTACT.depth]}
        far={CONTACT.height}
        resolution={512}
        blur={CONTACT.blur}
        opacity={CONTACT.opacity}
        color={tokens.black}
        frames={1}
      />
    </>
  )
}
