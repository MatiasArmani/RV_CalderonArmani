import { getConfig, resetConfig } from './env'

describe('Config Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    jest.resetModules()
    resetConfig()
    process.env = { ...originalEnv }
  })

  afterAll(() => {
    process.env = originalEnv
  })

  it('should throw error if DATABASE_URL is missing', () => {
    delete process.env.DATABASE_URL

    expect(() => getConfig()).toThrow('DATABASE_URL is required')
  })

  it('should throw error if JWT_SECRET is missing', () => {
    process.env.DATABASE_URL = 'postgresql://test@localhost/test'
    delete process.env.JWT_SECRET

    expect(() => getConfig()).toThrow('JWT_SECRET is required')
  })

  it('should throw error if JWT_SECRET is too short', () => {
    process.env.DATABASE_URL = 'postgresql://test@localhost/test'
    process.env.JWT_SECRET = 'short'

    expect(() => getConfig()).toThrow('JWT_SECRET must be at least 32 characters')
  })

  it('should throw error if AWS_S3_BUCKET is missing', () => {
    process.env.DATABASE_URL = 'postgresql://test@localhost/test'
    process.env.JWT_SECRET = 'a-very-long-secret-key-that-is-at-least-32-characters'
    delete process.env.AWS_S3_BUCKET

    expect(() => getConfig()).toThrow('AWS_S3_BUCKET is required')
  })

  it('should return valid config when all required env vars are set', () => {
    // Reset PORT to test default value
    delete process.env.PORT
    process.env.DATABASE_URL = 'postgresql://test@localhost/test'
    process.env.JWT_SECRET = 'a-very-long-secret-key-that-is-at-least-32-characters'
    process.env.AWS_S3_BUCKET = 'test-bucket'
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'

    const config = getConfig()

    expect(config.DATABASE_URL).toBe('postgresql://test@localhost/test')
    expect(config.JWT_SECRET).toBe('a-very-long-secret-key-that-is-at-least-32-characters')
    expect(config.AWS_S3_BUCKET).toBe('test-bucket')
    expect(config.PORT).toBe(4000) // default
    expect(config.JWT_ACCESS_TTL).toBe(900) // default
  })

  it('should use custom PORT when provided', () => {
    process.env.DATABASE_URL = 'postgresql://test@localhost/test'
    process.env.JWT_SECRET = 'a-very-long-secret-key-that-is-at-least-32-characters'
    process.env.AWS_S3_BUCKET = 'test-bucket'
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
    process.env.PORT = '5000'

    const config = getConfig()

    expect(config.PORT).toBe(5000)
  })

  it('should throw error for invalid NODE_ENV', () => {
    process.env.DATABASE_URL = 'postgresql://test@localhost/test'
    process.env.JWT_SECRET = 'a-very-long-secret-key-that-is-at-least-32-characters'
    process.env.AWS_S3_BUCKET = 'test-bucket'
    process.env.AWS_ACCESS_KEY_ID = 'test-key'
    process.env.AWS_SECRET_ACCESS_KEY = 'test-secret'
    process.env.NODE_ENV = 'invalid'

    expect(() => getConfig()).toThrow('NODE_ENV must be one of')
  })
})
