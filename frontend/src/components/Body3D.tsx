import { Html, OrbitControls, RoundedBox } from "@react-three/drei";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { LevelName } from "../lib/types";
import { LEVEL_COLORS } from "./ui";

/**
 * Corps humain holographique construit à partir de primitives (aucun modèle
 * externe à télécharger). Chaque pièce appartient à une région cliquable.
 */
type Vec3 = [number, number, number];
interface Part {
  key: string;
  region: string;
  kind: "sphere" | "box" | "capsule" | "cylinder";
  args: number[];
  position: Vec3;
  rotation?: Vec3;
}

const PARTS: Part[] = [
  { key: "head", region: "head", kind: "sphere", args: [0.3, 40, 40], position: [0, 1.62, 0] },
  { key: "neck", region: "neck", kind: "cylinder", args: [0.1, 0.12, 0.22, 24], position: [0, 1.3, 0] },
  { key: "chest", region: "chest", kind: "box", args: [0.8, 0.56, 0.36], position: [0, 0.97, 0] },
  { key: "abdomen", region: "abdomen", kind: "box", args: [0.66, 0.38, 0.32], position: [0, 0.53, 0] },
  { key: "back", region: "back", kind: "box", args: [0.6, 0.62, 0.06], position: [0, 0.68, -0.215] },
  { key: "pelvis", region: "pelvis", kind: "box", args: [0.7, 0.26, 0.34], position: [0, 0.22, 0] },
  { key: "arm-l-up", region: "limbs", kind: "capsule", args: [0.085, 0.42, 8, 16], position: [-0.54, 0.93, 0], rotation: [0, 0, 0.14] },
  { key: "arm-r-up", region: "limbs", kind: "capsule", args: [0.085, 0.42, 8, 16], position: [0.54, 0.93, 0], rotation: [0, 0, -0.14] },
  { key: "arm-l-low", region: "limbs", kind: "capsule", args: [0.072, 0.4, 8, 16], position: [-0.61, 0.42, 0.02], rotation: [0, 0, 0.05] },
  { key: "arm-r-low", region: "limbs", kind: "capsule", args: [0.072, 0.4, 8, 16], position: [0.61, 0.42, 0.02], rotation: [0, 0, -0.05] },
  { key: "hand-l", region: "limbs", kind: "sphere", args: [0.08, 20, 20], position: [-0.63, 0.12, 0.03] },
  { key: "hand-r", region: "limbs", kind: "sphere", args: [0.08, 20, 20], position: [0.63, 0.12, 0.03] },
  { key: "leg-l-up", region: "limbs", kind: "capsule", args: [0.125, 0.5, 8, 16], position: [-0.19, -0.27, 0] },
  { key: "leg-r-up", region: "limbs", kind: "capsule", args: [0.125, 0.5, 8, 16], position: [0.19, -0.27, 0] },
  { key: "leg-l-low", region: "limbs", kind: "capsule", args: [0.095, 0.5, 8, 16], position: [-0.19, -0.93, 0] },
  { key: "leg-r-low", region: "limbs", kind: "capsule", args: [0.095, 0.5, 8, 16], position: [0.19, -0.93, 0] },
  { key: "foot-l", region: "limbs", kind: "box", args: [0.14, 0.08, 0.28], position: [-0.19, -1.3, 0.06] },
  { key: "foot-r", region: "limbs", kind: "box", args: [0.14, 0.08, 0.28], position: [0.19, -1.3, 0.06] },
];

const LABEL_ANCHOR: Record<string, Vec3> = {
  head: [0.42, 1.75, 0],
  neck: [0.32, 1.32, 0],
  chest: [0.62, 1.1, 0],
  abdomen: [0.55, 0.55, 0],
  back: [0.55, 0.75, -0.3],
  pelvis: [0.55, 0.2, 0],
  limbs: [0.5, -0.6, 0],
};

const BASE = new THREE.Color("#1fb6c9");
const GLOW = new THREE.Color("#00D1C1");
const SELECT = new THREE.Color("#8B5CF6");

interface BodyProps {
  selected?: string | null;
  hovered: string | null;
  setHovered: (r: string | null) => void;
  onSelect?: (region: string) => void;
  levels: Record<string, LevelName>;
  labels: Record<string, string>;
  interactive: boolean;
}

function BodyPart({ part, state, level, interactive, onOver, onOut, onClick }: {
  part: Part;
  state: "idle" | "hover" | "selected";
  level?: LevelName;
  interactive: boolean;
  onOver: (e: ThreeEvent<PointerEvent>) => void;
  onOut: () => void;
  onClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  // Matériau persistant : l'animation (useFrame) le modifie sans que React ne
  // réapplique les couleurs à chaque rendu (pas de clignotement au survol).
  const mat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        transparent: true,
        opacity: 0.26,
        color: BASE.clone(),
        emissive: GLOW.clone(),
        emissiveIntensity: 0.22,
        roughness: 0.25,
        metalness: 0.15,
        clearcoat: 1,
        depthWrite: false,
      }),
    [],
  );
  useEffect(() => () => mat.dispose(), [mat]);
  const alertColor = useMemo(() => (level ? new THREE.Color(LEVEL_COLORS[level]) : null), [level]);

  useFrame(({ clock }) => {
    const m = mat;
    const t = clock.getElapsedTime();
    let color = BASE;
    let emissive = GLOW;
    let intensity = 0.22;
    let opacity = 0.26;
    if (alertColor) {
      color = alertColor;
      emissive = alertColor;
      const pulse = level === "EMERGENCY" || level === "URGENT";
      intensity = pulse ? 0.55 + 0.4 * Math.sin(t * 4) : 0.45;
      opacity = 0.42;
    }
    if (state === "hover") {
      intensity += 0.45;
      opacity += 0.14;
    }
    if (state === "selected") {
      if (!alertColor) {
        color = SELECT;
        emissive = SELECT;
      }
      intensity = Math.max(intensity, 0.85 + 0.15 * Math.sin(t * 2));
      opacity = 0.6;
    }
    m.color.lerp(color, 0.15);
    m.emissive.lerp(emissive, 0.15);
    m.emissiveIntensity += (intensity - m.emissiveIntensity) * 0.2;
    m.opacity += (opacity - m.opacity) * 0.2;
  });

  const material = <primitive object={mat} attach="material" />;
  const handlers = interactive
    ? { onPointerOver: onOver, onPointerOut: onOut, onClick }
    : {};

  if (part.kind === "box") {
    return (
      <RoundedBox args={part.args as Vec3} radius={0.07} smoothness={4} position={part.position} rotation={part.rotation} {...handlers}>
        {material}
      </RoundedBox>
    );
  }
  return (
    <mesh position={part.position} rotation={part.rotation} {...handlers}>
      {part.kind === "sphere" && <sphereGeometry args={part.args as [number, number, number]} />}
      {part.kind === "cylinder" && <cylinderGeometry args={part.args as [number, number, number, number]} />}
      {part.kind === "capsule" && <capsuleGeometry args={part.args as [number, number, number, number]} />}
      {material}
    </mesh>
  );
}

function Heart() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    const beat = 1 + 0.12 * Math.max(0, Math.sin(t * 7)) * Math.max(0, Math.sin(t * 3.5));
    ref.current.scale.setScalar(beat);
  });
  return (
    <mesh ref={ref} position={[0.08, 1.0, 0.05]} raycast={() => null}>
      <sphereGeometry args={[0.07, 24, 24]} />
      <meshBasicMaterial color="#ff5d7a" transparent opacity={0.85} />
    </mesh>
  );
}

function Scanner() {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.getElapsedTime();
    ref.current.position.y = 0.3 + 1.6 * Math.sin(t * 0.7);
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
      <torusGeometry args={[0.72, 0.005, 8, 96]} />
      <meshBasicMaterial color="#38BDF8" transparent opacity={0.7} />
    </mesh>
  );
}

function Platform() {
  return (
    <group position={[0, -1.38, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[0.78, 0.82, 96]} />
        <meshBasicMaterial color="#00D1C1" transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <ringGeometry args={[1.05, 1.06, 96]} />
        <meshBasicMaterial color="#8B5CF6" transparent opacity={0.45} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
        <circleGeometry args={[0.78, 64]} />
        <meshBasicMaterial color="#00D1C1" transparent opacity={0.06} />
      </mesh>
      <gridHelper args={[6, 30, "#164e63", "#0f2a3d"]} position={[0, -0.01, 0]} />
    </group>
  );
}

function Body({ selected, hovered, setHovered, onSelect, levels, labels, interactive }: BodyProps) {
  return (
    <group>
      {PARTS.map((p) => (
        <BodyPart
          key={p.key}
          part={p}
          interactive={interactive}
          level={levels[p.region]}
          state={selected === p.region ? "selected" : hovered === p.region ? "hover" : "idle"}
          onOver={(e) => {
            e.stopPropagation();
            setHovered(p.region);
            document.body.style.cursor = "pointer";
          }}
          onOut={() => {
            setHovered(null);
            document.body.style.cursor = "";
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect?.(p.region);
          }}
        />
      ))}
      <Heart />
      <Scanner />
      <Platform />
      {interactive && hovered && LABEL_ANCHOR[hovered] && (
        <Html position={LABEL_ANCHOR[hovered]} center style={{ pointerEvents: "none" }}>
          <div className="whitespace-nowrap rounded-full border border-teal/40 bg-navy-900/90 px-3 py-1 text-xs font-semibold text-teal shadow-glow">
            {labels[hovered] ?? hovered}
            {levels[hovered] && <span style={{ color: LEVEL_COLORS[levels[hovered]] }}> ● alerte</span>}
          </div>
        </Html>
      )}
    </group>
  );
}

export default function Body3D({
  selected = null,
  onSelect,
  levels = {},
  labels = {},
  autoRotate = false,
  interactive = true,
  className = "h-[520px]",
}: {
  selected?: string | null;
  onSelect?: (region: string) => void;
  levels?: Record<string, LevelName>;
  labels?: Record<string, string>;
  autoRotate?: boolean;
  interactive?: boolean;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  return (
    <div className={`relative w-full ${className}`}>
      <Canvas camera={{ position: [0, 0.5, 4.4], fov: 38 }} dpr={[1, 2]} gl={{ antialias: true, alpha: true }}>
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 4, 5]} intensity={1.1} />
        <pointLight position={[-3, 1, 2]} intensity={6} color="#8B5CF6" />
        <pointLight position={[3, -1, 2]} intensity={5} color="#00D1C1" />
        <Suspense fallback={null}>
          <Body
            selected={selected}
            hovered={hovered}
            setHovered={setHovered}
            onSelect={onSelect}
            levels={levels}
            labels={labels}
            interactive={interactive}
          />
        </Suspense>
        <OrbitControls
          target={[0, 0.25, 0]}
          enablePan={false}
          minDistance={2.6}
          maxDistance={7}
          autoRotate={autoRotate && !hovered}
          autoRotateSpeed={0.9}
          enableZoom={interactive}
        />
      </Canvas>
    </div>
  );
}
