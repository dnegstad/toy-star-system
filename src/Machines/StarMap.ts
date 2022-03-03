import { createMachine, assign, sendUpdate } from 'xstate';
import { PlanetSize, PlanetType, StarSize, StarType } from '../Data/Database';

export type BackgroundData = {
    texture: string;
}

export type SphereGeometryData = {
    radius: number;
    segments: number;
}

export type TextureStarTypeData = {
    color: string;
    texture: string;
    emissiveIntensity?: number;
}

export const isTextureStarTypeData = (maybeTextureData: unknown): maybeTextureData is TextureStarTypeData => {
    const textureData = maybeTextureData as TextureStarTypeData;

    return typeof textureData?.texture === 'string';
}

export type ShaderStarTypeData = {
    color: string;
    highTemp: number;
    lowTemp: number;
}

export type StarTypeData =
| TextureStarTypeData
| ShaderStarTypeData;

export type PlanetTypeData = {
    texture: string;
    shininess: number;
}

export type MaterialData = {
    background: BackgroundData;
    starColors: Record<StarType, StarTypeData>;
    starSizes: Record<StarSize, SphereGeometryData>;
    planetTypes: Record<PlanetType, PlanetTypeData>;
    planetSizes: Record<PlanetSize, SphereGeometryData>;
}

export type StarMapContext = {
    selectedSystem?: string;
    systemDetailWindowWidth: number;
    systemDetailWindowHeight: number;
    materialData: MaterialData;
};

export type StarMapEvent =
| { type: 'SYSTEM.SELECT', value: string }
| { type: 'SYSTEM.DESELECT' };

export const starMapMachine = createMachine<StarMapContext, StarMapEvent>({
    id: 'starMap',
    context: {
        systemDetailWindowWidth: 600,
        systemDetailWindowHeight: 600,
        materialData: {
            background: {
                texture: '2k_stars_milky_way.jpg',
            },
            starColors: {
                'blue': {
                    color: '#537bff',
                    highTemp: 30000,
                    lowTemp: 12000,
                },
                'white': {
                    color: '#f0f1ff',
                    highTemp: 9500,
                    lowTemp: 8200,
                },
                'yellow': {
                    color: '#ffdf2a',
                    highTemp: 7200,
                    lowTemp: 3000,
                },
                'orange': {
                    color: '#fd8d24',
                    highTemp: 5200,
                    lowTemp: 4000,
                },
                'red': {
                    color: '#ff4112',
                    highTemp: 3800,
                    lowTemp: 1200,
                },
            },
            starSizes: {
                'supergiant': {
                    radius: 40,
                    segments: 32,
                },
                'giant': {
                    radius: 36,
                    segments: 32,
                },
                'large': {
                    radius: 32,
                    segments: 32,
                },
                'medium': {
                    radius: 28,
                    segments: 16,
                },
                'small': {
                    radius: 24,
                    segments: 16,
                },
                'dwarf': {
                    radius: 20,
                    segments: 16,
                },
            },
            planetTypes: {
                'barren': {
                    texture: 'Barren01.png',
                    shininess: 0,
                },
                'desert': {
                    texture: 'Desert01.png',
                    shininess: 0,
                },
                'volcanic': {
                    texture: 'Inferno01.png',
                    shininess: 0,
                },
                'swamp': {
                    texture: 'Swamp01.png',
                    shininess: 0,
                },
                'ocean': {
                    texture: 'Oceanic-EQUIRECTANGULAR-1-2048x1024.png',
                    shininess: 40,
                },
                'tundra': {
                    texture: 'Ice-EQUIRECTANGULAR-2-2048x1024.png',
                    shininess: 20,
                },
                'terran': {
                    texture: 'Terran01.png',
                    shininess: 0,
                },
                'toxic': {
                    texture: 'Toxic01.png',
                    shininess: 0,
                },
                'gasgiant': {
                    texture: 'worldgen.gif',
                    shininess: 0,
                },
            },
            planetSizes: {
                'tiny': {
                    radius: 15,
                    segments: 64,
                },
                'small': {
                    radius: 18,
                    segments: 64,
                },
                'medium': {
                    radius: 21,
                    segments: 64,
                },
                'large': {
                    radius: 24,
                    segments: 64,
                },
                'huge': {
                    radius: 27,
                    segments: 128,
                },
                'gasgiant': {
                    radius: 30,
                    segments: 128,
                },
                'asteroids': {
                    radius: 2,
                    segments: 64,
                },
            },
        },
    },
    initial: 'default',
    states: {
        default: {},
        systemSelected: {
            initial: 'systemDetailView'
        },
    },
    on: {
        'SYSTEM.DESELECT': {
            target: 'default',
            actions: [
                assign({
                    selectedSystem: (_) => {
                        console.log('Action SYSTEM.DESELECT');
                        return undefined;
                    },
                }),
                sendUpdate(),
            ],
        },
        'SYSTEM.SELECT': {
            target: 'systemSelected',
            actions: [
                assign({
                    selectedSystem: (_, {value}) => {
                        console.log('Action SYSTEM.SELECT:', value);
                        return value;
                    },
                }),
                sendUpdate(),
            ],
        },
    },
});
export type StarMapMachine = typeof starMapMachine;
