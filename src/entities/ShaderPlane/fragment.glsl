precision mediump float;

varying vec4 vVertexPosition;

void main() {
  gl_FragColor = vec4(0.5, 0.0, sin(vVertexPosition.z), 1.0);
}
