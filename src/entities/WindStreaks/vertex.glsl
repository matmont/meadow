#define PI 3.141592653589793
// Spawn area beyond the screen edges, so a streak is never cut when its base wraps around
#define MARGIN 0.8

uniform float uTime;
uniform float uAspect;
uniform vec2 uOffset;
// Apparent size of the streaks: REFERENCE_DEPTH / depth
uniform float uScale;
uniform vec2 uDirection;
uniform float uLifetime;
uniform float uTravel;
uniform float uLength;
uniform float uWidth;
uniform float uAmplitude;
uniform float uFrequency;
uniform float uMinDensity;

// position.x: 0 at the tail, 1 at the head; position.y: -1 or +1 across the strip
attribute float aSeed;

varying float vAlpha;
varying float vSide;

float hash(float n) {
  return fract(sin(n) * 43758.5453123);
}

// Slow wind strength in [0, 1]: two incommensurate waves, so gusts never repeat exactly
float gust(float time) {
  float wave = sin(time * 0.21) * 0.5 + sin(time * 0.13 + 1.7) * 0.5;
  return wave * 0.5 + 0.5;
}

void main() {
  float travel = uTravel * uScale;
  float trailLength = uLength * uScale;
  float frequency = uFrequency / uScale;

  float progress = position.x;
  float side = position.y;

  // Every streak loops with its own period and phase, and each loop starts somewhere new
  float lifetime = uLifetime * mix(0.7, 1.3, hash(aSeed));
  float phase = hash(aSeed + 1.0);
  float cycleTime = uTime / lifetime + phase;
  float cycle = floor(cycleTime);
  float life = fract(cycleTime);
  float seed = aSeed * 17.0 + cycle * 3.7;

  // Fewer streaks between gusts. Decided once per loop, so a streak never pops mid-flight
  float density = mix(uMinDensity, 1.0, gust((cycle - phase) * lifetime));
  float visible = step(hash(seed + 5.0), density);

  // Screen space with the aspect ratio applied: y in [-1, 1], x in [-aspect, aspect]
  vec2 extent = vec2(uAspect, 1.0) + MARGIN * uScale;
  vec2 start = (vec2(hash(seed), hash(seed + 1.0)) * 2.0 - 1.0) * extent;
  // The camera offset makes streaks drift with the world instead of sticking to the lens
  start = mod(start + uOffset + extent, 2.0 * extent) - extent;

  // The head never stops. At birth the tail is clamped to the start of the path, so the
  // trail grows out of a point; near the end the trail shortens, so the tail catches up
  // with the moving head and the streak keeps its pointed shape while it fades
  float head = life * (travel + trailLength);
  float trail = trailLength * smoothstep(1.0, 0.6, life);
  float s = max(head - (1.0 - progress) * trail, 0.0);

  vec2 normal = vec2(-uDirection.y, uDirection.x);
  float wavePhase = hash(seed + 2.0) * 2.0 * PI;
  float amplitude = uAmplitude * uScale * mix(0.5, 1.5, hash(seed + 3.0));
  float angle = s * frequency + wavePhase;
  vec2 point = start + uDirection * s + normal * sin(angle) * amplitude;

  vec2 tangent = normalize(uDirection + normal * cos(angle) * amplitude * frequency);
  float taper = sin(progress * PI);
  point += vec2(-tangent.y, tangent.x) * side * uWidth * uScale * 0.5 * taper;

  vAlpha = visible * taper * mix(0.3, 1.0, progress) * sin(life * PI);
  vSide = side;
  gl_Position = vec4(point.x / uAspect, point.y, 0.0, 1.0);
}
