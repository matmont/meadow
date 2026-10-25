uniform vec3 uColor;
uniform float uOpacity;

varying float vAlpha;
varying float vSide;

void main() {
  // Soft edges across the strip, so thin streaks do not alias
  float edge = smoothstep(0.0, 0.6, 1.0 - abs(vSide));
  gl_FragColor = vec4(uColor, uOpacity * vAlpha * edge);
}
