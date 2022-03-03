import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import { AdditiveBlending, BackSide, Color, MeshPhongMaterial, Vector3 } from 'three/src/Three';

const vert = `
uniform float fScale;

varying float fIntensity;

void main() {
    vec3 vWorldPosition = vec3(modelMatrix * fScale * vec4(position, 1.0));
    vec3 eyeRay = normalize(cameraPosition - vWorldPosition);
    vec3 worldNormal = normalize(vec3(modelMatrix * vec4(normal, 0.0)));

    float eyeNormalAngle = dot(eyeRay, worldNormal);
    fIntensity = clamp(-log(eyeNormalAngle) / log(10.0), 0.1, 1.0);

    csm_Position = fScale * position
}
`;

const frag = `
uniform vec3 vColor;

varying float fIntensity;

void main() {
    csm_FragColor = vec4(vColor * fIntensity, fIntensity;
}
`;

export type GlowMaterialProperties = {
    color?: Color;
    scale?: number;
}

export class GlowMaterial extends CustomShaderMaterial {
    constructor({
        color = new Color(1,1,1),
        scale = 1.0,
    }: GlowMaterialProperties = {}) {
        super(
            MeshPhongMaterial,
            frag,
            vert,
            {
                viewVector: {
                    value: new Vector3(0,0,0),
                },
                scale: {
                    value: scale,
                },
                color: {
                    value: new Vector3(...color.toArray()),
                },
            },
            {
                side: BackSide,
                blending: AdditiveBlending,
                transparent: true,
            });
    }

    get viewVector() {
        return this.uniforms.viewVector.value as Vector3;
    }

    set viewVector(value: Vector3) {
        this.uniforms.viewVector.value = value;
    }

    get scale() {
        return this.uniforms.scale.value as number;
    }

    set scale(value: number) {
        this.uniforms.scale.value = value;
    }

    get color() {
        const colorVector = this.uniforms.color.value as Vector3;
        return new Color(colorVector.x, colorVector.y, colorVector.z);
    }

    set color(value: Color) {
        this.uniforms.color.value = new Vector3(...value.toArray());
    }
}
