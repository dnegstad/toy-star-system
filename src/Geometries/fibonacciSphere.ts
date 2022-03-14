import { Vector3 } from 'three/src/Three';

export const threeFibonacciSphere = (count: number, jitter: number) => {
    return fibonacciSphere(count, jitter).map(([lambda, phi]) => new Vector3().setFromSphericalCoords(1, phi, lambda));
}

export const fibonacciSphere = (count: number, jitter: number) => {
    const _randomLat = new Array<number>();
    const _randomLon = new Array<number>();
    const latLongPoints = new Array<[number, number]>();

    // First algorithm from http://web.archive.org/web/20120421191837/http://www.cgafaq.info/wiki/Evenly_distributed_points_on_sphere
    const s = 3.6 / Math.sqrt(count);
    const dz = 2.0 / count;
    for (let k = 0, long = 0, z = 1 - dz/2; k !== count; k++, z -= dz) {
        let r = Math.sqrt(1-z*z);
        let latDeg = Math.asin(z) * 180 / Math.PI;
        let lonDeg = long * 180 / Math.PI;
        if (_randomLat[k] === undefined) _randomLat[k] = Math.random() - Math.random();
        if (_randomLon[k] === undefined) _randomLon[k] = Math.random() - Math.random();
        latDeg += jitter * _randomLat[k] * (latDeg - Math.asin(Math.max(-1, z - dz * 2 * Math.PI * r / s)) * 180 / Math.PI);
        lonDeg += jitter * _randomLon[k] * (s/r * 180 / Math.PI);
        latLongPoints.push([latDeg, lonDeg % 360.0]);
        long += s/r;
    }
    return latLongPoints;
}