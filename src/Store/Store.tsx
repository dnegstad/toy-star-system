import React, { useCallback, useContext, useMemo, useReducer, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';

type Expand<T> = T extends infer O ? { [K in keyof O]: O[K] } : never;

const HasIdentity = z.object({
    id: z.string().uuid(),
    kind: z.string(),
});
type HasIdentity = z.infer<typeof HasIdentity>;

const HasPosition = z.object({
    x: z.number(),
    y: z.number(),
});
type HasPosition = z.infer<typeof HasPosition>;

export const StarType = z.union([
    z.literal('blue'),
    z.literal('white'),
    z.literal('yellow'),
    z.literal('orange'),
    z.literal('red'),
]);
export type StarType = Expand<z.infer<typeof StarType>>;

export const SystemRecord = z.object({
    kind: z.literal('system'),
    name: z.string(),
    starType: StarType,
}).and(HasIdentity).and(HasPosition);
export type SystemRecord = Expand<z.infer<typeof SystemRecord>>;

export const PlanetRecord = z.object({
    kind: z.literal('planet'),
    name: z.string(),
    biome: z.union([
        z.literal('barren'),
        z.literal('volcanic'),
        z.literal('ocean')]),
}).and(HasIdentity).and(HasPosition);
export type PlanetRecord = Expand<z.infer<typeof PlanetRecord>>;

export const ShipRecord = z.object({
    kind: z.literal('ship'),
}).and(HasIdentity).and(HasPosition);
export type ShipRecord = Expand<z.infer<typeof ShipRecord>>;

export type Entity =
| SystemRecord
| PlanetRecord
| ShipRecord;

type PlanetsState = Record<string, PlanetRecord>;

type GameState = {
    planets: PlanetsState;
}

type Action = {
    type: string;
};

type AddPlanetAction = Action & {
    type: 'planet/add',
    name: string,
    biome: 'barren' | 'ocean' | 'volcanic',
    x: number,
    y: number,
}

type RemovePlanetAction = Action & {
    type: 'planet/remove',
    id: string,
}

type GameAction =
| AddPlanetAction
| RemovePlanetAction;

const planetsReducer = (state: PlanetsState, action: GameAction): PlanetsState => {
    switch (action.type) {
        case 'planet/add':
            const id = crypto.getRandomValues(new Int8Array(16)).toString();
            return {
                ...state,
                [id]: {
                    id,
                    kind: 'planet',
                    biome: action.biome,
                    name: action.name,
                    x: action.x,
                    y: action.y,
                },
            };
        case 'planet/remove':
            
        default:
            return state;
    }
}

const reducer = (state: GameState, action: GameAction): GameState => {
    return {
        ...state,
        planets: planetsReducer(state.planets, action),
    };
}

const planetScores: Array<[number, 'barren' | 'ocean' | 'volcanic']> = [
    [.07, 'barren'],
    [.03, 'ocean'],
    [.03, 'volcanic'],
];

const totalScores = planetScores.reduce((total, [score]) => total + score, 0);

const pickPlanet = () => {
    let seed = Math.random() * totalScores;
    for (let i = 0; i < planetScores.length; i++) {
        if (seed < planetScores[i][0]) {
            return planetScores[i][1];
        }

        seed -= planetScores[i][0];
    }

    return null;
}

const rectanglePlotter = (angle: number, width: number, height: number): number => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    if (width * Math.abs(sin) < height * Math.abs(cos)) {
        const x = Math.sign(cos) * width / 2;
        return Math.sqrt(Math.pow(x, 2) + Math.pow(Math.tan(angle) * x, 2));
    } else {
        const y = Math.sign(sin) * height / 2;
        return Math.sqrt(Math.pow(y, 2) + Math.pow((cos / sin) * y, 2));
    }
}

const tooClose = (planets: PlanetsState, x: number, y: number, min: number): boolean => {
    return Object.entries(planets).some(([,planet]) => {
        if (Math.sqrt(Math.pow(x - planet.x, 2) + Math.pow(y - planet.y, 2)) < min) {
            return true;
        }

        return false;
    });
}

const generateRandomPlanets = () => {
    let planets: PlanetsState = {};

    /*
    for (let i = 0; i < 150; i++) {
        const biome = pickPlanet();
        if (biome !== null) {
            const id = uuidv4();
            let retry = 100;
            while (retry > 0) {
                const phi = Math.random() * 2 * Math.PI;
                const r = Math.random() * rectanglePlotter(phi, 950, 950);
                const x = Math.cos(phi) * r;
                const y = Math.sin(phi) * r;
                if (tooClose(planets, x, y, 30)) {
                    retry -= 1;
                    continue;
                }
                planets[id] = {
                    id,
                    kind: 'planet',
                    biome: biome,
                    name: `planet ${i}: ${x},${y}`,
                    x,
                    y,
                };
                break;
            }
        }
    }
    */
    planets = {
        'f465158f-775b-457d-b390-b643c12eb3e2': {
            id: 'f465158f-775b-457d-b390-b643c12eb3e2',
            kind: 'planet',
            name: 'planet',
            biome: 'barren',
            x: 40,
            y: 0,
        },
        '02a4fb60-4e48-415e-b81d-3d049aac1881': {
            id: '02a4fb60-4e48-415e-b81d-3d049aac1881',
            kind: 'planet',
            name: 'planet',
            biome: 'barren',
            x: -40,
            y: 0,
        },
        'f37bbde5-975b-4a56-ae5e-2ed4a5f711f7': {
            id: 'f37bbde5-975b-4a56-ae5e-2ed4a5f711f7',
            kind: 'planet',
            name: 'planet',
            biome: 'barren',
            x: 0,
            y: 40,
        },
        'd70c2ab7-c934-458a-a678-8f4b0f79d387': {
            id: 'd70c2ab7-c934-458a-a678-8f4b0f79d387',
            kind: 'planet',
            name: 'planet',
            biome: 'barren',
            x: 0,
            y: -40,
        },
    }

    console.log(Object.entries(planets).length);

    /*
    for (let x = 1; x < 19; x++) {
        for (let y = 1; y < 19; y++) {
            const biome = pickPlanet();
            if (biome !== null) {
                const id = uuidv4();
                planets[id] = {
                    id,
                    kind: 'planet',
                    biome: biome,
                    name: `planet ${x}:${y}`,
                    x: Math.round(Math.random() * 20) + (50 * x) - 485,
                    y: Math.round(Math.random() * 20) + (50 * y) - 485,
                };
            }
        }
    }
    */

    return planets;
}

const initialState = (): GameState => {
    return {
        planets: generateRandomPlanets(),
    };
}

type GetValueCallback<T> = (state: GameState) => T;
type GetValueFn = <T>(callback: GetValueCallback<T>) => T;
type GameStateContext = {
    getValue: GetValueFn;
    dispatch: React.Dispatch<GameAction>;
};

export const GameStateContext = React.createContext<GameStateContext>({
    getValue: <T,>(callback: GetValueCallback<T>) => callback(initialState()),
    dispatch: (action: GameAction) => {},
});

export const useDispatch = () => {
    const {dispatch} = useContext(GameStateContext);

    return dispatch;
}

export const useSelect = <T,>(callback: GetValueCallback<T>): T => {
    const {getValue} = useContext(GameStateContext);

    return getValue(callback);
}

export const GameStateStore: React.FC<{}> = ({children}) => {
    const [gameState, dispatch] = useReducer(reducer, initialState());

    const getValue = useCallback(<T,>(callback: GetValueCallback<T>): T => {
        return callback(gameState);
    }, [gameState]);

    return (
        <GameStateContext.Provider value={{dispatch, getValue}}>
            {children}
        </GameStateContext.Provider>
    )
}

export const withGameStateStore = <T extends {}>(WrappedComponent: React.ComponentType<T>) => {
    const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';

    const componentWithGameStateStore = (props: T) => {
        return (
            <GameStateStore>
                <WrappedComponent {...props} />
            </GameStateStore>
        );
    };

    componentWithGameStateStore.displayName = `withGameStateStore(${displayName})`;

    return componentWithGameStateStore;
}