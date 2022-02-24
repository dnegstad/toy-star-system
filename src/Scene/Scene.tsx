import { Color, useFrame, Vector4 } from '@react-three/fiber';
import React, { useMemo } from 'react';
import { useRef } from 'react';
import * as Three from 'three/src/Three';

export type SceneProps = {
    camera: Three.Camera;
    clearColor?: boolean | Color;
    clearDepth?: boolean;
    clearStencil?: boolean;
    clearAlpha?: number;
    scissor?: Vector4;
    viewport?: Vector4;
    order?: number;
}

const toThreeVector4 = (vector: Vector4): Three.Vector4 => {
    if (Array.isArray(vector)) {
        return new Three.Vector4().fromArray(vector);
    } else if (vector instanceof Three.Vector4) {
        return vector;
    } else {
        return new Three.Vector4(vector, vector, vector, vector);
    }
}

const toThreeColor = (color: Color): Three.Color => {
    if (Array.isArray(color)) {
        return new Three.Color().fromArray(color);
    } else if (color instanceof Three.Color) {
        return color;
    } else {
        return new Three.Color(color);
    }
}

type SceneContextState = {
    scene: Three.Scene;
    camera: Three.Camera;
    scissor?: Three.Vector4;
    viewport?: Three.Vector4;
}

export const SceneContext = React.createContext({} as SceneContextState);

export const Scene: React.FC<SceneProps> = ({
    children,
    camera,
    clearColor = true,
    clearDepth = true,
    clearStencil = true,
    clearAlpha,
    scissor,
    viewport,
    order = 1}) => {
    const scene = useRef({} as Three.Scene);

    const viewportVector = useMemo(() => viewport ? toThreeVector4(viewport) : undefined, [viewport]);
    const scissorVector = useMemo(() => scissor ? toThreeVector4(scissor) : undefined, [scissor]);
    const clearColorVector = useMemo(() => typeof clearColor !== 'boolean' ? toThreeColor(clearColor) : undefined, [clearColor]);

    useFrame(({gl}) => {
        gl.autoClear = false;

        const originalViewport = new Three.Vector4();
        const originalSciscor = new Three.Vector4();
        const originalClearColor = new Three.Color();
        gl.getViewport(originalViewport);
        gl.getScissor(originalSciscor);
        gl.getClearColor(originalClearColor);
        const originalClearAlpha = gl.getClearAlpha();

        if (clearColorVector) {
            gl.setClearColor(clearColorVector, clearAlpha);
        } else if (typeof clearAlpha === 'number') {
            console.log(clearAlpha);
            gl.setClearAlpha(clearAlpha);
        }

        if (viewportVector) {
            gl.setViewport(viewportVector);
        }

        if (scissorVector) {
            gl.setScissor(scissorVector);
            gl.setScissorTest(true);
        }

        if (clearColor || typeof clearAlpha === 'number') {
            gl.clearColor();
        }

        if (clearDepth) {
            gl.clearDepth();
        }

        if (clearStencil) {
            gl.clearStencil();
        }

        gl.render(scene.current, camera);

        if (viewport) {
            gl.setViewport(originalViewport);
        }
        if (scissor) {
            gl.setScissor(originalSciscor);
            gl.setScissorTest(false);
        }
        if (clearColorVector) {
            gl.setClearColor(originalClearColor, originalClearAlpha);
        } else if (typeof clearAlpha === 'number') {
            gl.setClearAlpha(originalClearAlpha);
        }
    }, order);

    const context = useMemo(() => ({
        scene: scene.current,
        camera: camera,
        scissor: scissorVector,
        viewport: viewportVector,
    }), [scene.current, camera, scissorVector, viewportVector]);

    return (
        <scene ref={scene}>
            <SceneContext.Provider value={context}>
                {children}
            </SceneContext.Provider>
        </scene>
    );
}