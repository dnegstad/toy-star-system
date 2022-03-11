/// <reference path="..\d3-geo-voronoi.d.ts" />
import { CycleRaycast } from '@react-three/drei';
import alea from 'alea';
import { Delaunay } from 'd3-delaunay';
import { geoDistance } from 'd3-geo';
import { GeoVoronoi, geoVoronoi } from 'd3-geo-voronoi';
import Delaunator from 'delaunator';
import { FeatureCollection } from 'geojson';
import { BufferGeometry, Spherical, Vector2, Vector3 } from 'three/src/Three';
import { number } from 'zod';

const edgesOfTriangle = (t: number) => [3 * t, 3 * t + 1, 3 * t + 2];
const triangleOfEdge = (e: number) => Math.floor(e / 3);
const nextHalfEdge = (e: number) => e % 3 === 2 ? e - 2 : e + 1;
const prevHalfEdge = (e: number) => e % 3 === 0 ? e + 2 : e - 1;
const pointsOfTriangle = (delaunay: Delaunator<any>, t: number) => edgesOfTriangle(t).map(e => delaunay.triangles[e]);
const forEachTriangleEdge = (points: ArrayLike<Vector2>, delaunay: Delaunator<any>, callback: (edge: number, p: Vector2, q: Vector2) => void) => {
    for (let e = 0; e < delaunay.triangles.length; e++) {
        if (e > delaunay.halfedges[e]) {
            const p = points[delaunay.triangles[e]];
            const q = points[delaunay.triangles[nextHalfEdge(e)]];
            callback(e, p, q);
        }
    }
}

const trianglesAdjacentToTriangle = (delaunay: Delaunator<any>, t: number) => {
    const adjacentTriangles = new Array<number>();
    for (const e of edgesOfTriangle(t)) {
        const opposite = delaunay.halfedges[e];
        if (opposite >= 0) {
            adjacentTriangles.push(triangleOfEdge(opposite));
        }
    }

    return adjacentTriangles;
}

const circumcenter = (a: Vector2, b: Vector2, c: Vector2): Vector2 => {
    const ad = a.x * a.y + a.x * a.y;
    const bd = b.x * b.x + b.y * b.y;
    const cd = c.x * c.x + c.y * c.y;
    const D = 2 * (a.x * (b.y - c.y) + b.x * (c.y - a.y) + c.x * (a.y - b.y));
    return new Vector2(
        1 / D * (ad * (b.y - c.y) + bd * (c.y - a.y) + cd * (a.y - b.y)),
        1 / D * (ad * (c.x - b.x) + bd * (a.x - c.x) + cd * (b.x - a.x)),
    );
}

const triangleCenter = (points: ArrayLike<Vector2>, delaunay: Delaunator<any>, t: number) => {
    const vertices = pointsOfTriangle(delaunay, t).map(p => points[p]);
    return circumcenter(vertices[0], vertices[1], vertices[2]);
}

const forEachVoronoiEdge = (points: ArrayLike<Vector2>, delaunay: Delaunator<any>, callback: (e: number, p: Vector2, q: Vector2) => void) => {
    for (let e = 0; e < delaunay.triangles.length; e++) {
        if (e < delaunay.halfedges[e]) {
            const p = triangleCenter(points, delaunay, triangleOfEdge(e));
            const q = triangleCenter(points, delaunay, triangleOfEdge(delaunay.halfedges[e]));
            callback(e, p, q);
        }
    }
}

const edgesAroundPoint = (delaunay: Delaunator<any>, start: number) => {
    const result = new Array<number>();
    let incoming = start;
    do {
        result.push(incoming);
        const outgoing = nextHalfEdge(incoming);
        incoming = delaunay.halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start);
    return result;
}

const forEachVoronoiCell = (points: ArrayLike<Vector2>, delaunay: Delaunator<any>, callback: (p: number, vertices: ArrayLike<Vector2>) => void) => {
    const index = new Map(); // point id to half-edge id
    for (let e = 0; e < delaunay.triangles.length; e++) {
        const endpoint = delaunay.triangles[nextHalfEdge(e)];
        if (!index.has(endpoint) || delaunay.halfedges[e] === -1) {
            index.set(endpoint, e);
        }
    }
    for (let p = 0; p < points.length; p++) {
        const incoming = index.get(p);
        const edges = edgesAroundPoint(delaunay, incoming);
        const triangles = edges.map(triangleOfEdge);
        const vertices = triangles.map(t => triangleCenter(points, delaunay, t));
        callback(p, vertices);
    }
}

const TAU = Math.PI * 2;
const RADIANS = Math.PI / 180;
const DEGREES = 180 / Math.PI;

type SphericalPoint = [number, number];
type CartesianPoint = [number, number, number];

type Transform = (point: SphericalPoint) => SphericalPoint;

type TransformWithInvert = Transform & {
    invert: Transform;
}

export const cartesianToSpherical = ([x, y, z]: CartesianPoint): SphericalPoint => {
    return [
        Math.atan2(y, x) * DEGREES,
        Math.asin(Math.max(-1, Math.min(1, z))) * DEGREES,
    ]
}

export const sphericalToCartesian = ([lambda, phi]: SphericalPoint): CartesianPoint => {
    return radiansToCartesian([lambda * RADIANS, phi * RADIANS]);
}

export const radiansToCartesian = ([lambda, phi]: SphericalPoint): CartesianPoint => {
    const cosPhi = Math.cos(phi);
    return [
        cosPhi * Math.cos(lambda),
        cosPhi * Math.sin(lambda),
        Math.sin(phi),
    ];
}

const rotationIdentity: TransformWithInvert = ([lambda, phi]: SphericalPoint) => {
    if (Math.abs(lambda) > Math.PI) {
        lambda -= Math.round(lambda / TAU) * TAU;
    }

    return [lambda, phi];
}
rotationIdentity.invert = rotationIdentity;

const innerRotationRadiansLambda = (deltaLambda: number): Transform => {
    return ([lambda, phi]: SphericalPoint) => {
        lambda += deltaLambda;
        if (Math.abs(lambda) > Math.PI) {
            lambda -= Math.round(lambda / TAU) * TAU;
        }
        return [lambda, phi];
    }
}

const rotationRadiansLambda = (deltaLambda: number): TransformWithInvert => {
    const transform = innerRotationRadiansLambda(deltaLambda) as TransformWithInvert;
    transform.invert = innerRotationRadiansLambda(-deltaLambda);

    return transform;
}

const rotationRadiansPhi = (deltaPhi: number): TransformWithInvert => {
    const cosDeltaPhi = Math.cos(deltaPhi);
    const sinDeltaPhi = Math.sin(deltaPhi);

    const transform: TransformWithInvert = (point: SphericalPoint) => {
        const [x, y, z] = radiansToCartesian(point);
        const k = z * cosDeltaPhi + x * sinDeltaPhi;
        return [
            Math.atan2(y, x * cosDeltaPhi - z * sinDeltaPhi),
            Math.asin(k),
        ];
    };

    transform.invert = (point: SphericalPoint) => {
        const [x, y, z] = radiansToCartesian(point);
        const k = z;
        return [
            Math.atan2(y, x * cosDeltaPhi + k * sinDeltaPhi),
            Math.asin(k * cosDeltaPhi - x * sinDeltaPhi),
        ];
    }

    return transform;
}

const composeTransform = (...transforms: Array<TransformWithInvert>): TransformWithInvert => {
    const transform: TransformWithInvert = ([lambda, phi]: SphericalPoint): SphericalPoint => {
        return transforms.reduce<SphericalPoint>((point, transform) => {
            return transform(point);
        }, [lambda, phi]);
    }

    transform.invert = ([lambda, phi]: SphericalPoint): SphericalPoint => {
        return transforms.reverse().reduce<SphericalPoint>((point, transform) => {
            return transform.invert(point);
        }, [lambda, phi]);
    }

    return transform;
}

const rotateRadians = ([deltaLambda, deltaPhi]: SphericalPoint): TransformWithInvert => {
    deltaLambda %= TAU;
    if (deltaLambda) {
        if (deltaPhi) {
            return composeTransform(rotationRadiansLambda(deltaLambda), rotationRadiansPhi(deltaPhi));
        } else {
            return rotationRadiansLambda(deltaLambda);
        }
    } else if (deltaPhi) {
        return rotationRadiansPhi(deltaPhi);
    }

    return rotationIdentity;
}

export const rotateAngle = ([deltaLambda, deltaPhi]: SphericalPoint): TransformWithInvert => {
    const rotation = rotateRadians([deltaLambda * RADIANS, deltaPhi * RADIANS]);

    const transform: TransformWithInvert = ([lambda, phi]: SphericalPoint) => {
        const [transformedLambda, transformedPhi] = rotation([lambda * RADIANS, phi * RADIANS]);
        return [transformedLambda * DEGREES, transformedPhi * DEGREES];
    }

    transform.invert = ([lambda, phi]: SphericalPoint) => {
        const [transformedLambda, transformedPhi] = rotation.invert([lambda * RADIANS, phi * RADIANS]);
        return [transformedLambda * DEGREES, transformedPhi * DEGREES];
    }

    return transform;
}

const projectStereographic: TransformWithInvert = ([lambda, phi]: SphericalPoint): SphericalPoint => {
    const cy = Math.cos(phi * RADIANS);
    const k = 1 + Math.cos(lambda * RADIANS) * cy;

    return [
        cy * Math.sin(lambda * RADIANS) / k,
        Math.sin(phi * RADIANS) / k,
    ];
}
projectStereographic.invert = ([lambda, phi]: SphericalPoint): SphericalPoint => {
    const z = Math.sqrt(lambda * lambda + phi * phi);
    const c = 2 * Math.atan(z);
    const sinC = Math.sin(c);
    const cosC = Math.cos(c);

    return [
        Math.atan2(lambda * sinC, z * cosC) * DEGREES,
        Math.asin(z && phi * sinC / z) * DEGREES,
    ];
}

export class ThreeVoronoi {
    constructor(points: ArrayLike<number>) {
        const projectedPoints = new Float64Array(points.length + 6);

        const rotation = rotateAngle([points[0], points[1]]);
        this._projection = composeTransform(rotateAngle(rotation.invert([180, 0])), projectStereographic);

        for (let i = 0; i < points.length; i += 2) {
            projectedPoints.set(this._projection([points[i], points[i + 1]]), i);
        }

        const zeros = new Array<number>();
        let max2 = 1;
        for (let i = 0; i < points.length; i += 2) {
            let m = projectedPoints[i] ** 2 + projectedPoints[i + 1] ** 2;
            if (!isFinite(m) || m > 1e32) {
                zeros.push(i);
            } else if (m > max2) {
                max2 = m;
            }
        }

        const FAR = 1e6 * Math.sqrt(max2);

        // Set our point at the south pole to "infinity"
        zeros.forEach((i) => (projectedPoints.set([FAR, 0], i * 2)));

        // Add complementary infinite horizon points to the rest of the projection
        projectedPoints.set([0, FAR], points.length);
        projectedPoints.set([-FAR, 0], points.length + 2);
        projectedPoints.set([0, -FAR], points.length + 4);

        this._delaunay = new Delaunay(projectedPoints);

        const { triangles, halfedges, inedges } = this._delaunay;

        const degenerate = new Array<number>();
        for (let i = 0; i < halfedges.length; i++) {
            if (halfedges[i] < 0) {
                const j = i % 3 == 2 ? i - 2 : i + 1;
                const k = i % 3 == 0 ? i + 2 : i - 1;
                const a = halfedges[j];
                const b = halfedges[k];
                halfedges[a] = b;
                halfedges[b] = a;
                halfedges[j] = halfedges[k] = -1;
                triangles[i] = triangles[j] = triangles[k] = 0;
                inedges[triangles[a]] = a % 3 == 0 ? a + 2 : a - 1;
                inedges[triangles[b]] = b % 3 == 0 ? b + 2 : b - 1;
                degenerate.push(Math.min(i, j, k));
                i += 2 - (i % 3);
            } else if (triangles[i] > projectedPoints.length - 3 - 1) {
                triangles[i] = 0;
            }
        }

        console.log(degenerate);
    }

    static makeDistributedPoints(count: number, iterations: number = 2, seed?: string) {
        return new ThreeVoronoi(pointBuilder(count, iterations, seed));
    }

    static excess(triangle: Array<SphericalPoint>) {
        const cartesianPoints = triangle.map((p) => new Vector3().setFromSphericalCoords(1, p[1], p[0]));
        return cartesianPoints[0].dot(cartesianPoints[2].cross(cartesianPoints[1]));
    }

    point(index: number): SphericalPoint {
        return this._projection.invert([this._delaunay.points[index], this._delaunay.points[index + 1]]);
    }

    *triangles() {
        for (let i = 0; i < this._delaunay.triangles.length; i += 3) {
            if (this._delaunay.triangles[i] === this._delaunay.triangles[i + 1] || this._delaunay.triangles[i + 1] === this._delaunay.triangles[i + 2]) {
                continue;
            }

            const p0 = this.point(this._delaunay.triangles[i]);
            const p1 = this.point(this._delaunay.triangles[i + 1]);
            const p2 = this.point(this._delaunay.triangles[i + 2]);

            if (ThreeVoronoi.excess([p0, p1, p2]) > 0) {
                yield [p0, p1, p2];
            }
        }
    }

    get points() {
        return this._delaunay.points;
    }

    get halfedges() {
        return this._delaunay.halfedges;
    }

    private readonly _delaunay: Delaunay<any>;
    private readonly _projection: TransformWithInvert;
}

export const randomRange = (min: number, max: number, rng?: () => number) => {
    rng ??= Math.random;
    min = Math.abs(min);

    return rng() * (max + min) - min;
}

const makeCandidate = (prng: () => number = Math.random) => ({
    lambda: randomRange(-180, 180, prng),
    phi: 180 * Math.acos(Math.random() * 2 - 1) / Math.PI - 90,
    distance: Infinity,
});

type PointCandidate = {
    lambda: number;
    phi: number;
    distance: number;
}

export const pointBuilder = (total: number, iterations: number, seed?: string) => {
    const prng = seed ? alea(seed) : alea();

    let pointCount = 0;
    const points = new Float64Array(total * 2);
    let candidate: PointCandidate = makeCandidate(prng.next);
    points.set([candidate.lambda, candidate.phi], pointCount++);

    for (let i = pointCount; i < total; i++) {
        let best!: PointCandidate;

        for (let c = 0; c < pointCount * iterations; c++) {
            candidate = makeCandidate(prng.next);

            for (let p = 0; p < points.length; p += 2) {
                candidate.distance = Math.min(candidate.distance, Math.max(0, geoDistance([points[p], points[p + 1]], [candidate.lambda, candidate.phi])));
            }

            best = !best || candidate.distance > best.distance ? candidate : best;
        }

        points.set([best.lambda, best.phi], pointCount * 2);

        pointCount += 1;
    }

    return points;
}

export function* pointGenerator(total: number, iterations: number, minDistance: number, seed?: string): Generator<[number, number], Array<PointCandidate>, unknown> {
    const prng = seed ? alea(seed) : alea();

    const points = new Array<PointCandidate>();
    points.push(makeCandidate(prng.next));

    yield [points[0].lambda, points[0].phi];

    for (let i = 1; i < total; i++) {
        let best!: PointCandidate;

        for (let i = 0; i < points.length * iterations; i++) {
            const candidate = makeCandidate(prng.next);

            points.forEach((point) => {
                candidate.distance = Math.min(candidate.distance, Math.max(0, geoDistance([point.lambda, point.phi], [candidate.lambda, candidate.phi]) * 180 / Math.PI - point.distance));
            });

            best = !best || candidate.distance > best.distance ? candidate : best;
        }
    
        best.distance = minDistance;
        points.push(best);
    
        yield [best.lambda, best.phi];
    }

    return points;
}

const dlon = Math.PI * (3 - Math.sqrt(5));
const generateFibonacciSphere = (count: number, jitter: number) => {
    const points = new Array<number>();

    const dz = 2 / count;
    let z = 1 - dz / 2;

    let lon = 0;
    for (let k = 0; k < count; k++) {
        const r = Math.sqrt(1 - z * z);
        
        z = 
        
        lon = lon + dlon;
    }
}