/**
 * Jest config for pure-Node logic (the facilities build pipeline).
 * Component/RN tests would need jest-expo — added later when needed.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/scripts'],
  transform: {
    '^.+\\.tsx?$': ['@swc/jest', { jsc: { parser: { syntax: 'typescript' }, target: 'es2022' } }],
  },
};
