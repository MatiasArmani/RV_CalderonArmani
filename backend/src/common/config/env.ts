/**
 * Environment configuration with validation
 * Fails fast if required variables are missing
 */

interface EnvConfig {
  // Database
  DATABASE_URL: string

  // JWT
  JWT_SECRET: string
  JWT_ACCESS_TTL: number
  JWT_REFRESH_TTL: number

  // AWS S3
  AWS_REGION: string
  AWS_S3_BUCKET: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string

  // App
  NODE_ENV: 'development' | 'production' | 'test'
  PORT: number
  FRONTEND_URL: string
}

function getEnvString(key: string, defaultValue?: string): string {
  const value = process.env[key] ?? defaultValue
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`)
  }
  return value
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key]
  if (value === undefined) {
    if (defaultValue !== undefined) {
      return defaultValue
    }
    throw new Error(`Environment variable ${key} is required but not set`)
  }
  const parsed = parseInt(value, 10)
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got: ${value}`)
  }
  return parsed
}

function validateConfig(): EnvConfig {
  const config: EnvConfig = {
    // Database
    DATABASE_URL: getEnvString('DATABASE_URL'),

    // JWT
    JWT_SECRET: getEnvString('JWT_SECRET'),
    JWT_ACCESS_TTL: getEnvNumber('JWT_ACCESS_TTL', 900), // 15 min default
    JWT_REFRESH_TTL: getEnvNumber('JWT_REFRESH_TTL', 2592000), // 30 days default

    // AWS S3
    AWS_REGION: getEnvString('AWS_REGION', 'us-east-1'),
    AWS_S3_BUCKET: getEnvString('AWS_S3_BUCKET'),
    AWS_ACCESS_KEY_ID: getEnvString('AWS_ACCESS_KEY_ID'),
    AWS_SECRET_ACCESS_KEY: getEnvString('AWS_SECRET_ACCESS_KEY'),

    // App
    NODE_ENV: getEnvString('NODE_ENV', 'development') as EnvConfig['NODE_ENV'],
    PORT: getEnvNumber('PORT', 4000),
    FRONTEND_URL: getEnvString('FRONTEND_URL', 'http://localhost:3000'),
  }

  // Additional validations
  if (config.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters')
  }

  if (!['development', 'production', 'test'].includes(config.NODE_ENV)) {
    throw new Error(`NODE_ENV must be one of: development, production, test. Got: ${config.NODE_ENV}`)
  }

  return config
}

// Export validated config (fails at startup if invalid)
let _config: EnvConfig | null = null

export function getConfig(): EnvConfig {
  if (!_config) {
    _config = validateConfig()
  }
  return _config
}

// For testing: reset config
export function resetConfig(): void {
  _config = null
}

export type { EnvConfig }
