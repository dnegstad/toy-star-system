import { BufferGeometry, Matrix4, PlaneBufferGeometry, Vector2, Vector3 } from 'three/src/Three';
import SimplexNoise from 'simplex-noise';
import Delaunator from 'delaunator';

type DelaunatorPoint = [number, number];

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

const v = new Delaunator([0, 1, 2, 3, 4, 5]);

export type TerrainFaceBufferGeometryParams = {
    resolution: number;
}

export class TerrainFaceBufferGeometry extends BufferGeometry {
    constructor(params: TerrainFaceBufferGeometryParams) {
        super();

        //const position = this.getAttribute('position');
        //for (let i = 0; i < position.count; i++) {
            //position.set
        //}
    }

    /*points(): Float32Array {

    }*/
}