import { BackSide, Color, IUniform, MeshPhongMaterial, Vector3 } from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';

const vert = (numStars: number = 1) => `
struct Star {
    vec3 position;
    vec3 color;
    float e;
};

#define NUM_STARS ${numStars}

uniform vec3 vPlanetWorldPosition;
uniform float fInnerRadius;
uniform float fOuterRadius;
uniform float fScale;
uniform float fKr;
uniform float fKm;
uniform float fKr4PI;
uniform float fKm4PI;
uniform float g;
uniform float gg;
uniform vec3 v3InvWavelength;
uniform float fScaleDepth;
uniform Star stars[NUM_STARS];

const float fSamples = 5.0;
const int nSamples = 5;

varying vec3 v3FrontColor;

float scale(float fCos)
{
    float x = 1.0 - fCos;
    return fScaleDepth * exp(-0.00287 + x*(0.459 + x*(3.83 + x*(-6.80 + x*5.25))));
}

void calcColor() {
    vec3 v3Pos = vec3(modelMatrix * vec4(position, 1.0)) - vPlanetWorldPosition;
    vec3 v3CameraPos = vViewPosition - vPlanetWorldPosition;
    vec3 v3Direction = v3CameraPos - v3Pos;
    float fScale = 1.0 / (fOuterRadius - fInnerRadius);
    float fScaleOverScaleDepth = fScale / fScaleDepth;
    float fCameraHeight = length(v3CameraPos);

    // Get the ray from the camera to the vertex and its length (which is the far point of the ray passing through the atmosphere)
    vec3 v3Ray = v3Pos - v3CameraPos;
    float fFar = length(v3Ray);
    v3Ray /= fFar;

    // Calculate the closest intersection of the ray with the outer atmosphere (which is the near point of the ray passing through the atmosphere)
    float B = 2.0 * dot(v3CameraPos, v3Ray);
    float C = fCameraHeight * fCameraHeight - fOuterRadius * fOuterRadius;
    float fDet = max(0.0, B*B - 4.0 * C);
    float fNear = 0.5 * (-B - sqrt(fDet));

    // Calculate the ray's starting position, then calculate its scattering offset
    vec3 v3Start = v3CameraPos + v3Ray * fNear;
    fFar -= fNear;
    float fStartAngle = dot(v3Ray, v3Start) / fOuterRadius;
    float fStartDepth = exp(-1.0 / fScaleDepth);
    float fStartOffset = fStartDepth*scale(fStartAngle);

    // Initialize the scattering loop variables
    float fSampleLength = fFar / fSamples;
    float fScaledLength = fSampleLength * fScale;
    vec3 v3SampleRay = v3Ray * fSampleLength;
    vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;

    // Now loop through the sample rays
    v3FrontColor = vec3(0.0);
    for(int s=0; s<nSamples; s++)
    {
        float fHeight = length(v3SamplePoint);
        float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fHeight));
        float fCameraAngle = dot(v3Ray, v3SamplePoint) / fHeight;

        #if NUM_STARS > 0
        #pragma unroll_loop_start
        for ( int i = 0; i < NUM_STARS; i ++ ) {
            Star star = stars[i];
            vec3 v3LightPos = normalize(star.position - vPlanetWorldPosition);

            float fLightAngle = dot(v3LightPos, v3SamplePoint) / fHeight;
            float fScatter = (fStartOffset + fDepth*(scale(fLightAngle) - scale(fCameraAngle)));

            vec3 v3Attenuate = exp(-fScatter * (v3InvWavelength * fKr4PI + fKm4PI));
            v3FrontColor += v3Attenuate * (fDepth * fScaledLength);
            v3SamplePoint += v3SampleRay;
        }
        #pragma unroll_loop_end
        #endif
    }

    #if NUM_STARS > 0
    #pragma unroll_loop_start
    for (int i = 0; i < NUM_STARS; i++) {
        Star star = stars[i];
        vec3 v3LightPos = normalize(star.position - vPlanetWorldPosition);
        // Finally, scale the Mie and Rayleigh colors and set up the varying variables for the pixel shader
        vec3 v3FrontSecondaryColor = v3FrontColor * fKm * star.e;
        v3FrontColor *= (v3InvWavelength * fKr * star.e * star.color);

        float fCos = dot(v3LightPos, v3Direction) / length(v3Direction);
        float fMiePhase = 1.5 * ((1.0 - gg) / (2.0 + gg)) * (1.0 + fCos*fCos) / pow(1.0 + gg - 2.0*g*fCos, 1.5);
        v3FrontColor += fMiePhase * v3FrontSecondaryColor;
    }
    #pragma unroll_loop_end
    #endif
}

void main() {
    calcColor();
    csm_Position = position;
}
`;

const frag = `
varying vec3 v3FrontColor;

void main() {
    csm_FragColor = vec4(v3FrontColor, 1.0);
	csm_FragColor.a = csm_FragColor.b;
}
`

export type AtmosphereStar = {
    position: Vector3;
    color: Color;
    e: number;
}

export type AtmospherePropsV2 = {
    outerRadius: number;
    innerRadius: number;
    scaleDepth: number;
    planetWorldPosition: Vector3;
    wavelength: Vector3;
    km: number;
    kr: number;
    gravity: number;
    stars: Array<AtmosphereStar>;
}

export class AtmosphereMaterialV2 extends CustomShaderMaterial {
    constructor(props: AtmospherePropsV2) {
        super(
            MeshPhongMaterial,
            frag,
            vert(props.stars.length),
            {
                fInnerRadius: {
                    value: props.innerRadius,
                },
                fOuterRadius: {
                    value: props.outerRadius,
                },
                vPlanetWorldPosition: {
                    value: props.planetWorldPosition,
                },
                fScaleDepth: {
                    value: props.scaleDepth,
                },
                v3InvWavelength: {
                    value: new Vector3(1 / Math.pow(props.wavelength.x, 4), 1 / Math.pow(props.wavelength.y, 4), 1 / Math.pow(props.wavelength.z, 4)),
                },
                fKr: {
                    value: props.kr,
                },
                fKm: {
                    value: props.km,
                },
                fKr4PI: {
                    value: props.kr * 4 * Math.PI,
                },
                fKm4PI: {
                    value: props.km * 4 * Math.PI,
                },
                g: {
                    value: props.gravity,
                },
                gg: {
                    value: props.gravity * props.gravity,
                },
                stars: {
                    value: props.stars,
                    properties: {
                        position: {},
                        color: {},
                        e: {},
                    },
                } as IUniform,
            },
            {
                color: new Color(1.0),
                transparent: true,
                side: BackSide,
            }
        );
    }
}