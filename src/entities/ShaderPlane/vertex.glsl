uniform mat4 projectionMatrix;
uniform mat4 modelMatrix;
uniform mat4 viewMatrix;

attribute vec3 position;

varying vec4 vVertexPosition;

void main() {
  vec4 modelPosition = modelMatrix * vec4(position, 1.0);
  modelPosition.z += sin(modelPosition.x * 10.0) * 0.1; // Set the z-coordinate to 0 to ensure the plane is flat  
  gl_Position = projectionMatrix * viewMatrix * modelPosition;
  vVertexPosition = gl_Position;

}
