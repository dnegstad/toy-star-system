declare module 'd3-geo-voronoi' {
    import { Delaunay } from 'd3-delaunay';
    import { FeatureCollection, MultiLineString } from 'geojson';

    export type GeoDelaunay<P> = {
        delaunay: Delaunay<P>;
        edges: ArrayLike<[number, number]>;
        triangles: ArrayLike<[number, number, number]>;
        centers: ArrayLike<[number, number]>;
        neighbords: ArrayLike<[number, number]>;
        polygons: ArrayLike<ArrayLike<number>>;
        mesh: ArrayLike<[number, number]>;
        hull: ArrayLike<number>;
        urquhart: (distances: ArrayLike<number>) => ArrayLike<boolean>;
        find: (lon: number, lat: number, node?: number) => number;
    }

    export type GeoVoronoi<T> = {
        <T>(data?: ArrayLike<T>): GeoVoronoi<T>;
        points: Array<[number, number]>;
        valid: Array<[number, number]>;
        x: <P>(x: (point: P) => number) => GeoVoronoi<P>;
        x: () => (point: any) => number;
        y: <P>(y: (point: P) => number) => GeoVoronoi<P>;
        y: () => (point: any) => number;
        polygons: (data?: ArrayLike<P>) => FeatureCollection;
        triangles: (data?: ArrayLike<P>) => FeatureCollection;
        links: (data?: ArrayLike<P>) => FeatureCollection;
        mesh: (data?: ArrayLike<P>) => MultiLineString;
        find: (lon: number, lat: number, radius?: number) => number | undefined;
    }

    export function geoDelaunay<P>(data: ArrayLike<[number, number]>): GeoDelaunay<P>;
    export function geoVoronoi(data?: ArrayLike<[number, number]>): GeoVoronoi<[number, number]>;
}