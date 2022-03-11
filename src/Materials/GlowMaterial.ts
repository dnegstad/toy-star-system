import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import { AdditiveBlending, BackSide, Color, MeshPhongMaterial, Vector3 } from 'three/src/Three';

const vert = `
uniform float fScale;

varying float fIntensity;

void main() {
    vec3 vWorldPosition = vec3(modelMatrix * fScale * vec4(position, 1.0));
    vec3 eyeRay = normalize(cameraPosition - vWorldPosition);
    vec3 worldNormal = normalize(vec3(modelMatrix * vec4(normal, 0.0)));

    float eyeNormalAngle = dot(eyeRay, -worldNormal);
    //fIntensity = clamp(-log(eyeNormalAngle) / log(10.0), 0.1, 1.0);
    fIntensity = pow(eyeNormalAngle, 6.0);

    csm_Position = fScale * position;
}
`;

const frag = `
varying float fIntensity;

void main() {
    csm_DiffuseColor = vec4(diffuse * fIntensity, 1.0);
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
                fScale: {
                    value: scale,
                },
            },
            {
                color,
                side: BackSide,
                blending: AdditiveBlending,
                transparent: true,
            });
    }

    get scale() {
        return this.uniforms.fScale.value as number;
    }

    set scale(value: number) {
        this.uniforms.fScale.value = value;
    }

    /*get color() {
        const colorVector = this.uniforms.vColor.value as Vector3;
        return new Color(colorVector.x, colorVector.y, colorVector.z);
    }

    set color(value: Color) {
        this.uniforms.vColor.value = new Vector3(...value.toArray());
    }*/
}
