import { OrthographicCamera } from '@react-three/drei';
import { Canvas,  ThreeEvent, useLoader, useThree } from '@react-three/fiber';
import { useGesture } from '@use-gesture/react';
import { useActor, useSelector } from '@xstate/react';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Pass } from 'three/examples/jsm/postprocessing/Pass';
import { TexturePass } from 'three/examples/jsm/postprocessing/TexturePass';
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
import { AtmosphereMaterial, AtmosphereStar } from '../Materials/AtmosphereMaterial';

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
            antialias: true,
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

        const pCamera = new Three.PerspectiveCamera(50, aspectRatio, 0.1, 10000);
        pCamera.position.set(0, 500, 0);
        pCamera.lookAt(0, 0, 0);
        pCamera.updateProjectionMatrix();

        const mainCamera = oCamera;

        const scene = new Three.Scene();

        const ambientLight = new Three.AmbientLight();
        ambientLight.intensity = 0.5;

        const blue = new Three.Mesh(geometry.stars.supergiant, materials.stars.blue);
        blue.position.set(0, 0, 0);

        const yellow = new Three.Mesh(geometry.stars.medium, materials.stars.yellow);
        yellow.position.set(-100, 0, 0);

        const giantGroup = new Three.Group();
        const giantPlanetGroup = new Three.Group();
        giantPlanetGroup.position.set(0, -200, 0);
        giantGroup.add(giantPlanetGroup);

        const giant = new Three.Mesh(geometry.planets.huge, materials.planets.gasgiant);
        giantPlanetGroup.add(giant);

        const tinyGroup = new Three.Group();

        const tinyPlanetGroup = new Three.Group();
        tinyPlanetGroup.position.set(0, -100, 0);
        tinyGroup.add(tinyPlanetGroup);

        const tiny = new Three.Mesh(geometry.planets.tiny, materials.planets.ocean);
        tiny.visible = true;
        tinyPlanetGroup.add(tiny);

        const tinyCloudMaterial = new Three.MeshLambertMaterial({
            transparent: true,
            side: Three.DoubleSide,
        });
        const tinyClouds = new Three.Mesh(tiny.geometry, tinyCloudMaterial);
        tinyClouds.scale.setScalar(1.01);
        tinyClouds.visible = false;
        tinyPlanetGroup.add(tinyClouds);

        new Three.TextureLoader().load('Clouds-EQUIRECTANGULAR-1-2048x1024.png', (cloudTexture) => {
            tinyCloudMaterial.map = cloudTexture;
            tinyCloudMaterial.alphaMap = cloudTexture;
            tinyClouds.visible = true;
        });

        const pointLight = new Three.PointLight(new Three.Color('#537bff'));
        pointLight.intensity = 1;
        pointLight.position.set(0, 0, 0);

        scene.add(pointLight, tinyGroup, giantGroup, blue, ambientLight);

        const giantWorldPosition = new Three.Vector3();
        const tinyWorldPosition = new Three.Vector3();
        giantPlanetGroup.getWorldPosition(giantWorldPosition);
        tinyPlanetGroup.getWorldPosition(tinyWorldPosition);

        const stars = new Array<AtmosphereStar>({
            position: new Three.Vector3(-Math.tan(Math.PI / 4) * 500, 0, 500),
            color: pointLight.color,
            e: 25,
        }/*, {
            position: new Three.Vector3(500, 0, 0),
            color: new Three.Color('red'),
            e: 10,
        }*/);

        const tinyAtmosphereMaterial = new AtmosphereMaterial({
            outerRadius: 17,
            innerRadius: 15,
            planetWorldPosition: tinyWorldPosition,
            wavelength: new Three.Vector3(0.3, 0.7, 1.0),
            kr: 0.0166,//0.166,
            km: 0.0025,//0.0025,
            gravity: -0.9,
            stars,
        });

        const tinyAtmosphere = new Three.Mesh(tiny.geometry, tinyAtmosphereMaterial);
        tinyPlanetGroup.add(tinyAtmosphere);

        const giantAtmosphereMaterial = new AtmosphereMaterial({
            outerRadius: 29,
            innerRadius: 27,
            planetWorldPosition: giantWorldPosition,
            wavelength: new Three.Vector3(0.3, 0.7, 1.0),
            kr: 0.0166,
            km: 0.0025,
            gravity: -0.9,
            stars,
        });

        const giantAtmosphere = new Three.Mesh(giant.geometry, giantAtmosphereMaterial);
        giantPlanetGroup.add(giantAtmosphere);

        const backgroundScale = aspectRatio > backgroundAspectRatio
            ? new Three.Vector2(1, backgroundAspectRatio / aspectRatio)
            : new Three.Vector2(aspectRatio / backgroundAspectRatio, 1);
        const backgroundPass = new TexturePass(materials.background);
        backgroundPass.clear = true;
        backgroundPass.needsSwap = false;
        backgroundPass.material = new ScaledTextureMaterial({scale: backgroundScale});
        backgroundPass.uniforms = backgroundPass.material.uniforms;

        const mainView = new EffectView({
            renderer,
            scene,
            camera: mainCamera,
            backgroundEffects: new Array<Pass>(backgroundPass),
            clearColor: new Three.Color('red'),
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

        const onClick = (e: MouseEvent) => {
            const raycaster = new Three.Raycaster();
            raycaster.setFromCamera({x: (e.clientX / window.innerWidth) * 2 - 1, y: -(e.clientY / window.innerHeight) * 2 + 1}, mainCamera);
            const intersection = raycaster.intersectObjects(scene.children)
            if (intersection.length) {
                intersection[0].object.position.y += 100;
            }
        }

        canvas.addEventListener('click', onClick);

        const f: FrameRequestCallback = (timestamp) => {
            if (previousTimestampRef.current) {
                const delta = timestamp - previousTimestampRef.current;

                giant.rotation.z += Math.PI * 2 / 10000 * delta;
                tiny.rotation.z += Math.PI * 2 / 10000 * delta;
                tinyClouds.rotation.z += Math.PI * 2 / 5000 * delta;
                tinyGroup.rotation.z += Math.PI * 2 / 10000 * delta;
                giantGroup.rotation.z += Math.PI * 2 / 20000 * delta;

                const tinyWorldPosition = new Three.Vector3();
                tinyAtmosphere.getWorldPosition(tinyWorldPosition);
                const giantWorldPosition = new Three.Vector3();
                giantAtmosphere.getWorldPosition(giantWorldPosition);

                tinyAtmosphereMaterial.uniforms.vPlanetWorldPosition.value = tinyWorldPosition;
                giantAtmosphereMaterial.uniforms.vPlanetWorldPosition.value = giantWorldPosition;

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
