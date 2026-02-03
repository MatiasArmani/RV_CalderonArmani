import { render, screen } from '@testing-library/react'
import LoginPage from './page'

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
