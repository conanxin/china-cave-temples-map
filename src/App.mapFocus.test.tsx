import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

vi.mock('./map/AmapMap', () => ({
  AmapMap: ({ focusId }: { focusId?: number }) => <div data-testid="map-focus">{focusId == null ? 'national' : String(focusId)}</div>,
}))

import App from './App'

describe('map focus intent', () => {
  it('keeps the initial map national while retaining the default detail selection, then focuses after a user click', async () => {
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByTestId('map-focus')).toHaveTextContent('national')
    expect(screen.getByText('云冈石窟')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /01 云冈石窟/ }))
    expect(screen.getByTestId('map-focus')).toHaveTextContent('1')
  })
})
