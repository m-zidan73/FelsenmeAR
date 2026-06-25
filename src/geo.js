import * as THREE from "three";

export function getDistanceMeters(latitudeA, longitudeA, latitudeB, longitudeB) {
  const earthRadiusMeters = 6371000;
  const phiA = THREE.MathUtils.degToRad(latitudeA);
  const phiB = THREE.MathUtils.degToRad(latitudeB);
  const deltaPhi = THREE.MathUtils.degToRad(latitudeB - latitudeA);
  const deltaLambda = THREE.MathUtils.degToRad(longitudeB - longitudeA);
  const a = Math.sin(deltaPhi * 0.5) ** 2 +
    Math.cos(phiA) * Math.cos(phiB) * Math.sin(deltaLambda * 0.5) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function normalizeDegrees(degrees) {
  return ((degrees % 360) + 360) % 360;
}

export function getSunPosition(date, latitudeDegrees, longitudeDegrees) {
  const rad = Math.PI / 180;
  const latitude = latitudeDegrees * rad;
  const day = toJulian(date) - 2451545;
  const meanAnomaly = rad * (357.5291 + 0.98560028 * day);
  const equationOfCenter = rad * (
    1.9148 * Math.sin(meanAnomaly) +
    0.02 * Math.sin(2 * meanAnomaly) +
    0.0003 * Math.sin(3 * meanAnomaly)
  );
  const eclipticLongitude = meanAnomaly + equationOfCenter + rad * 102.9372 + Math.PI;
  const declination = Math.asin(Math.sin(eclipticLongitude) * Math.sin(rad * 23.4397));
  const rightAscension = Math.atan2(
    Math.sin(eclipticLongitude) * Math.cos(rad * 23.4397),
    Math.cos(eclipticLongitude)
  );
  const siderealTime = rad * (280.16 + 360.9856235 * day) - longitudeDegrees * rad;
  const hourAngle = siderealTime - rightAscension;
  const elevation = Math.asin(
    Math.sin(latitude) * Math.sin(declination) +
    Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)
  );
  const azimuthSouthBased = Math.atan2(
    Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(latitude) - Math.tan(declination) * Math.cos(latitude)
  );
  const azimuthNorthBased = azimuthSouthBased + Math.PI;

  return {
    elevation,
    azimuth: azimuthNorthBased
  };
}

export function toJulian(date) {
  return date.valueOf() / 86400000 - 0.5 + 2440588;
}
