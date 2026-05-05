import { render, screen } from '@testing-library/react'
import App from '../App'

test('renders BoggleSmurf heading', () => {
  render(<App />)
  expect(screen.getByText('BoggleSmurf')).toBeInTheDocument()
})
