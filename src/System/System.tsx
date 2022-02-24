import { Circle } from '@react-three/drei';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useContext, useLayoutEffect, useMemo, useRef } from 'react';
import * as Three from 'three/src/Three';
import { db, PlanetRecord, StarSystemRecord, StarType } from '../Data/Database';
import { GlowMaterial } from '../Materials/GlowMaterial';
import { SunMaterial } from '../Materials/SunMaterial';
import { Planet } from '../Planet/Planet';
import { SceneContext } from '../Scene/Scene';

export type SystemProps = {
    starSystem: StarSystemRecord;
    selected: boolean;
    onClick: (event: ThreeEvent<MouseEvent>) => void;
}

const Degree = Math.PI * 2 / 360;
const toRadians = (deg: number): number => {
    return Degree * deg;
}

const superGiantStarGeometry = new Three.SphereBufferGeometry(16, 32, 32).rotateX(Math.PI / 2);
const superGiantStarGlowGeometry = new Three.SphereBufferGeometry(16, 16, 16);
const giantStarGeometry = new Three.SphereBufferGeometry(15, 32, 32).rotateX(Math.PI / 2);
const giantStarGlowGeometry = new Three.SphereBufferGeometry(15, 16, 16);
const largeStarGeometry = new Three.SphereBufferGeometry(12, 32, 32).rotateX(Math.PI / 2);
const mediumStarGeometry = new Three.SphereBufferGeometry(10, 16, 16).rotateX(Math.PI / 2);
const smallStarGeometry = new Three.SphereBufferGeometry(8, 16, 16).rotateX(Math.PI / 2);
const dwarfStarGeometry = new Three.SphereBufferGeometry(6, 16, 16).rotateX(Math.PI / 2);

const blueSunColor = new Three.Color('#537bff');
const blueSunGeometry = superGiantStarGeometry;
const blueSunGlowGeometry = superGiantStarGlowGeometry;
const blueSunMaterial = new SunMaterial({octaves: 4, highTemp: 30000, lowTemp: 12000});
const blueSunGlowMaterial = new GlowMaterial({ color: blueSunColor, scale: 2 })

const whiteSunColor = new Three.Color('#f0f1ff');
const whiteSunGeometry = giantStarGeometry;
const whiteSunGlowGeometry = giantStarGlowGeometry;
const whiteSunMaterial = new SunMaterial({octaves: 4, highTemp: 9500, lowTemp: 8200});
const whiteSunGlowMaterial = new GlowMaterial({ color: whiteSunColor, scale: 2});

const yellowSunColor = new Three.Color('#ffdf2a');
const yellowSunGeometry = mediumStarGeometry;
const yellowSunMaterial = new SunMaterial({octaves: 4, highTemp: 7200, lowTemp: 3000});
const yellowSunGlowMaterial = new GlowMaterial({ color: yellowSunColor, scale: 2 });

const orangeSunColor = new Three.Color('#fd8d24');
const orangeSunGeometry = largeStarGeometry;
const orangeSunMaterial = new SunMaterial({octaves: 4, highTemp: 5200, lowTemp: 4000});
const orangeSunGlowMaterial = new GlowMaterial({ color: orangeSunColor, scale: 2 });

const redSunColor = new Three.Color('#ff4112');
const redSunGeometry = smallStarGeometry;
const redSunMaterial = new SunMaterial({octaves: 4, highTemp: 3800, lowTemp: 1200});
const redSunGlowMaterial = new GlowMaterial({ color: redSunColor, scale: 2 });

//const selectionRingGeometry = new Three.RingGeometry(20, 22, 32, 32, 0, Math.PI * 2 / 8);
const selectionRingGeometry = new Three.RingGeometry(40, 44, 32, 32, toRadians(110), toRadians(140));
const selectionRingMaterial = new Three.MeshBasicMaterial({color: 'green'});

const SystemSelectionRing: React.FC<{}> = () => {
    const selectionRingRef = useRef({} as Three.Group);
    const instancedMeshRef = useRef({} as Three.InstancedMesh);

    useLayoutEffect(() => {
        const xRotation = new Three.Matrix4();
        for (let i = 0; i < 2; i++) {
            const zRotation = new Three.Matrix4().makeRotationZ(i * Math.PI);
            //const rotatedMatrix = temp.matrix.makeRotationY(-Math.PI / 3);
            instancedMeshRef.current.setMatrixAt(i, xRotation.multiply(zRotation));
        }
    }, []);

    return (
        <group ref={selectionRingRef}>
            <instancedMesh args={[selectionRingGeometry, selectionRingMaterial, 2]} ref={instancedMeshRef} />
        </group>
    );
}

type SunMeshProps = {
    starType: StarType;
    camera: Three.Camera;
}

const SunMesh: React.FC<SunMeshProps> = ({starType, camera}) => {
    const sunGlowRef = useRef({} as Three.Mesh);

    const {
        sunColor,
        sunGeometry,
        sunGlowGeometry,
        sunMaterial,
        sunGlowMaterial,
    } = useMemo(() => {
        switch (starType) {
            case 'blue':
                return {
                    sunColor: blueSunColor,
                    sunGeometry: blueSunGeometry,
                    sunGlowGeometry: blueSunGlowGeometry,
                    sunMaterial: blueSunMaterial,
                    sunGlowMaterial: blueSunGlowMaterial,
                };
            case 'white':
                return {
                    sunColor: whiteSunColor,
                    sunGeometry: whiteSunGeometry,
                    sunGlowGeometry: whiteSunGlowGeometry,
                    sunMaterial: whiteSunMaterial,
                    sunGlowMaterial: whiteSunGlowMaterial,
                };
            case 'yellow':
                return {
                    sunColor: yellowSunColor,
                    sunGeometry: yellowSunGeometry,
                    sunGlowGeometry: yellowSunGeometry,
                    sunMaterial: yellowSunMaterial,
                    sunGlowMaterial: yellowSunGlowMaterial,
                };
            case 'orange':
                return {
                    sunColor: orangeSunColor,
                    sunGeometry: orangeSunGeometry,
                    sunGlowGeometry: orangeSunGeometry,
                    sunMaterial: orangeSunMaterial,
                    sunGlowMaterial: orangeSunGlowMaterial,
                };
            default:
                return {
                    sunColor: redSunColor,
                    sunGeometry: redSunGeometry,
                    sunGlowGeometry: redSunGeometry,
                    sunMaterial: redSunMaterial,
                    sunGlowMaterial: redSunGlowMaterial,
                };
        }
    }, [starType]);

    useLayoutEffect(() => {
        const glowWorldPosition = new Three.Vector3();
        const cameraWorldDirection = new Three.Vector3();
        sunGlowRef.current.getWorldPosition(glowWorldPosition);
        camera.getWorldDirection(cameraWorldDirection);
        sunGlowMaterial.viewVector = new Three.Vector3().subVectors(camera.position, glowWorldPosition).projectOnVector(cameraWorldDirection);
    }, []);

    return (
        <>
            <pointLight color={sunColor} intensity={1.5} />
            <mesh geometry={sunGeometry} material={sunMaterial} />
            <mesh geometry={sunGlowGeometry} material={sunGlowMaterial} ref={sunGlowRef} />
        </>
    );
}

export const System: React.FC<SystemProps> = ({starSystem, selected, onClick}) => {
    const camera = useThree((state) => state.camera);
    const nameplate = useRef({} as Three.Mesh);
    const position = useMemo(() => new Three.Vector3(starSystem.x, starSystem.y, 0), []);

    useFrame(({camera}) => {
        nameplate.current.setRotationFromQuaternion(camera.quaternion);
    });

    return (
        <group position={position} onClick={onClick}>
            <Circle args={[10, 32]} position={[0, 0, 75]} ref={nameplate}>
                <meshBasicMaterial color="red" />
            </Circle>
            <Circle args={[120, 16]}>
                <meshBasicMaterial visible={false} />
            </Circle>
            <SunMesh starType={starSystem.starType} camera={camera} />
            {selected ? <SystemSelectionRing /> : null}
        </group> 
    );
}

export const SystemDetail: React.FC<{starSystem: StarSystemRecord}> = ({starSystem}) => {
    const {camera} = useContext(SceneContext);
    const planets = useLiveQuery(() => {
        return db.planets
            .where({starSystemId: starSystem.uuid})
            .toArray();
    }, [starSystem.uuid], new Array<PlanetRecord>());
    const planetsRef = useRef({} as Three.Group);

    const position = useMemo(() => new Three.Vector3(0, 0, 0), []);

    const planetElements = planets.map((planet, i) => {
        return <Planet key={planet.uuid} planet={planet} />
    });

    return (
        <group position={position}>
            <SunMesh starType={starSystem.starType} camera={camera} />
            <group ref={planetsRef}>
                {planetElements}
            </group>
        </group> 
    );
}