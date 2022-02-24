import { Ring } from '@react-three/drei';
import { Color, useFrame } from '@react-three/fiber';
import React, { useContext, useMemo, useRef } from 'react';
import * as Three from 'three/src/Three';
import { PlanetRecord, PlanetSize } from '../Data/Database';
import { PlanetMaterialContext } from '../StarMap/StarMap';
import './Planet.css';

export enum Owner {
    Unknown,
    Free,
    Player,
    Other,
}

export type PlanetType =
| 'barren'
| 'volcanic'
| 'desert'
| 'terran'
| 'abundant'
| 'ocean'
| 'tundra';

const getPlanetRadius = (size: PlanetSize): number => {
    switch (size) {
        case 'tiny':
            return 5;
        case 'small':
            return 6.5;
        case 'medium':
            return 8;
        case 'large':
            return 9.5;
        case 'huge':
            return 11;
        case 'gasgiant':
            return 12;
        default:
            return 0;
    }
}

const tinyPlanetGeometry = new Three.SphereBufferGeometry(getPlanetRadius('tiny'), 16, 16).rotateX(-Math.PI / 2);
const smallPlanetGeometry = new Three.SphereBufferGeometry(getPlanetRadius('small'), 16, 16).rotateX(-Math.PI / 2);
const mediumPlanetGeometry = new Three.SphereBufferGeometry(getPlanetRadius('medium'), 16, 16).rotateX(-Math.PI / 2);
const largePlanetGeometry = new Three.SphereBufferGeometry(getPlanetRadius('large'), 16, 16).rotateX(-Math.PI / 2);
const hugePlanetGeometry = new Three.SphereBufferGeometry(getPlanetRadius('huge'), 16, 16).rotateX(-Math.PI / 2);
const gasGiantPlanetGeometry = new Three.SphereBufferGeometry(getPlanetRadius('gasgiant'), 16, 16).rotateX(-Math.PI / 2);

type PlanetProps = {
    planet: PlanetRecord;
}

const rotationPlane = 0;//-Math.PI / 3

export const Planet: React.FC<PlanetProps> = ({planet}) => {
    const planetOrbitRef = useRef({} as Three.Group);
    const planetRef = useRef({} as Three.Mesh);

    const startingRotation = useMemo(() => Math.random() * Math.PI * 2, []);

    const planetPosition = useMemo(() => {
        return new Three.Vector3(25 + (25 * planet.orbit), 0, 0);
    }, [planet.orbit]);

    const planetSizeScore = useMemo(() => {
        switch (planet.size) {
            case 'tiny':
                return 10;
            case 'small':
                return 8;
            case 'medium':
                return 6;
            case 'large':
                return 4;
            case 'huge':
                return 2;
            case 'gasgiant':
                return 1;
            case 'asteroids':
                return 0;
        }
    }, [planet.size]);

    const planetGeometry = useMemo(() => {
        switch (planet.size) {
            case 'tiny':
                return tinyPlanetGeometry;
            case 'small':
                return smallPlanetGeometry;
            case 'medium':
                return mediumPlanetGeometry;
            case 'large':
                return largePlanetGeometry;
            case 'huge':
                return hugePlanetGeometry;
            case 'gasgiant':
                return gasGiantPlanetGeometry;
            default:
                return largePlanetGeometry;
        }
    }, [planet.size]);

    const planetMaterials = useContext(PlanetMaterialContext)

    /*const atmosphereGeometry = useMemo(() => {
        const innerRadius = getPlanetRadius(planet.size);
        return new Three.SphereBufferGeometry(innerRadius * 1.05, 16, 16);
    }, [planet.size]);*/

    useFrame((state, delta) => {
        planetOrbitRef.current.rotation.z += (Math.PI * 2 / 10) * delta / (planet.orbit + 1);
        planetRef.current.rotation.z += (Math.PI * 2 / 100) * delta * planetSizeScore;
    });

    return (
        <>
            <Ring args={[planetPosition.x - 1, planetPosition.x + 1, 64, 64]}>
                <meshBasicMaterial color="white" />
            </Ring>
            <group rotation={[0, 0, startingRotation]} ref={planetOrbitRef}>
                <mesh position={planetPosition} geometry={planetGeometry} material={planetMaterials[planet.type]} ref={planetRef} />
            </group>
        </>
    );
}