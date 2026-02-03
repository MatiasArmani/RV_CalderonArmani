// Router
export { authRouter } from './auth.router'

// Service
export {
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  findUserByEmail,
  findUserById,
  registerCompanyWithAdmin,
  loginUser,
  refreshTokens,
  logoutUser,
  type JWTPayload,
  type TokenPair,
  type AuthUser,
  type RegisterInput,
  type LoginInput,
} from './auth.service'

// Middleware
export {
  authenticate,
  authorize,
  optionalAuthenticate,
  requireAdmin,
  requireUser,
  validateTenantAccess,
} from './auth.middleware'

// Validators
export { registerValidators, loginValidators } from './auth.validators'
