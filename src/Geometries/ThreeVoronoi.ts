/// <reference path="..\d3-geo-voronoi.d.ts" />
import alea from 'alea';
import { geoCentroid, geoDistance, GeoProjection, geoRotation, geoStereographic } from 'd3-geo';
import Delaunator from 'delaunator';
import { BufferAttribute, Float32BufferAttribute, Float64BufferAttribute, Vector3 } from 'three';

const TAU = Math.PI * 2;
const RADIANS = Math.PI / 180;
const DEGREES = 180 / Math.PI;

type SphericalPoint = [number, number];
type CartesianPoint = [number, number, number];

const edgesOfTriangle = (t: number): number[] => [3 * t, 3 * t + 1, 3 * t + 2];
const triangleOfEdge = (e: number) => Math.floor(e / 3);
const nextHalfEdge = (e: number) => e % 3 === 2 ? e - 2 : e + 1;
const prevHalfEdge = (e: number) => e % 3 === 0 ? e + 2 : e - 1;
const pointsOfTriangle = ({triangles}: {triangles: Uint32Array}, t: number): number[] => edgesOfTriangle(t).map(e => triangles[e]);
const forEachTriangleEdge = (points: ArrayLike<number>, {triangles, halfedges}: {triangles: Uint32Array, halfedges: Int32Array}, callback: (edge: number, p: number, q: number) => void) => {
    for (let e = 0; e < triangles.length; e++) {
        if (e > halfedges[e]) {
            const p = points[triangles[e]];
            const q = points[triangles[nextHalfEdge(e)]];
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

const edgesAroundPoint = ({halfedges}: {halfedges: Int32Array}, start: number) => {
    const result = new Array<number>();
    let incoming = start;
    do {
        result.push(incoming);
        const outgoing = nextHalfEdge(incoming);
        incoming = halfedges[outgoing];
    } while (incoming !== -1 && incoming !== start);
    return result;
}

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

export class ThreeVoronoi {
    constructor(points: ArrayLike<number> | BufferAttribute) {
        this._points = points instanceof BufferAttribute ? points : new Float32BufferAttribute(points, 3);
        const numPoints = this._points.count;
        const geoPoints = new Float64Array(numPoints * 2);
        const projectedPoints = new Float64Array(numPoints * 2 - 2);

        const sphericalCandidate = cartesianToSpherical([this._points.getX(numPoints - 1), this._points.getY(numPoints - 1), this._points.getZ(numPoints - 1)]);

        const rotation = geoRotation(sphericalCandidate);
        const projection = geoStereographic().translate([0,0]).rotate(rotation.invert([180, 0]));

        for (let i = 0; i < numPoints; i++) {
            const geoPoint = cartesianToSpherical([this._points.getX(i), this._points.getY(i), this._points.getZ(i)]);
            // store the points cartesian representation since we are generating them anyway
            geoPoints.set(geoPoint, i * 2);
            // project all points but the one at infinity
            if (i < numPoints - 1) {
                projectedPoints.set(projection(geoPoint) as SphericalPoint, i * 2);
            }
        }

        this._geoPoints = new Float64BufferAttribute(geoPoints, 2);

        const delaunay = new Delaunator(projectedPoints);

        const { triangles, halfedges } = ThreeVoronoi.patchInfinity(delaunay, numPoints - 1);

        this._triangles = triangles;
        this._halfedges = halfedges;

        this._cellHalfedgeIndex = new Int32Array(this._points.count);
        for (let e = 0; e < this._triangles.length; e++) {
            const endpoint = this._triangles[nextHalfEdge(e)];
            if (this._cellHalfedgeIndex[endpoint] === 0 || this._cellHalfedgeIndex[e] === -1) {
                this._cellHalfedgeIndex[endpoint] = e;
            }
        }

        const centers = new Float64Array(triangles.length);
        let index = 0;
        for (let triangle of this.triangles()) {
            const circumcenter = new Vector3(0, 0, 0).add(triangle[0]).add(triangle[1]).add(triangle[2]).divideScalar(3).normalize();
            centers.set(circumcenter.toArray(), index * 3);
            index++;
        }

        this._cellVertices = new Float32BufferAttribute(centers, 3);
    }

    protected static patchInfinity(delaunay: Delaunator<any>, index: number) {
        const { triangles, halfedges } = delaunay;
        const numSides = triangles.length;

        let numUnpairedSides = 0
        let firstUnpairedSide = -1;
        const pointIdToSideId = []; // seed to side
        for (let s = 0; s < numSides; s++) {
            if (halfedges[s] === -1) {
                numUnpairedSides++;
                pointIdToSideId[triangles[s]] = s;
                firstUnpairedSide = s;
            }
        }

        const newTriangles = new Uint32Array(numSides + 3 * numUnpairedSides);
        const newHalfedges = new Int32Array(numSides + 3 * numUnpairedSides);
        newTriangles.set(triangles);
        newHalfedges.set(halfedges);

        for (let i = 0, s = firstUnpairedSide; i < numUnpairedSides; i++, s = pointIdToSideId[newTriangles[ThreeVoronoi.nextHalfEdge(s)]]) {
            // Construct a pair for the unpaired side s
            let newSide = numSides + 3 * i;
            newHalfedges[s] = newSide;
            newHalfedges[newSide] = s;
            newTriangles[newSide] = newTriangles[ThreeVoronoi.nextHalfEdge(s)];
            
            // Construct a triangle connecting the new side to the south pole
            newTriangles[newSide + 1] = newTriangles[s];
            newTriangles[newSide + 2] = index;
            let k = numSides + (3 * i + 4) % (3 * numUnpairedSides);
            newHalfedges[newSide + 2] = k;
            newHalfedges[k] = newSide + 2;
        }

        return {
            triangles: newTriangles,
            halfedges: newHalfedges,
        };
    }

    static nextHalfEdge(e: number) {
        return e % 3 === 2 ? e - 2 : e + 1;
    }

    static prevHalfEdge(e: number) {
        return e % 3 === 0 ? e + 1 : e - 1;
    }

    static triangleForEdge(e: number) {
        return (e/3) | 0;
    }

    circulateCells(index: number) {
        const firstEdge = this._cellHalfedgeIndex[index];
        let incoming = firstEdge;
        const cells = new Array<number>();
        do {
            cells.push(this._triangles[incoming]);
            const outgoing = ThreeVoronoi.nextHalfEdge(incoming);
            incoming = this._halfedges[outgoing];
        } while (incoming !== -1 && incoming !== firstEdge);

        return cells;
    }

    static makeDistributedPoints(count: number, iterations: number = 2, seed?: string) {
        return new ThreeVoronoi(new Float64Array(pointBuilder(count, iterations, seed)));
    }

    point(index: number): Vector3 {
        return new Vector3(this._points.getX(index), this._points.getY(index), this._points.getZ(index));
    }

    get points() {
        return this._points;
    }

    triangle(index: number): Array<Vector3> {
        return [
            this.point(this._triangles[index * 3]),
            this.point(this._triangles[index * 3 + 1]),
            this.point(this._triangles[index * 3 + 2]),
        ];
    }

    *triangles() {
        for (let i = 0; i < this._triangles.length; i += 3) {
            yield [
                this.point(this._triangles[i]),
                this.point(this._triangles[i + 1]),
                this.point(this._triangles[i + 2]),
            ];
        }
    }

    get rawTriangles() {
        return this._triangles;
    }

    get rawHalfEdges() {
        return this._halfedges;
    }

    center(index: number): Vector3 {
        return new Vector3(this._cellVertices.getX(index), this._cellVertices.getY(index), this._cellVertices.getZ(index));
    }

    get rawCenters() {
        return this._cellVertices;
    }

    forEachVoronoiCell(callback: (p: number, vertices: Array<Vector3>) => void) {
        for (let cell of this.voronoiCells()) {
            callback(cell.point, cell.vertices);
        }
    }

    *voronoiCells() {
        const seen = new Set<number>();

        for (let e = 0; e < this._triangles.length; e++) {
            const p = this._triangles[nextHalfEdge(e)];
            if (!seen.has(p)) {
                seen.add(p);
                const edges = edgesAroundPoint({halfedges: this._halfedges}, e);
                const triangles = edges.map(triangleOfEdge);
                const vertices = triangles.map(this.center.bind(this));
                yield {point: p, vertices};
            }
        }
    }

    get voronoiMesh() {
        const geometry = new Array<Vector3>();
            
        for (let s = 0; s < this._triangles.length; s++) {
            const inTriangle = (s / 3) | 0;
            const outTriangle = (this._halfedges[s] / 3) | 0;
            const beginPoint = this._triangles[s];
                
            geometry.push(
                this.center(inTriangle),
                this.center(outTriangle),
                this.point(beginPoint),
            );
        }
        return geometry;
    }

    private readonly _points: BufferAttribute;
    private readonly _geoPoints: BufferAttribute;
    private readonly _cellVertices: BufferAttribute;
    private readonly _triangles: Uint32Array;
    private readonly _halfedges: Int32Array;
    private readonly _cellHalfedgeIndex: Int32Array;
}

const centroid = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number): [number, number, number] => {
    return [(ax+bx+cx)/3, (ay+by+cy)/3, (az+bz+cz)/3]
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