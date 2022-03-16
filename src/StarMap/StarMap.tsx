import { OrthographicCamera } from '@react-three/drei';
import { Canvas,  ThreeEvent, useLoader, useThree } from '@react-three/fiber';
import { useGesture } from '@use-gesture/react';
import { useActor, useSelector } from '@xstate/react';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass';
import { Pass } from 'three/examples/jsm/postprocessing/Pass';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader';
import { SSAARenderPass } from 'three/examples/jsm/postprocessing/SSAARenderPass';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass';
import { ConvexHull, VertexNode } from 'three/examples/jsm/math/ConvexHull';
import { SimplexNoise } from 'three/examples/jsm/math/SimplexNoise';
import * as Three from 'three/src/Three';
import { ActorRefFrom } from 'xstate';
import { db, PlanetRecord, PlanetSize, PlanetType, StarSize, StarSystemRecord, StarType } from '../Data/Database';
import { StarTypeData, StarMapMachine, isTextureStarTypeData, PlanetTypeData } from '../Machines/StarMap';
import { StarMaterial } from '../Materials/StarMaterial';
import { Scene } from '../Scene/Scene';
import { InstancedStars, System, SystemDetail } from '../System/System';
import './StarMap.css';
import { EffectView } from './View';
import { ScaledTextureMaterial } from '../Materials/ScaledTextureMaterial';
import { GlowMaterial } from '../Materials/GlowMaterial';
import { AtmosphereMaterialV2, AtmosphereStar } from '../Materials/AtmosphereMaterialV2';
import { ThreeVoronoi } from '../Geometries/ThreeVoronoi';
import { lerp, randInt } from 'three/src/math/MathUtils';
import { geoDistance, geoRotation } from 'd3-geo';
import { number } from 'zod';

const RADIANS = Math.PI / 180;

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

export type MaterialsContextState = {
    stars: Record<'yellow', Three.Material>;
    planets: Record<PlanetType, Three.Material>;
}

export const MaterialsContext = React.createContext<MaterialsContextState>({} as MaterialsContextState);

const GameScene: React.FC<StarMapProps & { canvasRef: HTMLCanvasElement }> = ({machine, canvasRef}) => {
    const [state, send] = useActor(machine);
    const camera = useThree((state) => state.camera);
    const gl = useThree((state) => state.gl);
    const systemsGroupRef = useRef({} as Three.Group);
    const sceneRef = useRef({} as Three.Scene);

    const starTextures = useLoader(Three.TextureLoader, ['2k_sun.jpg']);
    const starMaterials: Record<'yellow', Three.Material> = useMemo(() => {
        return {
            yellow: new Three.MeshPhongMaterial({
                map: starTextures[0],
                emissive: '#ffdf2a',
                emissiveIntensity: 0.75,
                shininess: 0,
            }),
        };
    }, []);

    const planetTextures = useLoader(Three.TextureLoader, ['Barren01.png', 'Barren-bump01.png', 'Desert01.png', 'Swamp01.png', 'Ocean02.png', 'Terran01.png', 'Tundra01.png', 'Inferno01.png', 'Toxic01.png', 'GasGiant01.png']);
    const planetMaterials: Record<PlanetType, Three.Material> = useMemo(() => {
        const volcanicNormal = new Three.TextureLoader().load('Lavaplanet_Normal.png');
        const volcanicRoughness = new Three.TextureLoader().load('Lavaplanet_Roughness.png');
        const volcanicAO = new Three.TextureLoader().load('Lavaplanet_AO.png');

        const terranNormal = new Three.TextureLoader().load('Paradise_Normal.png');
        const terranRoughness = new Three.TextureLoader().load('Paradise_Roughness.png');
        const terranAO = new Three.TextureLoader().load('Paradise_AO.png');

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
            terran: new Three.MeshPhysicalMaterial({
                map: planetTextures[5],
                aoMap: terranAO,
                normalMap: terranNormal,
                roughnessMap: terranRoughness,
            }),
            tundra: new Three.MeshPhongMaterial({
                map: planetTextures[6],
                shininess: 20,
            }),
            volcanic: new Three.MeshPhysicalMaterial({
                map: planetTextures[7],
                aoMap: volcanicAO,
                normalMap: volcanicNormal,
                roughnessMap: volcanicRoughness,
            }),
            toxic: new Three.MeshPhongMaterial({
                map: planetTextures[8],
                shininess: 0,
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
        starTextures.forEach((texture) => gl.initTexture(texture));
        planetTextures.forEach((texture) => gl.initTexture(texture));

        return () => {
            starTextures.forEach((texture) => texture.dispose());
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

    const groupedStarSystems = useMemo(() => {
        return starSystems.reduce((systemGroups, system) => ({
            ...systemGroups,
            [system.type]: [...(systemGroups[system.type] || []), system]}), {} as Record<StarType, Array<StarSystemRecord>>);
    }, [starSystems]);

    const instancedSystems = useMemo(() => {
        return Object.entries(groupedStarSystems).map(([starType, systems]) => {
            return <InstancedStars key={starType} starType={starType as StarType} stars={systems} />;
        });
    }, [groupedStarSystems]);

    const systems = starSystems.map((system) => {
        const id = system.uuid as string;

        const selectSystem = (event: ThreeEvent<MouseEvent>) => {
            event.stopPropagation();
            send({type: 'SYSTEM.SELECT', value: id});
        }

        return <System key={id} starSystem={system} selected={state.context.selectedSystem === id} onClick={selectSystem} />;
    });

    return (
        <>
            <MaterialsContext.Provider value={{stars: starMaterials, planets: planetMaterials}}>
                <Scene camera={camera}>
                    <mesh onClick={(_) => send({type: 'SYSTEM.DESELECT'})} visible={false}>
                        <sphereGeometry args={[4000, 8, 8]} />
                        <meshBasicMaterial side={Three.BackSide} />
                    </mesh>
                    <group ref={systemsGroupRef}>
                        <ambientLight intensity={1} />
                        {systems}
                        {instancedSystems}
                    </group>
                </Scene>
                {selectedStarSystem ? <SelectedSystemCamera system={selectedStarSystem} machine={machine} /> : null}
            </MaterialsContext.Provider>
        </>
    );
}

type RendererProps = {
    canvas: HTMLCanvasElement,
    machine: ActorRefFrom<StarMapMachine>,
}

type GeometryCacheState = {
    stars: Record<StarSize, Three.BufferGeometry>;
    planets: Record<PlanetSize, Three.BufferGeometry>;
}

type MaterialCacheState = {
    stars: Record<StarType, Three.Material>;
    planets: Record<PlanetType, Three.Material>;
    background: Three.Texture;
}

export const Renderer: React.FC<RendererProps> = ({canvas, machine}) => {
    const [state, send] = useActor(machine);
    const [geometry, setGeometry] = useState(null! as GeometryCacheState);
    const [materials, setMaterials] = useState(null! as MaterialCacheState);
    const animationFrameHandleRef = useRef(0);
    const previousTimestampRef = useRef(0);

    const renderer = useMemo(() => {
        const renderer = new Three.WebGLRenderer({
            alpha: true,
            antialias: false,
            powerPreference: 'high-performance',
            canvas,
            logarithmicDepthBuffer: false,
        });
        renderer.toneMapping = Three.ACESFilmicToneMapping;
        renderer.setPixelRatio(window.devicePixelRatio);

        renderer.autoClear = false;
        renderer.outputEncoding = Three.sRGBEncoding;

        return renderer;
    }, [canvas]);

    useEffect(() => {
        const stars = Object.entries(state.context.materialData.starSizes).reduce((starGeometries, [starSize, props]) => {
            const geometry = new Three.SphereBufferGeometry(props.radius, props.segments, props.segments).rotateX(Math.PI / 2);
            geometry.name = `${starSize}StarSphereGeometry`;
            return {
                ...starGeometries,
                [starSize as StarSize]: geometry,
            };
        }, {} as Record<StarSize, Three.BufferGeometry>);

        const planets = Object.entries(state.context.materialData.planetSizes).reduce((planetGeometries, [planetSize, props]) => {
            const geometry = new Three.SphereBufferGeometry(props.radius, props.segments, props.segments).rotateX(Math.PI / 2);
            geometry.name = `${planetSize}PlanetSphereGeometry`;
            return {
                ...planetGeometries,
                [planetSize as PlanetSize]: geometry,
            };
        }, {} as Record<PlanetSize, Three.BufferGeometry>);

        setGeometry({
            stars,
            planets,
        });

        return () => {
            Object.entries(stars).forEach(([,star]) => star.dispose());
            Object.entries(planets).forEach(([,planet]) => planet.dispose());
        }
    }, [renderer]);

    useEffect(() => {
        const textureLoader = new Three.TextureLoader();
        const loadMaterials = async () => {
            const [
                starTextures,
                planetTextures,
                backgroundTexture,
            ] = await Promise.all([
                // Star textures
                Promise.all(
                    Object.entries(state.context.materialData.starColors)
                    .reduce((starColors, [starColor, props]) => {
                        return [
                            ...starColors,
                            isTextureStarTypeData(props)
                            ? textureLoader.loadAsync(props.texture).then((texture) => {
                                return {texture, starColor: starColor as StarType, props};
                            })
                            : Promise.resolve({starColor: starColor as StarType, props}),
                        ];
                    }, new Array<Promise<{texture?: Three.Texture, starColor: StarType, props: StarTypeData}>>()),
                ),
                // Planet textures
                Promise.all(
                    Object.entries(state.context.materialData.planetTypes)
                    .reduce((planetTypes, [planetType, props]) => {
                        return [
                            ...planetTypes,
                            textureLoader.loadAsync(props.texture).then((texture) => {
                                return {texture, planetType: planetType as PlanetType, props};
                            }),
                        ];
                    }, new Array<Promise<{texture: Three.Texture, planetType: PlanetType, props: PlanetTypeData}>>()),
                ),
                // Background texture
                textureLoader.loadAsync(state.context.materialData.background.texture),
            ]);

            const stars = starTextures.reduce((stars, {starColor, props, texture}) => {
                if (isTextureStarTypeData(props)) {
                    renderer.initTexture(texture as Three.Texture);
                    return {
                        ...stars,
                        [starColor]: new Three.MeshPhongMaterial({
                            map: texture,
                            emissive: props.color,
                            emissiveIntensity: props.emissiveIntensity,
                        }),
                    };
                } else {
                    return {
                        ...stars,
                        [starColor]: new StarMaterial({
                            octaves: 4,
                            highTemp: props.highTemp,
                            lowTemp: props.lowTemp,
                        }),
                    };
                }
            }, {} as Record<StarType, Three.Material>);

            const planets = planetTextures.reduce((planets, {planetType, props, texture}) => {
                renderer.initTexture(texture);
                return {
                    ...planets,
                    [planetType]: new Three.MeshPhongMaterial({
                        map: texture,
                        shininess: props.shininess,
                    }),
                };
            }, {} as Record<PlanetType, Three.Material>);

            setMaterials({
                stars,
                planets,
                background: backgroundTexture,
            });

            return {stars, planets, background: backgroundTexture};
        }

        const materialsPromise = loadMaterials();

        return () => {
            materialsPromise.then(({stars, planets, background}) => {
                Object.entries(stars).forEach(([,star]) => {
                    if (star instanceof Three.MeshPhongMaterial) {
                        star.map?.dispose();
                    }

                    star.dispose();
                })
                Object.entries(planets).forEach(([,planet]) => {
                    if (planet instanceof Three.MeshPhongMaterial) {
                        planet.map?.dispose();
                    }

                    planet.dispose();
                });
                background.dispose();
            });
        }
    }, [renderer]);

    useEffect(() => {
        if (!geometry || !materials) {
            return;
        }

        const backgroundAspectRatio = 2048 / 1024;

        const { width: initialWidth, height: initialHeight } = canvas.getBoundingClientRect();

        const aspectRatio = initialWidth / initialHeight;

        const oCamera = new Three.OrthographicCamera(-initialWidth / 4, initialHeight / 4, initialWidth / 4, -initialHeight / 4, 0.1, 10000);
        oCamera.position.set(0, -Math.tan(Math.PI / 3) * 500, 500);
        oCamera.lookAt(0, 0, 0);
        oCamera.updateProjectionMatrix();

        const cameraGroup = new Three.Group();
        const pCamera = new Three.PerspectiveCamera(40, aspectRatio, 10, 1000);
        pCamera.position.set(-100, -300, 0);
        pCamera.lookAt(-100, 0, 0);
        //pCamera.position.set(0, -Math.tan(Math.PI / 3) * 500, 500);
        //pCamera.lookAt(0, 0, 0);
        pCamera.updateProjectionMatrix();
        //cameraGroup.add(pCamera);

        let mainCamera: Three.Camera = oCamera;

        const scene = new Three.Scene();

        const ambientLight = new Three.AmbientLight();
        ambientLight.intensity = 0.25;

        const yellow = new Three.Mesh(geometry.stars.medium, materials.stars.yellow);
        yellow.position.set(-100, 0, 0);

        const giantGroup = new Three.Group();
        const giantPlanetGroup = new Three.Group();
        giantPlanetGroup.position.set(-200, 0, 0);
        giantGroup.add(giantPlanetGroup);

        const giant = new Three.Mesh(geometry.planets.huge, materials.planets.volcanic);
        giantPlanetGroup.add(giant);

        const tinyGroup = new Three.Group();

        const tinyPlanetGroup = new Three.Group();
        tinyPlanetGroup.position.set(0, -300, 0);
        tinyGroup.add(tinyPlanetGroup);

        const pointLight = new Three.PointLight(new Three.Color('#ffffff'));
        pointLight.intensity = 1.0;
        pointLight.position.set(0, 0, 0);

        const blue = new Three.Mesh(geometry.stars.medium, materials.stars.orange);
        blue.position.set(0, 0, 0);

        //scene.add(pointLight, tinyGroup, giantGroup, ambientLight);

        const blueGlowMaterial = new GlowMaterial({
            color: new Three.Color('#fd8d24'),
            scale: 2,
        });
        const blueGlow = new Three.Mesh(blue.geometry, blueGlowMaterial);
        scene.add(blue, blueGlow);

        const verticesOfCube = [
            -1,-1,-1,    1,-1,-1,    1, 1,-1,    -1, 1,-1,
            -1,-1, 1,    1,-1, 1,    1, 1, 1,    -1, 1, 1,
        ];
        
        const indicesOfFaces = [
            2,1,0,    0,3,2,
            0,4,7,    7,3,0,
            0,1,5,    5,4,0,
            1,2,6,    6,5,1,
            2,3,7,    7,6,2,
            4,5,6,    6,7,4
        ];

        /*console.time('convexhull');
        const spherePoints = threeFibonacciSphere(1000, 0.75);
        const hull = new ConvexHull().setFromPoints(spherePoints);
        const cells2 = new Array<{vertex: Three.Vector3, polygon: Array<Three.Vector3>}>();
        const p = new Set<VertexNode>();
        for (let face of hull.faces) {
            let edge = face.edge;
            do {
                if (!p.has(face.edge.prev.vertex)) {
                    p.add(face.edge.prev.vertex);
                    let edge = face.edge;
                    let nextFace = face;
                    const cellVertices = new Array<Three.Vector3>();
                    do {
                        cellVertices.push(nextFace.midpoint);

                        nextFace = edge.twin.face;
                        edge = edge.twin.next;
                    } while (nextFace !== null && nextFace !== face);
                    cells2.push({vertex: face.edge.prev.vertex.point, polygon: cellVertices});
                }
                edge = edge.next;
            } while (edge !== null && edge !== face.edge);
        }
        console.timeEnd('convexhull');*/
        console.time('threevoronoi');
        const vt = ThreeVoronoi.makeDistributedPoints(5000, 0.25);
        let cells = new Set<number>();
        while (cells.size < 30 && cells.size < vt.rawPoints.count) {
            cells.add(randInt(0, vt.rawPoints.count - 1));
        }

        console.time('create initial plates');

        // Collection of cells with neighbors
        const neighborCells = new Set<number>();
        const plateData: Record<number, {memberCells: Set<number>, neighborPlates: Set<number>, motion: Three.Vector2, isWater: boolean}> = {};
        const plates = new Int32Array(vt.rawPoints.count);
        plates.fill(-1);
        const cellQueue = Array.from(cells);
        cells.forEach((cell) => {
            plates[cell] = cell;
            plateData[cell] = {
                memberCells: new Set<number>([cell]),
                neighborPlates: new Set<number>(),
                motion: new Three.Vector2().random().normalize(),
                isWater: false,
            };
        });

        let growQueue = new Array<number>();
        for (let queueOut = 0; queueOut < cellQueue.length + growQueue.length; queueOut++) {
            const actualCell = queueOut < cellQueue.length ? randInt(queueOut, cellQueue.length - 1) : randInt(queueOut, cellQueue.length + growQueue.length - 1);
            cellQueue.push(...growQueue);
            const currentCellIndex = cellQueue[actualCell];
            cellQueue[actualCell] = cellQueue[queueOut];
            const neighborCells = vt.getNeighbors(currentCellIndex);
            growQueue = new Array<number>();
            for (let neighbor of neighborCells) {
                if (plates[neighbor] === -1) {
                    plates[neighbor] = plates[currentCellIndex];
                    growQueue.push(neighbor);
                    plateData[plates[currentCellIndex]].memberCells.add(neighbor);
                } else if (plates[currentCellIndex] !== plates[neighbor]) {
                    plateData[plates[currentCellIndex]].neighborPlates.add(plates[neighbor]);
                }
            }
        }
        console.timeEnd('create initial plates');

        const MINIMUM_CELLS = 5;

        console.time('purge small plates');
        cells = [...cells].sort((a, b) => plateData[a].memberCells.size - plateData[b].memberCells.size).reduce((allPlates, plate) => {
            if (plateData[plate].memberCells.size < MINIMUM_CELLS) {
                const {smallest} = [...plateData[plate].neighborPlates].reduce(({smallest, size}, neighbor) => {
                    if (plateData[neighbor].memberCells.size < size) {
                        return {
                            smallest: neighbor,
                            size: plateData[neighbor].memberCells.size,
                        };
                    } else {
                        return {
                            smallest,
                            size,
                        };
                    }
                }, {smallest: -1, size: Number.MAX_SAFE_INTEGER});

                console.log('Removed small plate', plate, plateData[plate].memberCells.size);
                console.log('Assigned to plate', smallest, plateData[smallest].memberCells.size);

                plateData[plate].memberCells.forEach((cell) => {
                    plates[cell] = smallest;
                    plateData[smallest].memberCells.add(cell);
                });

                plateData[plate].neighborPlates.forEach((neighbor) => {
                    plateData[neighbor].neighborPlates.delete(plate);
                    if (neighbor !== smallest) {
                        plateData[neighbor].neighborPlates.add(smallest);
                    }
                });

                delete plateData[plate];
            } else {
                allPlates.add(plate);
            }

            return allPlates;
        }, new Set<number>());
        console.timeEnd('purge small plates');

        console.time('purge isolated plates');
        cells = [...cells].reduce((allPlates, plate) => {
            if (plateData[plate].neighborPlates.size === 1) {
                const parentPlate = [...plateData[plate].neighborPlates][0];
                plateData[plate].memberCells.forEach((cell) => {
                    plates[cell] = parentPlate;
                    plateData[parentPlate].memberCells.add(cell);
                });

                // Remove ourselves from the new parent plate's list of neighbors
                plateData[parentPlate].neighborPlates.delete(plate);

                delete plateData[plate];
                console.log('Removed isolated plate', plate);
            } else {
                allPlates.add(plate);
            }

            return allPlates;
        }, new Set<number>());

        let waterCells = 0;
        const sortedCells = [...cells].sort((a, b) => plateData[a].memberCells.size - plateData[b].memberCells.size);
        for (let i = 0, j = sortedCells.length - 1; i <= j; i++, j--) {
            if (waterCells + plateData[sortedCells[j]].memberCells.size < plates.length * 0.7) {
                plateData[sortedCells[j]].isWater = true;
                waterCells += plateData[sortedCells[j]].memberCells.size;
            }

            if (i !== j && waterCells + plateData[sortedCells[i]].memberCells.size < plates.length * 0.7) {
                plateData[sortedCells[i]].isWater = true;
                waterCells += plateData[sortedCells[i]].memberCells.size;
            }
        }

        console.timeEnd('purge isolated plates');

        console.log('water', waterCells, waterCells / vt.rawPoints.count);
        console.log('land', vt.rawPoints.count - waterCells, 1 - waterCells / vt.rawPoints.count);

        const terrainCells = new Set<number>();
        while (terrainCells.size < 12 && terrainCells.size < vt.rawPoints.count) {
            terrainCells.add(randInt(0, vt.rawPoints.count - 1));
        }

        const terrain = new Int32Array(vt.rawPoints.count);
        terrain.fill(-1);

        const landId = 0;
        const waterId = 1;
        const terrainQueue = Array.from(terrainCells);
        terrainQueue.forEach((r) => {
            terrain[r] = Math.random() > 0.3 ? waterId : landId;
        });
        for (let queueOut = 0; queueOut < terrainQueue.length; queueOut++) {
            const actualCell = randInt(queueOut, terrainQueue.length - 1);
            const currentCellIndex = terrainQueue[actualCell];
            terrainQueue[actualCell] = terrainQueue[queueOut];
            const neighborCells = vt.getNeighbors(currentCellIndex);
            for (let neighbor of neighborCells) {
                if (terrain[neighbor] === -1) {
                    terrain[neighbor] = terrain[currentCellIndex];
                    terrainQueue.push(neighbor);
                }
            }
        }

        const colors = new Array<number>();
        const vertices = new Array<number>();

        const noise = new SimplexNoise();
        const baseDensity = (lambda: number, phi: number) => {
            return (noise.noise3d(Math.cos(lambda * RADIANS), Math.sin(lambda * RADIANS), phi * RADIANS) + 1.0) / 2.0;
        }

        const baseTemperature = (lambda: number, phi: number) => {
            return lerp(0, 1, Math.min(1, Math.max(0, (90 - Math.abs(phi)) / 120)));
        }

        vt.forEachCell((p, v) => {
            const point = vt.point(p);

            if (plateData[plates[p]] === undefined) {
                console.log('undefined', plateData, plates, p);
            }

            const platePoint: [number, number] = [vt.rawSphericalPoints.getX(p), vt.rawSphericalPoints.getY(p)];
            const plateMovement = geoRotation(new Three.Vector2().copy(plateData[plates[p]].motion).toArray());

            const isOcean = plateData[plates[p]].isWater;
            let density = baseDensity(platePoint[0], platePoint[1]);
            density = isOcean ? density * 0.6 + 0.3 : density * 0.25 + 0.05;

            let mostImpact: number = Number.MIN_SAFE_INTEGER;
            let modifier: number = 0;
            const neighbors = vt.getNeighbors(p);
            neighbors.forEach((neighbor) => {
                // If our neighbor is on a different plate
                if (plates[neighbor] !== plates[p]) {
                    const neighborPoint: [number, number] = [vt.rawSphericalPoints.getX(neighbor), vt.rawSphericalPoints.getY(neighbor)];
                    if (plateData[plates[neighbor]] === undefined) {
                        console.log(p, neighbor, plates[neighbor], plateData);
                    }
                    const neighborMovement = geoRotation(new Three.Vector2().copy(plateData[plates[neighbor]].motion).toArray());
                    const neighborDensity = baseDensity(neighborPoint[0], neighborPoint[1]);

                    const distance = geoDistance(platePoint, neighborPoint);
                    const newDistance = geoDistance(plateMovement(platePoint), neighborMovement(neighborPoint));

                    if (distance - newDistance > mostImpact) {
                        mostImpact = distance - newDistance;
                        if (distance - newDistance > 0.005) {
                            if (density > neighborDensity) {
                                modifier = 0.1;
                            } else {
                                modifier = -0.1;
                            }
                        }
                    }
                }
            });

            const newDensity = Math.min(1, Math.max(0, density + modifier));
            if (density <= 0.3 && newDensity > 0.3) {
                console.log('land to ocean');
            } else if (density > 0.3 && newDensity <= 0.3) {
                console.log('ocean to land');
            }
            density = newDensity;

            let temperature = baseTemperature(platePoint[0], platePoint[1]);
            if (density <= 0.25) {
                temperature /= Math.exp(1.0 - density / 0.3);
            }
            //temperature *= lerp(0.8, 1.2, 1.0 - density / 1.0);

            let color = new Three.Color(0, 0, 1);
            if (density <= 0.3) {
                color = new Three.Color(0, 1.0 - density / 0.3, 0);
                //color = new Three.Color('brown');
            } else {
                color = new Three.Color(0, 0, 1.0 - density / 1.0);
            }

            if (temperature < 0.3) {
                color = new Three.Color(1.0, 1.0, 1.0);
            } if (temperature > 0.7 && density <= 0.3) {
                color = new Three.Color(temperature / 1.0, temperature / 1.0, 0);
            }

            /*if (p === vt.rawPoints.count - 1) {
                color = new Three.Color(0, 1, 0);
            } else if (neighborsLastPlate) {
                color = new Three.Color(1, 0, 0);
            } else {
                color = new Three.Color(0, 0, 1);
            }*/

            for (let i = 0; i < v.length; i++) {
                const next = i + 1 < v.length ? i + 1 : 0;
                colors.push(...color.toArray(), ...color.toArray(), ...color.toArray());
                vertices.push(...new Three.Vector3().copy(v[next]).normalize().toArray(), ...new Three.Vector3().copy(v[i]).normalize().toArray(), ...new Three.Vector3().copy(point).normalize().toArray());
            }
        });
        console.timeEnd('threevoronoi');

        const voronoiMesh = new Three.BufferGeometry();
        voronoiMesh.setAttribute('position', new Three.BufferAttribute(new Float32Array(vertices), 3));
        voronoiMesh.setAttribute('color', new Three.BufferAttribute(new Float32Array(colors), 3));

        const vmesh = new Three.Mesh(voronoiMesh, new Three.MeshBasicMaterial({vertexColors: true, wireframe: false, side: Three.FrontSide}));
        vmesh.position.set(-100, 0, 0);
        vmesh.scale.setScalar(50);
        scene.add(vmesh);

        const tiny = new Three.Mesh(geometry.planets.huge, materials.planets.terran);
        tiny.visible = true;
        tinyPlanetGroup.add(tiny);

        const tinyCloudMaterial = new Three.MeshPhongMaterial({
            transparent: true,
            side: Three.DoubleSide,
            //blending: Three.AdditiveBlending,
        });
        const tinyClouds = new Three.Mesh(tiny.geometry, tinyCloudMaterial);
        tinyClouds.scale.multiplyScalar(1.005);
        tinyClouds.visible = false;
        tinyPlanetGroup.add(tinyClouds);

        new Three.TextureLoader().load('Paradise_Clouds.png', (cloudTexture) => {
            tinyCloudMaterial.map = cloudTexture;
            //tinyCloudMaterial.alphaMap = cloudTexture;
            tinyClouds.visible = true;
        });

        new Three.TextureLoader().load('Paradise_NormalClouds.png', (cloudTexture) => {
            tinyCloudMaterial.normalMap = cloudTexture;
        })

        const giantWorldPosition = new Three.Vector3();
        const tinyWorldPosition = new Three.Vector3();
        giantPlanetGroup.getWorldPosition(giantWorldPosition);
        tinyPlanetGroup.getWorldPosition(tinyWorldPosition);

        const stars = new Array<AtmosphereStar>({
            position: new Three.Vector3(0, 0, 0),
            color: pointLight.color,
            e: 15,
        }/*, {
            position: new Three.Vector3(500, 0, 0),
            color: new Three.Color('red'),
            e: 10,
        }*/);

        const tinyAtmosphereMaterial = new AtmosphereMaterialV2({
            planetRadius: 27,
            atmosphereRadius: 30,
            wavelength: new Three.Vector3(700, 530, 440),
            falloffFactor: 15,
            densityModifier: 1,
            scatteringStrength: 1,
            gravity: -0.9,
            planetPosition: tinyWorldPosition,
            stars: new Array<AtmosphereStar>({
                position: new Three.Vector3(0, 0, 0),
                color: new Three.Color('white'),
                e: 15,
            }),
        });
        /*new AtmosphereMaterial({
            outerRadius: 16,
            innerRadius: 15,
            planetWorldPosition: tinyWorldPosition,
            wavelength: new Three.Vector3(0.3, 0.7, 1.0),
            kr: 0.0166,//0.166,//0.166,
            km: 0.0025,//0.0025,//0.0025,
            scale: 4,
            gravity: -0.75,
            stars,
        });*/

        const tinyAtmosphere = new Three.Mesh(new Three.SphereBufferGeometry(30, 512, 512), tinyAtmosphereMaterial);
        tinyPlanetGroup.add(tinyAtmosphere);

        const giantAtmosphereMaterial = new AtmosphereMaterialV2({
            planetRadius: 27,
            atmosphereRadius: 30,
            wavelength: new Three.Vector3(700, 530, 440),
            falloffFactor: 15,
            densityModifier: 1,
            scatteringStrength: 1,
            gravity: -0.9,
            planetPosition: giantWorldPosition,
            stars: new Array<AtmosphereStar>({
                position: new Three.Vector3(0, 0, 0),
                color: new Three.Color('#ff4112'),
                e: 15,
            }),
        });
        /*new AtmosphereMaterial({
            outerRadius: 28,
            innerRadius: 27,
            planetWorldPosition: giantWorldPosition,
            wavelength: new Three.Vector3(0.3, 0.5, 0.7),
            kr: 0.00166,
            km: 0.00025,
            scale: 2,
            gravity: -0.8,
            stars,/*: new Array<AtmosphereStar>({
                position: new Three.Vector3(0, 0, 0),
                color: new Three.Color('#ff4112'),
                e: 15,
            }),*/
        //});

        const giantAtmosphere = new Three.Mesh(new Three.SphereBufferGeometry(30, 512, 512), giantAtmosphereMaterial);
        giantPlanetGroup.add(giantAtmosphere);

        const backgroundScale = aspectRatio > backgroundAspectRatio
            ? new Three.Vector2(1, backgroundAspectRatio / aspectRatio)
            : new Three.Vector2(aspectRatio / backgroundAspectRatio, 1);
        const backgroundPass = new TexturePass(materials.background);
        backgroundPass.clear = true;
        backgroundPass.needsSwap = false;
        backgroundPass.material = new ScaledTextureMaterial({scale: backgroundScale});
        backgroundPass.uniforms = backgroundPass.material.uniforms;

        const clearColor = new Three.Color();
        renderer.getClearColor(clearColor);
        const clearAlpha = renderer.getClearAlpha();

        //const aaRenderPass = new SSAARenderPass(scene, mainCamera, clearColor, clearAlpha);
        //const aaRenderPass = new TAARenderPass(scene, mainCamera, new Three.Color('black'), 1.0);
        //aaRenderPass.needsSwap = true;
        //aaRenderPass.sampleLevel = 16;

        const mainView = new EffectView({
            renderer,
            scene,
            camera: mainCamera,
            backgroundEffects: new Array<Pass>(backgroundPass),
            //postProcessingEffects: new Array<Pass>(fxaaPass),
            clearColor: false,
            //antialias: true,
        });

        const resizeObserver = new ResizeObserver((entries) => {
            const { width: newWidth, height: newHeight } = entries[0].contentRect;
            const aspectRatio = newWidth / newHeight;

            renderer.setSize(newWidth, newHeight, false);

            oCamera.left = -newWidth / 4;
            oCamera.top = newHeight / 4;
            oCamera.right = newWidth / 4;
            oCamera.bottom = -newHeight / 4;
            oCamera.updateProjectionMatrix();

            pCamera.aspect = aspectRatio;
            pCamera.updateProjectionMatrix();

            (backgroundPass.material.uniforms.vScale.value as Three.Vector2) = aspectRatio > backgroundAspectRatio
                ? new Three.Vector2(1, backgroundAspectRatio / aspectRatio)
                : new Three.Vector2(aspectRatio / backgroundAspectRatio, 1);

            mainView.onResize(new Three.Vector2(newWidth, newHeight));
        });

        resizeObserver.observe(canvas);

        let orthographicMode = true;

        const onClick = (e: MouseEvent) => {
            //const raycaster = new Three.Raycaster();
            //raycaster.setFromCamera({x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1}, mainCamera);
            //const intersection = raycaster.intersectObjects(scene.children)
            //if (intersection.length) {
            //    intersection[0].object.position.y += 100;
            //}
            if (orthographicMode) {
                mainView.camera = mainView.camera = pCamera;
                
            } else {
                mainView.camera = mainView.camera = oCamera;
            }

            orthographicMode = !orthographicMode;
        }

        canvas.addEventListener('click', onClick);

        const f: FrameRequestCallback = (timestamp) => {
            if (previousTimestampRef.current) {
                const delta = timestamp - previousTimestampRef.current;

                giant.rotation.z += Math.PI * 2 / 10000 * delta;
                tiny.rotation.z += Math.PI * 2 / 90000 * delta;
                tinyClouds.rotation.z += Math.PI * 2 / 20000 * delta;
                tinyGroup.rotation.z += Math.PI * 2 / 42000 * delta;
                giantGroup.rotation.z += Math.PI * 2 / 30000 * delta;
                vmesh.rotation.z -= Math.PI / 20000 * delta;

                const tinyWorldPosition = new Three.Vector3();
                tinyAtmosphere.getWorldPosition(tinyWorldPosition);
                const giantWorldPosition = new Three.Vector3();
                giantAtmosphere.getWorldPosition(giantWorldPosition);

                tinyAtmosphereMaterial.uniforms.vPlanetWorldOrigin.value = tinyWorldPosition;
                giantAtmosphereMaterial.uniforms.vPlanetWorldOrigin.value = giantWorldPosition;

                //cameraGroup.rotation.z += Math.PI / 5000 * delta;
                //pCamera.position.copy(tinyWorldPosition);
                //pCamera.position.y += 100;
                //pCamera.lookAt(tinyWorldPosition);
                //pCamera.updateProjectionMatrix();

                mainView.render();
            }

            previousTimestampRef.current = timestamp;
            animationFrameHandleRef.current = requestAnimationFrame(f);
        }

        animationFrameHandleRef.current = requestAnimationFrame(f);

        return () => {
            resizeObserver.disconnect();
            canvas.removeEventListener('click', onClick);
            cancelAnimationFrame(animationFrameHandleRef.current);
            renderer.dispose();
        }
    }, [geometry, materials]);

    return null;
}

export const StarMapCanvas: React.FC<StarMapProps> = ({machine}) => {
    const canvasRef = useRef(null! as HTMLCanvasElement);

    return (
        <canvas className="StarMap" ref={canvasRef}>
            {canvasRef.current
            ? <Renderer canvas={canvasRef.current} machine={machine} />
            : null}
        </canvas>
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
