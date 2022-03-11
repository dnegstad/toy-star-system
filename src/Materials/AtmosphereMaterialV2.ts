import { AddEquation, AdditiveBlending, BackSide, Color, CustomBlending, IUniform, MeshBasicMaterial, MeshPhongMaterial, OneMinusDstColorFactor, OneMinusSrcColorFactor, SrcAlphaFactor, SrcColorFactor, Vector3 } from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';

const vert = (numStars: number = 1, numOutSamples: number = 5, numInSamples: number = 5) => `
struct Star {
    vec3 position;
    vec3 color;
    float e;
};

#define NUM_STARS ${numStars}
#define NUM_OUT_SAMPLES ${numOutSamples}
#define NUM_IN_SAMPLES ${numInSamples}
#define MAX 10000.0

uniform float fAtmosphereRadius;
uniform float fPlanetRadius;
uniform float fFallofFactor;
uniform float fScatteringStrength;
uniform float fDensityModifier;
uniform float g;
uniform vec3 vWavelength;
uniform vec3 vPlanetWorldOrigin;
uniform Star stars[NUM_STARS];

varying vec3 v3FrontColor;

vec2 solveQuadratic(float b, float c)
{
    float discr = b * b - c;
    if (discr < 0.0) {
        return vec2(MAX, -MAX);
    }

    discr = sqrt(discr);
    float t0 = -b - discr;
    float t1 = -b + discr;
    return vec2(min(t0, t1), max(t0, t1));
}

vec2 checkSphereQuadratic(vec3 p, vec3 dir, float r) {
    float b = dot(p, dir);
    float c = dot(p, p) - r * r;
    return solveQuadratic(b, c);
}

vec2 checkSphere(vec3 p, vec3 dir, float r) {
    float b = dot( p, dir );
    float c = dot( p, p ) - r * r;

    float d = b * b - c;
    if ( d < 0.0 ) {
        return vec2( MAX, -MAX );
    }
    d = sqrt( d );

    return vec2( -b - d, -b + d );
}

bool hasIntersection(vec2 intersections) {
    return intersections.y > intersections.x;
}

// cc = cos angle ^ 2
float rayleighPhase(float cc) {
    return 3.0 / (16.0 * PI) * (1.0 + cc);
}

float miePhase(float g, float gg, float c, float cc) {
    float a = ( 1.0 - gg ) * ( 1.0 + cc );

    float b = 1.0 + gg - 2.0 * g * c;
    b *= sqrt( b ) * (2.0 + gg);

    return ( 3.0 / 8.0 / PI ) * a / b;
}

float opticalDensity(vec3 vAtmoPoint) {
    float fHeight = length(vAtmoPoint) - fPlanetRadius;
    fHeight = fHeight / (fAtmosphereRadius - fPlanetRadius);
    return exp(-fHeight * fFallofFactor) * fDensityModifier * (1.0 - fHeight);
}

float inOpticalDepth(vec3 vAtmoPoint, vec3 vDir, float fDistance) {
    float fSegmentLength = fDistance / float(NUM_IN_SAMPLES);

    float fOpticalDepth = 0.0;
    for (int i = 0; i < NUM_IN_SAMPLES; i++) {
        fOpticalDepth += opticalDensity(vAtmoPoint) * fSegmentLength;
        vAtmoPoint += vDir * fSegmentLength;
    }

    return fOpticalDepth;
}

vec3 calculateStarLights(vec3 vAtmoPoint, vec3 vEyeDir, float fViewOpticalDepth, float fLocalDensity, vec3 vScatteringCoeffs) {
    vec3 vTotalStarLight = vec3(0.0);
    for (int i = 0; i < NUM_STARS; i++) {
        Star star = stars[i];
        vec3 vStarDir = normalize(star.position - vPlanetWorldOrigin);

        float fStarPathLength = fAtmosphereRadius - length(vAtmoPoint);

        float fStarMu = dot(vEyeDir, -vStarDir);
        float fStarMu2 = fStarMu * fStarMu;

        float fStarOpticalDepth = inOpticalDepth(vAtmoPoint, vStarDir, fStarPathLength);

        vec3 vTransmittance = exp(-(fStarOpticalDepth + fViewOpticalDepth) * vScatteringCoeffs);
        vTotalStarLight += vTransmittance * fLocalDensity * (rayleighPhase(fStarMu2) * vScatteringCoeffs + miePhase(g, g * g, fStarMu, fStarMu2)) * star.e * star.color;
    }

    return vTotalStarLight;
}

vec3 calculateLight(vec3 vInitialPoint, vec3 vEyeDir, float fPathLength) {
    float fSegmentLength = fPathLength / float(NUM_OUT_SAMPLES);
    vec3 vScatteringCoeffs = pow(400.0 / vWavelength.rgb, vec3(4.0)) * fScatteringStrength;

    vec3 vAtmoPoint = vInitialPoint + vEyeDir * fPathLength * 0.5;
    
    vec3 vTotalLight = vec3(0.0);
    float fViewOpticalDepth = 0.0;
    for (int s = 0; s < NUM_OUT_SAMPLES; s++) {
        float fLocalDensity = opticalDensity(vAtmoPoint) * fSegmentLength;

        fViewOpticalDepth += fLocalDensity;

        vTotalLight += calculateStarLights(vAtmoPoint, vEyeDir, fViewOpticalDepth, fLocalDensity, vScatteringCoeffs);

        vAtmoPoint += vEyeDir * fPathLength;
    }

    return vTotalLight;
}

vec3 calcColor() {
    // Calculate planet world origin based on pre-scale values
    vec3 vWorldPosition = vec3(modelMatrix * vec4(position, 1.0));

    vec3 vEye = cameraPosition - vPlanetWorldOrigin;
    vec3 vEyeDir = normalize(vWorldPosition - cameraPosition);
    if (isOrthographic) {
        vEyeDir = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
        vEye = vWorldPosition - vPlanetWorldOrigin  - (vEyeDir * fAtmosphereRadius * 4.0);
    }

    vec2 vAtmosphereIntersection = checkSphereQuadratic(vEye, vEyeDir, fAtmosphereRadius);
    vec2 vPlanetIntersection = checkSphereQuadratic(vEye, vEyeDir, fPlanetRadius);
    if (hasIntersection(vPlanetIntersection)) {
        //vAtmosphereIntersection.y = vPlanetIntersection.x;
    }

    vec3 vInitialPoint = vEye + (vEyeDir * vAtmosphereIntersection.x);

    return calculateLight(vInitialPoint, vEyeDir, vAtmosphereIntersection.y - vAtmosphereIntersection.x);
}

void main() {
    v3FrontColor = calcColor();
    csm_Position = position;
}
`;

const frag = `
varying vec3 v3FrontColor;

void main() {
    csm_FragColor = vec4(v3FrontColor, 1.0);
}
`

export type AtmosphereStar = {
    position: Vector3;
    color: Color;
    e: number;
}

export type AtmospherePropsV2 = {
    atmosphereRadius: number;
    planetRadius: number;
    wavelength: Vector3;
    falloffFactor: number;
    scatteringStrength: number;
    densityModifier: number;
    gravity: number;
    planetPosition: Vector3;
    stars: Array<AtmosphereStar>;
}

export class AtmosphereMaterialV2 extends CustomShaderMaterial {
    constructor(props: AtmospherePropsV2) {
        super(
            MeshPhongMaterial,
            frag,
            vert(props.stars.length, 10, 10),
            {
                /*fAtmosphereScale: {
                    value: props.atmosphereScale,
                },*/
                fAtmosphereRadius: {
                    value: props.atmosphereRadius,
                },
                fPlanetRadius: {
                    value: props.planetRadius,
                },
                fFallofFactor: {
                    value: props.falloffFactor,
                },
                fScatteringStrength: {
                    value: props.scatteringStrength,
                },
                fDensityModifier: {
                    value: props.densityModifier,
                },
                vWavelength: {
                    value: props.wavelength,
                },
                g: {
                    value: props.gravity,
                },
                vPlanetWorldOrigin: {
                    value: props.planetPosition,
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
                blending: AdditiveBlending,
            }
        );
    }
}