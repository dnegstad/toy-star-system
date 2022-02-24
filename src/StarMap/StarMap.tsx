import { OrthographicCamera, Stars } from '@react-three/drei';
import { Canvas,  ThreeEvent, useLoader, useThree } from '@react-three/fiber';
import { useGesture } from '@use-gesture/react';
import { useActor, useSelector } from '@xstate/react';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { Suspense, useCallback, useLayoutEffect, useMemo, useRef } from 'react';
import * as Three from 'three/src/Three';
import { ActorRefFrom } from 'xstate';
import { db, PlanetRecord, PlanetType, StarSystemRecord } from '../Data/Database';
import { StarMapMachine } from '../Machines/StarMap';
import { Scene } from '../Scene/Scene';
import { System, SystemDetail } from '../System/System';
import { normalize } from '../utils/normalize';
import './StarMap.css';

type StarMapProps = {
    machine: ActorRefFrom<StarMapMachine>;
    minZoom?: number;
    maxZoom?: number;
}

export type SystemProps = StarSystemRecord & {
    planets: Record<string, PlanetRecord>;
    selected: boolean;
    scale: number;
    onClick: (event: ThreeEvent<MouseEvent>) => void;
}

const Degree = Math.PI * 2 / 360;
const toRadians = (deg: number): number => {
    return Degree * deg;
}

const zPlane = new Three.Plane(new Three.Vector3(0, 0, 1), 0);

const getIntersection = (x: number, y: number, camera: Three.Camera) => {
    const raycaster = new Three.Raycaster();
    raycaster.setFromCamera({x: (x / window.innerWidth) * 2 - 1, y: -(y / window.innerHeight) * 2 + 1}, camera);
    const intersects = new Three.Vector3();
    raycaster.ray.intersectPlane(zPlane, intersects);
    return intersects;
}

export const MainSceneContext = React.createContext({} as Three.Scene);

const SelectedSystemCamera: React.FC<{system: StarSystemRecord, machine: ActorRefFrom<StarMapMachine>}> = ({system, machine}) => {
    const size = useThree((state) => state.size);
    const cameraWidth = useSelector(machine, (state) => state.context.systemDetailWindowWidth);
    const cameraHeight = useSelector(machine, (state) => state.context.systemDetailWindowHeight);
    const camera = useMemo(() => {
        const camera = new Three.OrthographicCamera(-cameraWidth / 4, cameraHeight / 4, cameraWidth / 4, -cameraHeight / 4, 0.1, 10000);
        camera.position.set(0, -Math.tan(Math.PI / 3) * 250, 250);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();
        return camera;
    }, []);

    const {width, height} = useMemo(() => {
        const width = size.width - 40 < cameraWidth ? size.width - 40 : cameraWidth;
        const height = size.height - 40 < cameraHeight ? size.height - 40 : cameraHeight;
        const aspectRatio = cameraWidth / cameraHeight;
        if (width !== cameraWidth || height !== cameraHeight) {
            if (width / height > aspectRatio) {
                return { width: aspectRatio * height, height: height };
            } else if (width / height < aspectRatio) {
                return { width: width, height: width / aspectRatio };
            }
        }

        return {width, height};
    }, [cameraWidth, cameraHeight, size.width, size.height]);

    return (
        <>
            <Scene camera={camera} order={100} scissor={[20, size.height - height - 20, width, height]} viewport={[20, size.height - height - 20, width, height]}>
                <ambientLight intensity={0.75} />
                <SystemDetail starSystem={system} />
            </Scene>
        </>
    )
}

export const PlanetMaterialContext = React.createContext<Record<PlanetType, Three.Material>>({} as Record<PlanetType, Three.Material>);

const GameScene: React.FC<StarMapProps & { canvasRef: HTMLCanvasElement }> = ({machine, canvasRef}) => {
    const [state, send] = useActor(machine);
    const camera = useThree((state) => state.camera);
    const gl = useThree((state) => state.gl);
    const systemsGroupRef = useRef({} as Three.Group);
    const sceneRef = useRef({} as Three.Scene);

    const planetTextures = useLoader(Three.TextureLoader, ['Barren01.png', 'Barren-bump01.png', 'Desert01.png', 'Swamp01.png', 'Ocean02.png', 'Terran01.png', 'Tundra01.png', 'Inferno01.png', 'Toxic01.png', 'GasGiant01.png']);
    const planetMaterials: Record<PlanetType, Three.Material> = useMemo(() => {
        return {
            barren: new Three.MeshPhongMaterial({
                map: planetTextures[0],
                bumpMap: planetTextures[1],
                shininess: 0,
            }),
            desert: new Three.MeshPhongMaterial({
                map: planetTextures[2],
                shininess: 0,
            }),
            swamp: new Three.MeshPhongMaterial({
                map: planetTextures[3],
                shininess: 0,
            }),
            ocean: new Three.MeshPhongMaterial({
                map: planetTextures[4],
                shininess: 40,
            }),
            terran: new Three.MeshPhongMaterial({
                map: planetTextures[5],
                shininess: 0,
            }),
            tundra: new Three.MeshPhongMaterial({
                map: planetTextures[6],
                shininess: 20,
            }),
            volcanic: new Three.MeshPhongMaterial({
                map: planetTextures[7],
                shininess: 0,
                emissive: 'red',
            }),
            toxic: new Three.MeshPhongMaterial({
                map: planetTextures[8],
                shininess: 0,
                emissive: 'purple',
            }),
            gasgiant: new Three.MeshPhongMaterial({
                map: planetTextures[9],
                shininess: 0,
            }),
        };
    }, [planetTextures.length]);

    const starSystems = useLiveQuery(() => db.starSystems.toArray(), [], new Array<StarSystemRecord>());
    const selectedStarSystem = useLiveQuery(() => state.context.selectedSystem ? db.starSystems.where('uuid').equals(state.context.selectedSystem).first() : undefined, [state.context.selectedSystem]);

    useLayoutEffect(() => {
        planetTextures.forEach((texture) => gl.initTexture(texture));

        return () => {
            planetTextures.forEach((texture) => texture.dispose());
        }
    }, []);

    useGesture({
        onDrag: ({ pinching, tap, cancel, delta: [deltaX, deltaY], event }) => {
            if (pinching) {
                return cancel();
            }

            if (tap) {
                return;
            }

            // Drag based on the z plane to account for camera tilt
            if (event instanceof PointerEvent || event instanceof MouseEvent) {
                const previousIntersection = getIntersection(event.clientX - deltaX, event.clientY - deltaY, camera);
                const intersection = getIntersection(event.clientX, event.clientY, camera);

                systemsGroupRef.current.position.x += intersection.x - previousIntersection.x;
                systemsGroupRef.current.position.y += intersection.y - previousIntersection.y;
            }
        },
        onWheel: ({ event, delta: [,deltaY] }) => {
            event.preventDefault();

            if (deltaY === 0) {
                return;
            }

            // Track the previous point the mouse corresponded to in the scene
            const previousIntersection = getIntersection(event.clientX, event.clientY, camera);

            const scale = deltaY * -0.001;
            camera.zoom += scale;
            camera.zoom = Math.min(Math.max(camera.zoom, 0.25), 1);
            camera.updateProjectionMatrix();

            // Calculate the new point the mouse correspons to in the scene after zoom
            const intersection = getIntersection(event.clientX, event.clientY, camera);

            // Offset the scene position to zoom on the mouse position
            systemsGroupRef.current.position.x += intersection.x - previousIntersection.x;
            systemsGroupRef.current.position.y += intersection.y - previousIntersection.y;
        },
        onPinch: ({ movement: [scale, a], first, memo, origin: [x, y]}) => {
            if (scale === 0) {
                return;
            }

            const previous = first ? 1.0 : memo;
            memo = scale;

            // Track the previous point the mouse corresponded to in the scene
            const previousIntersection = getIntersection(x, y, camera);

            camera.zoom += scale - previous;
            camera.zoom = Math.min(Math.max(camera.zoom, 0.25), 1);
            camera.updateProjectionMatrix();

            // Calculate the new point the mouse correspons to in the scene after zoom
            const intersection = getIntersection(x, y, camera);

            // Offset the scene position to zoom on the mouse position
            sceneRef.current.position.x += intersection.x - previousIntersection.x;
            sceneRef.current.position.y += intersection.y - previousIntersection.y;

            return memo;
        },
    }, {
        target: canvasRef,
        eventOptions: { passive: false },
        wheel: { preventDefault: true },
        drag: { filterTaps: true },
        pinch: { preventDefault: true, pointer: { touch: true } },
    });

    const systems = starSystems.map((system) => {
        const id = system.uuid as string;

        const selectSystem = (event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            send({type: 'SYSTEM.SELECT', value: id});
        }

        return true ? <System key={id} starSystem={system} selected={state.context.selectedSystem === id} onClick={selectSystem} /> : null;
    });

    return (
        <>
            <PlanetMaterialContext.Provider value={planetMaterials}>
                <Scene camera={camera}>
                    <mesh onClick={(_) => send({type: 'SYSTEM.DESELECT'})} visible={false}>
                        <sphereGeometry args={[4000, 8, 8]} />
                        <meshBasicMaterial side={Three.BackSide} />
                    </mesh>
                    <group ref={systemsGroupRef}>
                        <ambientLight intensity={1} />
                        {systems}
                    </group>
                </Scene>
                {selectedStarSystem ? <SelectedSystemCamera system={selectedStarSystem} machine={machine} /> : null}
            </PlanetMaterialContext.Provider>
        </>
    );
}

export const StarMap: React.FC<StarMapProps> = ({machine}) => {
    const canvasRef = useRef({} as HTMLCanvasElement);

    const lookAt = useCallback((self: Three.OrthographicCamera) => {
        self.lookAt(new Three.Vector3(0, 0, 0));
        self.updateProjectionMatrix();
    }, []);

    const fallback = <div>Loading...</div>;

    return (
        <Suspense fallback={fallback}>
            <Canvas
                linear
                gl={{ antialias: true }}
                dpr={[1, 1]}
                ref={canvasRef}>
                <OrthographicCamera makeDefault position={[0, -Math.tan(Math.PI / 3) * 500, 500]} near={0.1} far={10000} onUpdate={lookAt} />
                <GameScene machine={machine} canvasRef={canvasRef.current} />
            </Canvas>
        </Suspense>
    );
}
