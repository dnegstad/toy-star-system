import { Color, Vector3, MeshPhongMaterial, IUniform } from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';

export type AtmosphereStar = {
    position: Vector3;
    color: Color;
    e: number;
}

export type AtmosphereProps = {
    outerRadius: number;
    innerRadius: number;
    planetWorldPosition: Vector3;
    wavelength: Vector3;
    km: number;
    kr: number;
    stars: Array<AtmosphereStar>;
    gravity: number;
}

const vert = (numStars: number) => /* glsl */`
struct Star {
    vec3 position;
    vec3 color;
    float e;
};

#define NUM_STARS ${numStars}

const float fInnerRadiusBuffer = 1.0;
const float MAX = 10000.0;
const int numOutScatter = 5;
const float fNumOutScatter = 5.0;
const int numInScatter = 5;
const float fNumInScatter = 5.0;

uniform float fInnerRadius;
uniform float fOuterRadius;
uniform vec3 vPlanetWorldPosition;
uniform vec3 vStarWorldPosition;
uniform vec3 vStarColor;
uniform vec3 cR;
uniform float kR;
uniform float kM;
uniform float eStar;
uniform float g;
uniform float gg;

vec2 solveQuadratic(float b, float c)
{
    float discr = b * b - c;
    float x0 = 0.0;
    float x1 = 0.0;
    if (discr < 0.0) {
        return vec2(MAX, -MAX);
    }

    if (discr == 0.0) x0 = x1 = -b;
    else {
        discr = sqrt(discr);
        return vec2(-b - discr, -b + discr);
    }
}

vec2 checkSphereQuadratic(vec3 p, vec3 dir, float r) {
    float b = dot(dir, p);
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

// g = gravity
// gg = gravity ^ 2
// c = cos angle
// cc = cos angle ^ 2
float miePhase(float g, float gg, float c, float cc) {
    float a = (1.0 - gg) * (1.0 + cc);
    float b = 1.0 + gg - 2.0 * g * c;
    b *= sqrt(b);
    b *= 2.0 + gg;

    return 1.5 * a / b;
}

// cc = cos angle ^ 2
float rayleighPhase(float cc) {
    return 0.75 * (1.0 + cc);
}

// p = vector from center of planet to sample point
// scaleH = scale factor for height
float density(vec3 p, float scaleH) {
    return exp(-max(length(p) - fInnerRadius, 0.0)) * scaleH;
}

// p = first sample point
// q = last sample point
// scaleH = scale factor for height
// scaleL = scale factor for distance
float outScatter(vec3 p, vec3 q, float scaleH, float scaleL) {
    vec3 step = (q - p) / fNumOutScatter;
    vec3 v = p + step * 0.5;

    float sum = 0.0;
    for (int i = 0; i < numOutScatter; i++) {
        sum += density(v, scaleH);
        v += step;
    }

    sum *= length(step) * scaleL;
    return sum;
}

// o = origin of viewing ray
// dir = unit ray from origin to start point
// e = start and end point in atmosphere
// l = unit vector to star
vec3 inScatter(vec3 o, vec3 dir, vec2 e, vec3 l) {
    float scaleH = 4.0 / (fOuterRadius - fInnerRadius);
    float scaleL = 1.0 / (fOuterRadius - fInnerRadius);
    // calculate the step length
    float len = (e.y - e.x) / fNumInScatter;
    // calculate the step vector
    vec3 step = dir * len;
    // calculate the first intersection point
    vec3 p = o + dir * e.x;
    // calculate the first sample point half way along step
    vec3 v = p + dir * (len * 0.5);

    float c = dot(dir, -l);
    float cc = c * c;

    vec3 sum = vec3(0.0);
    for (int i = 0; i < numInScatter; i++) {
        vec2 f = checkSphere(v, l, fOuterRadius);
        vec3 u = v + l * f.y;
        float cameraScatter = outScatter(p, v, scaleH, scaleL);
        float lightScatter = outScatter(v, u, scaleH, scaleL);
        float n = (cameraScatter + lightScatter) * PI * 4.0;
        sum += density(v, scaleH) * exp(-n * (kR * cR + kM));
        v += step;
    }
    
    return sum * ( kR * cR * rayleighPhase( cc ) + kM * miePhase( g, gg, c, cc ) ) * eStar * vStarColor;
}

vec3 calcColor() {
    // Normalize to planet centered at 0,0,0 for ease of subsequent math
    vec3 vWorldPosition = vec3(modelMatrix * vec4(position, 1.0));
    vec3 starRay = normalize(vStarWorldPosition - vPlanetWorldPosition);
    vec3 vEye = cameraPosition - vPlanetWorldPosition;
    vec3 vEyeRay = normalize(vWorldPosition - cameraPosition);

    vec2 atmosphereIntersections = checkSphere(vEye, vEyeRay, fOuterRadius);
    vec2 planetIntersections = checkSphere(vEye, vEyeRay, fInnerRadius / fInnerRadiusBuffer);
    if (planetIntersections.y >= planetIntersections.x) {
        atmosphereIntersections.y = planetIntersections.x;
    }

    vec3 I = inScatter(vEye, vEyeRay, atmosphereIntersections, starRay);

    return vec3(I);
}

varying vec3 atmoColor;
varying float eyeNormalAngle;

void main() {
    float fScale = fOuterRadius / fInnerRadius;
    vec3 vWorldPosition = vec3(modelMatrix * fScale * vec4(position, 1.0));
    vec3 eyeRay = normalize(cameraPosition - vWorldPosition);
    vec3 worldNormal = normalize(vec3(modelMatrix * vec4(normal, 0.0)));

    atmoColor = calcColor();
    eyeNormalAngle = dot(eyeRay, worldNormal);

    csm_Position = fScale * position;
}
`;

const frag = /* glsl */ `
varying vec3 atmoColor;
varying float eyeNormalAngle;

void main() {
    //csm_FragColor = vec4(atmoColor, max(max(atmoColor.r, atmoColor.g), atmoColor.b));
    csm_FragColor = vec4(atmoColor, clamp(-log(eyeNormalAngle) / log(10.0), 0.1, 1.0) * max(max(atmoColor.r, atmoColor.g), atmoColor.b));
    //csm_FragColor = vec4(atmoColor, clamp(-log(eyeNormalAngle) / log(10.0), 0.0, 1.0));
    //csm_FragColor = vec4(atmoColor, 0.9);
}
`;

export class AtmosphereMaterial extends CustomShaderMaterial {
    constructor(props: AtmosphereProps) {
        const scaleDepth = 0.25;
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
                cR: {
                    value: props.wavelength,
                },
                kM: {
                    value: props.km,
                },
                kR: {
                    value: props.kr,
                },
                stars: {
                    value: props.stars,
                    properties: {
                        position: {},
                        color: {},
                        e: {},
                    },
                } as IUniform,
                g: {
                    value: props.gravity,
                },
                gg: {
                    value: props.gravity * props.gravity,
                },
            },
            {
                transparent: true,
                shininess: 0,
            }
        );
    }
}
