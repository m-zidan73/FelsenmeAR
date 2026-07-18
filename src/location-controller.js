import { getDistanceMeters, getSunPosition } from "./geo.js";

export function createLocationController({ state, ui, config, THREE, setXRDebug }) {
  function updateGeoStatus() {
    const nearestLocation = state.userPosition ? getNearestAllowedLocation() : null;
    const distanceMeters = nearestLocation ? nearestLocation.distanceMeters : null;
    const isDistanceOk = typeof distanceMeters === "number" && distanceMeters <= config.allowedLocationRadiusMeters;

    if (typeof distanceMeters === "number") {
      const accuracy = state.userPosition && typeof state.userPosition.accuracy === "number"
        ? " +/-" + state.userPosition.accuracy.toFixed(0) + "m"
        : "";
      ui.geoDistanceValue.textContent = distanceMeters.toFixed(1) + "m" + accuracy;
    } else if (state.userPositionError) {
      ui.geoDistanceValue.textContent = "GPS error";
    } else {
      ui.geoDistanceValue.textContent = "waiting";
    }

    ui.geoGateValue.textContent = isDistanceOk ? "unlocked" : "locked";
    ui.geoDistanceValue.classList.toggle("is-ok", isDistanceOk);
    ui.geoDistanceValue.classList.toggle("is-locked", !isDistanceOk);
    ui.geoGateValue.classList.toggle("is-ok", isDistanceOk);
    ui.geoGateValue.classList.toggle("is-locked", !isDistanceOk);
  }

  function getPlacementGateStatus() {
    return {
      allowed: true,
      message: "Placement unlocked.",
      debug: "placement gate disabled"
    };
  }

  function getNearestAllowedLocation() {
    let nearest = null;

    config.allowedLocations.forEach((location, index) => {
      const distanceMeters = getDistanceMeters(
        state.userPosition.latitude,
        state.userPosition.longitude,
        location.latitude,
        location.longitude
      );

      if (!nearest || distanceMeters < nearest.distanceMeters) {
        nearest = {
          index,
          location,
          distanceMeters
        };
      }
    });

    return nearest;
  }

  function startLocationTracking() {
    if (!navigator.geolocation || state.geolocationWatchId !== null) {
      return;
    }

    state.geolocationWatchId = navigator.geolocation.watchPosition(
      (position) => {
        state.userPosition = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy
        };
        state.userPositionError = null;
        updateGeoStatus();
      },
      (error) => {
        state.userPositionError = error.message || error.code || "location unavailable";
        updateGeoStatus();
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000
      }
    );
  }

  function stopLocationTracking() {
    if (navigator.geolocation && state.geolocationWatchId !== null) {
      navigator.geolocation.clearWatch(state.geolocationWatchId);
    }
    state.geolocationWatchId = null;
  }

  function updateSunLightFromDeviceLocation() {
    if (!navigator.geolocation) {
      setXRDebug("sun uses fallback light: no geolocation");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const sun = getSunPosition(new Date(), position.coords.latitude, position.coords.longitude);
        applySunPosition(sun);
      },
      () => {
        setXRDebug("sun uses fallback light: location denied");
      },
      { enableHighAccuracy: false, maximumAge: 600000, timeout: 8000 }
    );
  }

  function applySunPosition(sun) {
    state.lastSunPosition = sun;
    const elevation = Math.max(sun.elevation, THREE.MathUtils.degToRad(5));
    const azimuth = sun.azimuth;
    const radius = 4;

    const x = Math.sin(azimuth) * Math.cos(elevation) * radius;
    const y = Math.sin(elevation) * radius;
    const z = Math.cos(azimuth) * Math.cos(elevation) * radius;

    state.sunDirection.set(x, y, z).normalize();
    positionSunLightAt(state.formationPlaced ? state.placementCenter : new THREE.Vector3());
    state.sunReady = true;
    setXRDebug("sun shadows: elevation " + THREE.MathUtils.radToDeg(sun.elevation).toFixed(1) + " deg");
  }

  function positionSunLightAt(target) {
    if (!state.sunLight) {
      return;
    }

    state.sunLight.target.position.copy(target);
    state.sunLight.position.copy(target).addScaledVector(state.sunDirection, 4);
    state.sunLight.target.updateMatrixWorld();
    state.sunLight.updateMatrixWorld();
  }

  return {
    getPlacementGateStatus,
    positionSunLightAt,
    startLocationTracking,
    stopLocationTracking,
    updateGeoStatus,
    updateSunLightFromDeviceLocation
  };
}