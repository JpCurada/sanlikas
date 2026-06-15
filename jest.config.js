/**
 * Jest config for pure-Node logic: the facilities build pipeline and the
 * routing engine (A*, hazard costs, center selection). These have no RN/native
 * deps — component/RN tests would need jest-expo, added later when needed.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/scripts', '<rootDir>/lib'],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } }],
  },
  // Mirror the tsconfig "@/*" -> "./*" path alias for Node-side tests.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
};
