import { render, screen } from '@testing-library/react'
import LoginPage from './page'

// Mock useAuth hook
jest.mock('@/lib/auth', () => ({
  useAuth: () => ({
    login: jest.fn(),
    isAuthenticated: false,
    isLoading: false,
  }),
}))

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
  }),
}))

describe('LoginPage', () => {
  it('should render without crashing', () => {
    render(<LoginPage />)

    expect(screen.getByRole('heading', { name: /iniciar sesión/i })).toBeInTheDocument()
  })

  it('should render email input', () => {
    render(<LoginPage />)

    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
  })

  it('should render password input', () => {
    render(<LoginPage />)

    expect(screen.getByLabelText(/contraseña/i)).toBeInTheDocument()
  })

  it('should render submit button', () => {
    render(<LoginPage />)

    expect(screen.getByRole('button', { name: /iniciar sesión/i })).toBeInTheDocument()
  })

  it('should render link to register page', () => {
    render(<LoginPage />)

    expect(screen.getByRole('link', { name: /regístrate aquí/i })).toHaveAttribute('href', '/register')
  })
})
