import { validateGlbFormat, validateFileSize } from './processing'

describe('GLB Processing Utilities', () => {
  describe('validateGlbFormat', () => {
    it('should validate a correct GLB file', () => {
      // Create valid GLB header
      const buffer = Buffer.alloc(100)
      buffer.write('glTF', 0) // magic bytes
      buffer.writeUInt32LE(2, 4) // version 2
      buffer.writeUInt32LE(100, 8) // total length

      const result = validateGlbFormat(buffer)

      expect(result.valid).toBe(true)
      expect(result.version).toBe(2)
      expect(result.totalLength).toBe(100)
    })

    it('should reject file smaller than 12 bytes', () => {
      const buffer = Buffer.alloc(10)

      const result = validateGlbFormat(buffer)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('too small')
    })

    it('should reject file with invalid magic bytes', () => {
      const buffer = Buffer.alloc(100)
      buffer.write('INVALID', 0)
      buffer.writeUInt32LE(2, 4)
      buffer.writeUInt32LE(100, 8)

      const result = validateGlbFormat(buffer)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('missing glTF magic bytes')
    })

    it('should reject glTF version 1', () => {
      const buffer = Buffer.alloc(100)
      buffer.write('glTF', 0)
      buffer.writeUInt32LE(1, 4) // version 1
      buffer.writeUInt32LE(100, 8)

      const result = validateGlbFormat(buffer)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('Only version 2 is supported')
    })

    it('should reject file with significant size mismatch', () => {
      const buffer = Buffer.alloc(100)
      buffer.write('glTF', 0)
      buffer.writeUInt32LE(2, 4)
      buffer.writeUInt32LE(500, 8) // claims to be 500 bytes but is only 100

      const result = validateGlbFormat(buffer)

      expect(result.valid).toBe(false)
      expect(result.error).toContain('size mismatch')
    })

    it('should allow small size variance within tolerance', () => {
      // Create buffer slightly larger than declared (within 5% or 100 bytes)
      const buffer = Buffer.alloc(1000)
      buffer.write('glTF', 0)
      buffer.writeUInt32LE(2, 4)
      buffer.writeUInt32LE(980, 8) // claims 980, actual 1000 (2% diff)

      const result = validateGlbFormat(buffer)

      expect(result.valid).toBe(true)
    })

    it('should validate using actualFileSize when provided (range request)', () => {
      const buffer = Buffer.alloc(12)
      buffer.write('glTF', 0)
      buffer.writeUInt32LE(2, 4)
      buffer.writeUInt32LE(50000000, 8) // totalLength = 50MB

      const result = validateGlbFormat(buffer, 50000000)

      expect(result.valid).toBe(true)
      expect(result.version).toBe(2)
      expect(result.totalLength).toBe(50000000)
    })

    it('should reject when actualFileSize does not match GLB totalLength', () => {
      const buffer = Buffer.alloc(12)
      buffer.write('glTF', 0)
      buffer.writeUInt32LE(2, 4)
      buffer.writeUInt32LE(50000000, 8)

      const result = validateGlbFormat(buffer, 100000000) // 2x declared size

      expect(result.valid).toBe(false)
      expect(result.error).toContain('size mismatch')
    })
  })

  describe('validateFileSize', () => {
    it('should validate matching file sizes', () => {
      const result = validateFileSize(1000000, 1000000)

      expect(result.valid).toBe(true)
    })

    it('should allow file size within 5% tolerance', () => {
      const result = validateFileSize(1024000, 1000000) // 2.4% difference

      expect(result.valid).toBe(true)
    })

    it('should reject file size exceeding 5% tolerance', () => {
      const result = validateFileSize(1100000, 1000000) // 10% difference

      expect(result.valid).toBe(false)
      expect(result.error).toContain('size mismatch')
    })

    it('should handle small files correctly', () => {
      const result = validateFileSize(100, 95) // 5% difference exactly

      expect(result.valid).toBe(true)
    })
  })
})
