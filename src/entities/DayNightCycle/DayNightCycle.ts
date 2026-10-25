import { Color, HemisphereLight } from "three";
import type { ColorRepresentation, DirectionalLight, Fog } from "three";
import type GUI from "lil-gui";
import { Entity } from "../../Entity";
import { COLORS } from "../../colors";
import { TIME_ZONE_COORDINATES } from "./timeZones";

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;
const DEG = Math.PI / 180;

// Both default to the reference city of the user's time zone
export interface DayNightCycleOptions {
  // Degrees, positive north
  latitude?: number;
  // Degrees, positive east
  longitude?: number;
}

interface LightingStop {
  // Solar elevation in degrees
  elevation: number;
  sunColor: Color;
  sunIntensity: number;
  // Background and fog. The follow camera looks down and never sees the sky, so this is
  // the haze over distant ground: keep it close to the scene's brightness, or it reads as a wall
  fogColor: Color;
  hemisphereSky: Color;
  hemisphereGround: Color;
  hemisphereIntensity: number;
}

function stop(
  elevation: number,
  sun: ColorRepresentation,
  sunIntensity: number,
  fog: ColorRepresentation,
  hemisphereSky: ColorRepresentation,
  hemisphereGround: ColorRepresentation,
  hemisphereIntensity: number,
): LightingStop {
  return {
    elevation,
    sunColor: new Color(sun),
    sunIntensity,
    fogColor: new Color(fog),
    hemisphereSky: new Color(hemisphereSky),
    hemisphereGround: new Color(hemisphereGround),
    hemisphereIntensity,
  };
}

// Sorted by elevation; values are clamped outside the range. Below the horizon the
// directional light acts as moonlight, so the scene stays readable at night
const STOPS: readonly LightingStop[] = [
  // Astronomical night
  stop(-18, 0x8094d0, 0.6, 0x0b1424, 0x2b3a70, 0x0e120c, 0.6),
  // End of civil twilight (blue hour)
  stop(-6, 0x8094d0, 0.4, 0x1c2640, 0x4a5590, 0x1a1f15, 0.6),
  // Sunrise / sunset
  stop(0, 0xff7f45, 0.8, 0x5a4a55, 0x9a8fb5, 0x2c2a1c, 0.5),
  // Golden hour
  stop(6, 0xffb36e, 2.5, 0xa89a95, 0xb7c3e0, 0x36402a, 0.5),
  stop(20, 0xffe8cc, 4.2, COLORS.sky, COLORS.sky, COLORS.hemisphereGround, 0.5),
  stop(45, COLORS.sunlight, 5, COLORS.sky, COLORS.sky, COLORS.hemisphereGround, 0.5),
];

// Drives the lighting from the real solar elevation at the user's local time. It owns the
// hemisphere fill light and writes into the sun light, background, and fog it receives;
// the sun direction never changes, so shadows stay put
export default class DayNightCycle extends Entity {
  latitude: number;
  readonly #longitude: number;
  readonly #sunLight: DirectionalLight;
  readonly #background: Color;
  readonly #fog: Fog;
  readonly #hemisphere: HemisphereLight;
  readonly #utcOffset = -new Date().getTimezoneOffset() * 60_000;
  readonly #settings = { realTime: true, speed: 0 };
  #time = Date.now();
  #elevation = 0;

  constructor(
    sunLight: DirectionalLight,
    background: Color,
    fog: Fog,
    { latitude, longitude }: DayNightCycleOptions = {},
  ) {
    const hemisphere = new HemisphereLight();
    super(hemisphere);

    const location = timeZoneLocation();
    this.latitude = latitude ?? location[0];
    this.#longitude = longitude ?? location[1];
    this.#sunLight = sunLight;
    this.#background = background;
    this.#fog = fog;
    this.#hemisphere = hemisphere;
  }

  get elevation(): number {
    return this.#elevation;
  }

  // Local clock hour of the simulated time
  get hour(): number {
    return (((this.#time + this.#utcOffset) % DAY_MS) + DAY_MS) % DAY_MS / HOUR_MS;
  }

  set hour(value: number) {
    this.#settings.realTime = false;
    this.#time += (value - this.hour) * HOUR_MS;
  }

  override onAdded(): void {
    this.#apply();
  }

  override update(delta: number): void {
    if (this.#settings.realTime) {
      this.#time = Date.now();
    } else {
      this.#time += delta * this.#settings.speed * HOUR_MS;
    }
    this.#apply();
  }

  override dispose(): void {
    this.#hemisphere.dispose();
  }

  override onDebugGuiCreate(folder: GUI): void {
    folder.add(this.#settings, "realTime").name("real time").listen();
    folder.add(this, "hour", 0, 24, 0.01).listen();
    folder.add(this.#settings, "speed", 0, 4, 0.01).name("speed (h/s)");
    folder.add(this, "latitude", -90, 90, 0.1);
    folder.add(this, "elevation").name("sun elevation").listen().disable();
  }

  #apply(): void {
    this.#elevation = solarElevation(this.#time, this.latitude, this.#longitude);

    let index = 1;
    while (index < STOPS.length - 1 && STOPS[index].elevation < this.#elevation) {
      index++;
    }
    const from = STOPS[index - 1];
    const to = STOPS[index];
    const t = Math.min(
      Math.max((this.#elevation - from.elevation) / (to.elevation - from.elevation), 0),
      1,
    );

    this.#sunLight.color.lerpColors(from.sunColor, to.sunColor, t);
    this.#sunLight.intensity = lerp(from.sunIntensity, to.sunIntensity, t);
    this.#hemisphere.color.lerpColors(from.hemisphereSky, to.hemisphereSky, t);
    this.#hemisphere.groundColor.lerpColors(
      from.hemisphereGround,
      to.hemisphereGround,
      t,
    );
    this.#hemisphere.intensity = lerp(
      from.hemisphereIntensity,
      to.hemisphereIntensity,
      t,
    );
    // Background and fog must match, or the ground plane's edge shows
    this.#background.lerpColors(from.fogColor, to.fogColor, t);
    this.#fog.color.copy(this.#background);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// Low-precision solar position from the Astronomical Almanac, accurate to about 1° and
// allocation-free. Uses UTC, so daylight saving time needs no special handling
function solarElevation(
  time: number,
  latitude: number,
  longitude: number,
): number {
  // Days since J2000.0 (2000-01-01 12:00 UTC)
  const d = time / DAY_MS - 10_957.5;
  const meanAnomaly = (357.529 + 0.98560028 * d) * DEG;
  const meanLongitude = 280.459 + 0.98564736 * d;
  const eclipticLongitude =
    (meanLongitude +
      1.915 * Math.sin(meanAnomaly) +
      0.02 * Math.sin(2 * meanAnomaly)) *
    DEG;
  const obliquity = (23.439 - 0.00000036 * d) * DEG;
  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLongitude),
    Math.cos(eclipticLongitude),
  );
  const declination = Math.asin(
    Math.sin(obliquity) * Math.sin(eclipticLongitude),
  );
  const siderealTime = (280.46061837 + 360.98564736629 * d) * DEG;
  const hourAngle = siderealTime + longitude * DEG - rightAscension;
  const lat = latitude * DEG;
  return (
    Math.asin(
      Math.sin(lat) * Math.sin(declination) +
        Math.cos(lat) * Math.cos(declination) * Math.cos(hourAngle),
    ) / DEG
  );
}

// [latitude, longitude] of the time zone's reference city. Zones without one (UTC, Etc/*)
// fall back to 45° north and the longitude implied by the UTC offset
function timeZoneLocation(): readonly [number, number] {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return TIME_ZONE_COORDINATES[zone] ?? [45, offsetLongitude()];
}

// Each standard time zone spans about 15° of longitude per hour of UTC offset
function offsetLongitude(): number {
  const year = new Date().getFullYear();
  // Minutes west of UTC; daylight saving time makes it smaller, so standard time is the max
  const standardOffset = Math.max(
    new Date(year, 0, 1).getTimezoneOffset(),
    new Date(year, 6, 1).getTimezoneOffset(),
  );
  return (-standardOffset / 60) * 15;
}
