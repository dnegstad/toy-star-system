import { ShaderMaterial, Vector2 } from 'three';

export type ScaledTextureMaterialProps = {
    scale: Vector2,
};

export class ScaledTextureMaterial extends ShaderMaterial {
    constructor({
        scale,
    }: ScaledTextureMaterialProps) {
        super({
            uniforms: {
                opacity: {
                    value: 1.0,
                },
                tDiffuse: {
                    value: null,
                },
                vScale: {
                    value: scale,
                },
            },
            vertexShader:
            `
                uniform vec2 vScale;
                varying vec2 vUv;
                void main() {
                    vUv = vec2((uv.x - 0.5) * vScale.x + 0.5, (uv.y - 0.5) * vScale.y + 0.5);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
                }
            `,
            fragmentShader:
            `
                uniform sampler2D tDiffuse;
                varying vec2 vUv;
                void main() {
                    vec4 texel = texture2D( tDiffuse, vUv );
                    gl_FragColor = texel;
                }
            `,
            depthTest: false,
            depthWrite: false,
        });
    }

    get scale(): Vector2 {
        return this.uniforms.vScale.value as Vector2;
    }
    set scale(value: Vector2) {
        this.uniforms.vScale.value = value;
    }
}