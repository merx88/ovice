import { Canvas } from '@react-three/fiber'
import { tokens } from '../theme/tokens'

export function App() {
  return (
    <Canvas shadows style={{ background: tokens.bg }}>
      <color attach="background" args={[tokens.bg]} />
    </Canvas>
  )
}
