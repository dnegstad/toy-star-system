import * as Three from 'three/src/Three';

export type GlowMaterialProperties = {
    color?: Three.Color;
    scale?: number;
}

export class GlowMaterial extends Three.ShaderMaterial {
    constructor({
        color = new Three.Color(1,1,1),
        scale = 1.0,
    }: GlowMaterialProperties = {}) {
        super({
            uniforms: {
                viewVector: {
                    value: new Three.Vector3(0,0,0),
                },
                scale: {
                    value: scale,
                },
                color: {
                    value: new Three.Vector3(...color.toArray()),
                },
            },
            vertexShader: `
                precision highp float;
                uniform vec3 viewVector;
                #ifdef USE_INSTANCING
                    attribute vec3 instanceViewVector;
                #endif
                uniform float scale;
                varying float intensity;
                void main() {
                    #ifdef USE_INSTANCING
                        gl_Position = projectionMatrix * viewMatrix * modelMatrix * instanceMatrix * vec4( position, 1.0 );
                    #else
                        gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                    #endif
                    vec3 actual_normal = vec3(modelMatrix * vec4(normal, 0.0));
                    #ifdef USE_INSTANCING
                        intensity = pow( dot(normalize(instanceViewVector), actual_normal), 6.0 );
                    #else
                        intensity = pow( dot(normalize(viewVector), actual_normal), 6.0 );
                    #endif
                }
            `,
            fragmentShader: `
                precision highp float;
                uniform vec3 color;
                varying float intensity;
                void main() {
                    vec3 glow = color * intensity;
                    gl_FragColor = vec4( glow, 1.0 );
                }
            `,
            side: Three.BackSide,
            blending: Three.AdditiveBlending,
            transparent: true,
        });
    }

    get viewVector() {
        return this.uniforms.viewVector.value as Three.Vector3;
    }

    set viewVector(value: Three.Vector3) {
        this.uniforms.viewVector.value = value;
    }

    get scale() {
        return this.uniforms.scale.value as number;
    }

    set scale(value: number) {
        this.uniforms.scale.value = value;
    }

    get color() {
        const colorVector = this.uniforms.color.value as Three.Vector3;
        return new Three.Color(colorVector.x, colorVector.y, colorVector.z);
    }

    set color(value: Three.Color) {
        this.uniforms.color.value = new Three.Vector3(...value.toArray());
    }
}
